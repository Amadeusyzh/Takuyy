// Compile-cost measurement for Lab shader programs in Chrome on Windows (ANGLE -> HLSL -> FXC -> D3D11).
// For every program shaders/<name>.vert + shaders/<name>.frag, in a fresh page of a fresh browser (so no
// program cache can hit), it measures in the page:
//   statusMs : getShaderParameter(fs, COMPILE_STATUS) right after compileShader (waits for GLSL -> HLSL)
//   pollMaxMs: the longest single getProgramParameter(COMPLETION_STATUS_KHR) poll (should be ~0)
//   readyMs  : linkProgram -> COMPLETION_STATUS_KHR true (FXC + driver; the page is free meanwhile)
//   linkStatusMs: getProgramParameter(LINK_STATUS) after completion
//   syncLinkMs: (second program object, same sources, other page) linkProgram + LINK_STATUS without polling:
//               what the demos do today (blocks the page) -- only with SYNC=1
//   drawMs   : first 1-pixel draw + readPixels (draw-time compiles)
// It also records Chrome trace events of the gpu.angle category (D3DCompile, ShaderTranslateTaskD3D::run,
// GetPixelExecutableTask::run, LinkTaskD3D::link ...), saves the exact HLSL that went into D3DCompile
// (hlsl/<name>.ps.hlsl) when the trace carries it, and ANGLE's translated source (WEBGL_debug_shaders).
// Usage: node compile.js [name-substring ...]; env REPS (default 1), CHROME_ARGS (comma separated).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const OUT = path.join(process.env.REPORT_DIR || path.join(DIR, 'report'), 'compile');
fs.mkdirSync(path.join(OUT, 'hlsl'), { recursive: true });
const filt = process.argv.slice(2);
const names = fs.readdirSync(path.join(DIR, 'shaders')).filter((f) => f.endsWith('.frag')).map((f) => f.slice(0, -5))
  .filter((n) => !filt.length || filt.some((s) => n.includes(s))).sort();
const REPS = +(process.env.REPS || 1);
const ARGS = (process.env.CHROME_ARGS || '--use-angle=d3d11,--ignore-gpu-blocklist').split(',').filter(Boolean);
const withTimeout = (p, ms, fb) => Promise.race([p, new Promise((r) => setTimeout(() => r(fb), ms))]);

const PAGE_FN = async ({ vs, fs, webgl1 }) => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 4; document.body.appendChild(c);
  const gl = c.getContext(webgl1 ? 'webgl' : 'webgl2', { antialias: false });
  if (!gl) return { error: 'no context' };
  for (const e of gl.getSupportedExtensions()) if (!/debug|lose_context/i.test(e)) gl.getExtension(e);
  const dbg = gl.getExtension('WEBGL_debug_shaders');
  const par = gl.getExtension('KHR_parallel_shader_compile');
  const now = () => performance.now();
  const r = { parallelExt: !!par, debugShadersExt: !!dbg };
  const t0 = now();
  const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, vs); gl.compileShader(v);
  const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
  r.compileCallMs = now() - t0;
  let a = now();
  const okF = gl.getShaderParameter(f, gl.COMPILE_STATUS);
  r.statusMs = now() - a;
  const okV = gl.getShaderParameter(v, gl.COMPILE_STATUS);
  if (!okF || !okV) { r.error = 'compile: ' + (gl.getShaderInfoLog(f) || gl.getShaderInfoLog(v)).slice(0, 400); return r; }
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, 'aPos');
  a = now(); gl.linkProgram(p); r.linkCallMs = now() - a;
  const tl = now();
  r.polls = 0; r.pollMaxMs = 0;
  if (par) {
    for (;;) {
      const b = now(); const done = gl.getProgramParameter(p, par.COMPLETION_STATUS_KHR); const d = now() - b;
      r.polls++; if (d > r.pollMaxMs) r.pollMaxMs = d;
      if (done) break;
      if (now() - tl > 120000) { r.error = 'not complete after 120 s'; return r; }
      await new Promise((res) => setTimeout(res, 4));
    }
  }
  r.readyMs = now() - tl;
  a = now(); const okL = gl.getProgramParameter(p, gl.LINK_STATUS); r.linkStatusMs = now() - a;
  if (!okL) { r.error = 'link: ' + (gl.getProgramInfoLog(p) || '').slice(0, 400); }
  a = now();
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); gl.getUniformLocation(p, u.name); }
  r.uniformsMs = now() - a; r.uniforms = n;
  // first draw: a full-screen triangle on attribute 0, scissored to one pixel, then readPixels to sync
  try {
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 4, 4); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, 1, 1);
    a = now(); gl.useProgram(p); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    r.drawMs = now() - a;
    a = now(); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); r.draw2Ms = now() - a;
  } catch (e) { r.drawError = String(e).slice(0, 200); }
  if (dbg) { r.translatedFS = dbg.getTranslatedShaderSource(f); r.translatedVS = dbg.getTranslatedShaderSource(v); }
  r.renderer = (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })();
  return r;
};

// Synchronous variant: what the Lab code does today (compile, link, LINK_STATUS at once)
const SYNC_FN = ({ vs, fs, webgl1 }) => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 4;
  const gl = c.getContext(webgl1 ? 'webgl' : 'webgl2', { antialias: false });
  for (const e of gl.getSupportedExtensions()) if (!/debug|lose_context/i.test(e)) gl.getExtension(e);
  const t0 = performance.now();
  const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, vs); gl.compileShader(v);
  const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
  gl.getShaderParameter(v, gl.COMPILE_STATUS); gl.getShaderParameter(f, gl.COMPILE_STATUS);
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  const ok = gl.getProgramParameter(p, gl.LINK_STATUS);
  return { syncTotalMs: performance.now() - t0, ok };
};

function traceSummary(buf) {
  let j; try { j = JSON.parse(buf.toString()); } catch (e) { return { error: 'trace parse: ' + e.message }; }
  const evs = Array.isArray(j) ? j : j.traceEvents || [];
  const want = /D3DCompile|ShaderTranslateTask|GetPixelExecutableTask|GetVertexExecutableTask|LinkTaskD3D|ProgramD3D::link|CompileEvent::wait|MainLinkLoadEvent::wait|LoadTaskD3D|RunWorkerTask|GetProgramiv|GetShaderiv|DoLinkProgram|DoCompileShader|DoDrawArrays|DoReadPixels|DoUseProgram|GetProgramInfo|WaitForCmd|WaitSync/;
  const out = []; const open = new Map(); let sources = [];
  for (const e of evs) {
    if (!e || !e.name || !want.test(e.name)) continue;
    const key = e.pid + ':' + e.tid + ':' + e.name;
    if (e.ph === 'X') out.push({ name: e.name, ms: +(e.dur / 1000).toFixed(1), tid: e.tid, ts: e.ts });
    else if (e.ph === 'B') { const st = open.get(key) || []; st.push(e); open.set(key, st); }
    else if (e.ph === 'E') { const st = open.get(key) || []; const b = st.pop(); if (b) out.push({ name: e.name, ms: +((e.ts - b.ts) / 1000).toFixed(1), tid: e.tid, ts: b.ts, args: b.args }); }
    const src = (e.args && (e.args.source || (e.args.data && e.args.data.source))) || null;
    if (src && /D3DCompile/.test(e.name)) sources.push(src);
    if (e.ph === 'X' || e.ph === 'B') { if (e.args && e.args.source && /D3DCompile/.test(e.name)) { /* counted above */ } }
  }
  out.sort((a, b) => a.ts - b.ts);
  return { events: out.filter((e) => e.ms >= 1).map((e) => ({ name: e.name, ms: e.ms, tid: e.tid })), sources, totalEvents: evs.length };
}

(async () => {
  const results = [];
  const resPath = path.join(OUT, process.env.OUTNAME || 'compile.json');
  for (let rep = 0; rep < REPS; rep++) {
    for (const name of names) {
      const fsrc = fs.readFileSync(path.join(DIR, 'shaders', name + '.frag'), 'utf8');
      const vsrc = fs.readFileSync(path.join(DIR, 'shaders', name + '.vert'), 'utf8');
      const webgl1 = !/^\s*#version\s+300\s+es/m.test(fsrc);
      const rec = { name, rep, webgl1, fsChars: fsrc.length };
      let browser;
      try {
        browser = await chromium.launch({ channel: process.env.CHANNEL === 'none' ? undefined : (process.env.CHANNEL || 'chrome'), headless: true, args: ARGS });
        const page = await browser.newPage();
        await page.setContent('<!doctype html><body></body>');
        let traced = false;
        try { await browser.startTracing(page, { categories: ['gpu.angle', 'gpu', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.angle'] }); traced = true; } catch (e) { rec.traceError = String(e).slice(0, 200); }
        const r = await withTimeout(page.evaluate(PAGE_FN, { vs: vsrc, fs: fsrc, webgl1 }), 180000, { error: 'evaluate timed out' });
        if (traced) {
          const buf = await withTimeout(browser.stopTracing(), 60000, null);
          if (buf) {
            const t = traceSummary(buf);
            rec.trace = t.events; rec.traceTotalEvents = t.totalEvents; rec.traceError = t.error;
            t.sources.forEach((s, i) => fs.writeFileSync(path.join(OUT, 'hlsl', `${name}.d3dcompile${i}.hlsl`), s));
            rec.d3dSources = t.sources.length;
          }
        }
        if (r.translatedFS && rep === 0) {
          fs.writeFileSync(path.join(OUT, 'hlsl', `${name}.translated.ps.hlsl`), r.translatedFS);
          fs.writeFileSync(path.join(OUT, 'hlsl', `${name}.translated.vs.hlsl`), r.translatedVS || '');
        }
        delete r.translatedFS; delete r.translatedVS;
        for (const k of Object.keys(r)) if (typeof r[k] === 'number' && !Number.isInteger(r[k])) r[k] = +r[k].toFixed(1);
        Object.assign(rec, r);
        if (process.env.SYNC === '1' && !rec.error) {
          const p2 = await browser.newPage();
          // a fresh browser would be needed to avoid the program cache; use a changed source (comment) instead
          const s = await withTimeout(p2.evaluate(SYNC_FN, { vs: vsrc, fs: fsrc.replace(/\n/, '\n// sync copy\n'), webgl1 }), 180000, { error: 'sync timed out' });
          rec.syncTotalMs = s.syncTotalMs !== undefined ? +s.syncTotalMs.toFixed(1) : s.error;
        }
      } catch (e) {
        rec.error = String(e).slice(0, 300);
      }
      if (browser) await withTimeout(browser.close(), 30000, null);
      console.log(JSON.stringify(rec));
      results.push(rec);
      fs.writeFileSync(resPath, JSON.stringify(results, null, 1));
    }
  }
})();
