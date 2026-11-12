// Measures how a Lab demo variant behaves in Chrome on Windows (ANGLE -> Direct3D 11, shaders compiled by FXC).
// For every variants/<name>.js and every browser configuration: the renderer string, the time each WebGL call
// blocked the page's main thread, long tasks, the largest event-loop stall, the time until the first frame is
// shown, and the stats line after 15 s. Output: one JSON object per run on stdout and in report/results.json.
// ops/winrun-fix added: a trail of the stats line, the number of images presented, an orbit drag and the time
// to reach AA 16/16 in the Steps and Slice views.
// ops/winrun-verify-resp (independent check of the SDF fix) adds:
//  - per band (fence) timing: time from fenceSync to the first clientWaitSync that reports it signalled, with
//    the scissored pixel count, so the longest single draw can be read off;
//  - gaps between animation frames of the page (a stalled compositor shows as a long gap);
//  - a stress phase: 16 shapes, max steps at the slider maximum, Steps view, then Shaded view;
//  - a lost-context phase: WEBGL_lose_context lose + restore, then a second loss within a minute (paused),
//    then a tap to resume;
//  - a per-config plan of variants (PLAN below), so the first browser of the job is not always the same variant.
// Usage: node measure.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIR = __dirname;
const OUT = process.env.REPORT_DIR || path.join(DIR, 'report');
fs.mkdirSync(OUT, { recursive: true });
const ALL_CONFIGS = [
  { name: 'default', args: ['--ignore-gpu-blocklist'] },
  { name: 'd3d11', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] },
  { name: 'warp', args: ['--use-angle=d3d11-warp', '--ignore-gpu-blocklist'] },
];
const PLAN = {
  default: ['a-fix', 'b-orig', 'c-fix', 'd-nosw', 'e-big'],
  d3d11: ['a-fix', 'b-orig', 'd-nosw', 'e-big'],
  warp: ['a-fix', 'b-orig', 'e-big'],
};
const CONFIGS = process.env.CONFIGS ? ALL_CONFIGS.filter((c) => process.env.CONFIGS.split(',').includes(c.name)) : ALL_CONFIGS;
const ONLY = process.env.VARIANTS ? process.env.VARIANTS.split(',') : null;
const BUDGET_MS = +(process.env.BUDGET_MS || 50 * 60 * 1000);
const T_START = Date.now();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join(DIR, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(d);
  });
});

function withTimeout(p, ms, fallback) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INSTRUMENT = () => {
  const m = window.__m = { calls: [], longtasks: [], maxLag: 0, lags: [], t0: performance.now(), presents: 0, draws: 0, rows: [],
    fences: [], rafGaps: [], maxRafGap: 0, ctx: [] };
  const P = WebGL2RenderingContext.prototype;
  for (const name of ['compileShader', 'linkProgram', 'getShaderParameter', 'getProgramParameter', 'useProgram', 'drawArrays',
    'clientWaitSync', 'getActiveUniform', 'getUniformLocation', 'getError', 'readPixels', 'finish', 'texImage2D', 'flush', 'fenceSync']) {
    const orig = P[name];
    if (!orig) continue;
    P[name] = function () {
      const a = performance.now();
      const r = orig.apply(this, arguments);
      const dt = performance.now() - a;
      if (dt > 20) m.calls.push({ name, ms: Math.round(dt), at: Math.round(a) });
      return r;
    };
  }
  const da = P.drawArrays;
  P.drawArrays = function () {
    m.draws++;
    if (!this.getParameter(this.FRAMEBUFFER_BINDING)) m.presents++;
    return da.apply(this, arguments);
  };
  let lastPx = null;
  const sc = P.scissor;
  P.scissor = function (x, y, w, h) { lastPx = w * h; if (m.rows.length < 300) m.rows.push(h); return sc.apply(this, arguments); };
  const fsy = P.fenceSync;
  P.fenceSync = function () {
    const s = fsy.apply(this, arguments);
    if (s) { s.__t0 = performance.now(); s.__px = lastPx; lastPx = null; }
    return s;
  };
  const cws = P.clientWaitSync;
  P.clientWaitSync = function (s) {
    const r = cws.apply(this, arguments);
    if (s && s.__t0 && !s.__d && (r === this.ALREADY_SIGNALED || r === this.CONDITION_SATISFIED)) {
      s.__d = 1;
      if (m.fences.length < 20000) m.fences.push([Math.round(s.__t0), Math.round(performance.now() - s.__t0), s.__px]);
    }
    return r;
  };
  for (const ev of ['webglcontextlost', 'webglcontextrestored', 'webglcontextcreationerror']) {
    window.addEventListener(ev, () => m.ctx.push([ev, Math.round(performance.now())]), true);
  }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) m.longtasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) }); })
      .observe({ type: 'longtask', buffered: true });
  } catch (e) { /* no longtask API */ }
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), lag = now - last - 50;
    if (lag > m.maxLag) m.maxLag = lag;
    if (lag > 100) m.lags.push({ at: Math.round(last), ms: Math.round(lag) });
    last = now;
  }, 50);
  let lastRaf = 0;
  const rl = (t) => {
    if (lastRaf) {
      const g = t - lastRaf;
      if (g > m.maxRafGap) m.maxRafGap = g;
      if (g > 100 && m.rafGaps.length < 500) m.rafGaps.push([Math.round(lastRaf), Math.round(g)]);
    }
    lastRaf = t;
    requestAnimationFrame(rl);
  };
  requestAnimationFrame(rl);
};

const stats = (page) => withTimeout(page.evaluate(() => ((document.querySelector('.lab-stats') || {}).textContent || '').replace(/\s+/g, ' ')), 30000, 'evaluate timed out');
const snap = (page) => withTimeout(page.evaluate(() => {
  const m = window.__m;
  return { t: Math.round(performance.now()), presents: m.presents, draws: m.draws, maxLag: Math.round(m.maxLag), nCalls: m.calls.length,
    nLong: m.longtasks.length, nLags: m.lags.length, nFences: m.fences.length, nRaf: m.rafGaps.length };
}), 30000, null);
const since = (page, s0) => withTimeout(page.evaluate((s0) => {
  const m = window.__m;
  const fences = m.fences.slice(s0.nFences);
  const ms = fences.map((f) => f[1]).sort((a, b) => a - b);
  const top = fences.slice().sort((a, b) => b[1] - a[1]).slice(0, 6);
  const raf = m.rafGaps.slice(s0.nRaf);
  return {
    presents: m.presents - s0.presents, draws: m.draws - s0.draws,
    blockingCalls: m.calls.slice(s0.nCalls, s0.nCalls + 20),
    longtasks: m.longtasks.slice(s0.nLong).filter((l) => l.ms > 100).slice(0, 25),
    lags: m.lags.slice(s0.nLags, s0.nLags + 25),
    maxLag: Math.round(Math.max.apply(null, [0].concat(m.lags.slice(s0.nLags).map((l) => l.ms)))),
    fences: { n: ms.length, max: ms.length ? ms[ms.length - 1] : null, p50: ms.length ? ms[ms.length >> 1] : null,
      p90: ms.length ? ms[Math.floor(ms.length * 0.9)] : null, top: top },
    rafGapsOver100: raf.length, maxRafGap: Math.max.apply(null, [0].concat(raf.map((g) => g[1]))), rafTop: raf.slice().sort((a, b) => b[1] - a[1]).slice(0, 6),
    ctx: m.ctx.slice(),
  };
}, s0), 30000, null);

async function waitAA(page, ms, re) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await stats(page);
    if (/AA 16\/16/.test(s) && (!re || re.test(s))) return { ms: Date.now() - t0, stats: s.slice(0, 160) };
    await sleep(200);
  }
  return { ms: null, stats: (await stats(page)).slice(0, 160) };
}
async function waitText(page, ms, re) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await stats(page);
    if (re.test(s)) return { ms: Date.now() - t0, stats: s.slice(0, 200) };
    await sleep(100);
  }
  return { ms: null, stats: (await stats(page)).slice(0, 200) };
}

server.listen(0, async () => {
  const port = server.address().port;
  const results = [];
  for (const cfg of CONFIGS) {
    for (const v of PLAN[cfg.name]) {
      if (ONLY && !ONLY.includes(v)) continue;
      const rec = { variant: v, config: cfg.name };
      if (Date.now() - T_START > BUDGET_MS) { rec.error = 'skipped: time budget'; results.push(rec); continue; }
      let browser;
      try {
        browser = await chromium.launch(process.env.LOCAL_SWIFTSHADER
          ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } // local check of this script
          : { channel: process.env.CHANNEL || 'chrome', headless: true, args: cfg.args });
        const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
        const errs = [];
        page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
        page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); });
        await page.addInitScript(INSTRUMENT);
        const tNav = Date.now();
        await page.goto(`http://127.0.0.1:${port}/harness.html?v=${v}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        rec.renderer = await withTimeout(page.evaluate(() => {
          const c = document.createElement('canvas'), g = c.getContext('webgl2');
          if (!g) return 'no webgl2';
          const e = g.getExtension('WEBGL_debug_renderer_info');
          const x = ['KHR_parallel_shader_compile', 'EXT_disjoint_timer_query_webgl2'].filter((n) => g.getSupportedExtensions().indexOf(n) >= 0);
          const r = (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) + ' | ' + x.join(' ');
          const lc = g.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext(); // do not keep a second context alive
          return r;
        }), 60000, 'evaluate timed out');
        const s00 = await snap(page);
        // wait for the first frame: the stats line shows a frame rate or the AA counter
        let first = null, stuck = 0;
        const trail = [];
        while (Date.now() - tNav < 180000) {
          const a = Date.now();
          const s = await withTimeout(page.evaluate(() => (document.querySelector('.lab-stats') || {}).textContent || ''), 30000, null);
          const took = Date.now() - a;
          if (took > stuck) stuck = took;
          const ss = s ? s.replace(/\s+/g, ' ').slice(0, 160) : s;
          if (!trail.length || trail[trail.length - 1][1] !== ss) trail.push([Date.now() - tNav, ss]);
          if (s && /(\d+(\.\d+)?\s*fps|AA \d+)/.test(s)) { first = { ms: Date.now() - tNav, stats: ss }; break; }
          await sleep(100);
        }
        rec.firstFrame = first;
        rec.longestEvaluateWait = stuck;
        const tEnd = Date.now() + 15000;
        while (Date.now() < tEnd) {
          const s = await stats(page);
          if (!trail.length || trail[trail.length - 1][1] !== s.slice(0, 160)) trail.push([Date.now() - tNav, s.slice(0, 160)]);
          await sleep(300);
        }
        rec.trail = trail.slice(0, 40);
        rec.after15s = await stats(page);
        const m = await withTimeout(page.evaluate(() => window.__m), 30000, null);
        if (m) {
          rec.blockingCalls = m.calls.slice(0, 30);
          rec.longtasks = m.longtasks.filter((l) => l.ms > 100).slice(0, 30);
          rec.lags = m.lags.slice(0, 30);
          rec.maxLag = Math.round(m.maxLag);
          rec.presents = m.presents;
          rec.draws = m.draws;
          rec.bandRows = m.rows.slice(0, 60);
          rec.firstFences = m.fences.slice(0, 40); // [t0 page ms, ms until seen signalled, scissored pixels]
          rec.maxRafGap = Math.round(m.maxRafGap);
          rec.rafGaps = m.rafGaps.slice(0, 30);
        }
        rec.start = await since(page, s00);
        await withTimeout(page.screenshot({ path: path.join(OUT, `${cfg.name}-${v}.png`) }), 30000, null);
        const box = await withTimeout(page.locator('canvas').boundingBox(), 30000, null);
        // orbit drag across the canvas: 80 moves, 50 ms apart
        if (box) {
          const s0 = await snap(page);
          const td = Date.now();
          const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
          await withTimeout(page.mouse.move(cx, cy), 30000, null);
          await withTimeout(page.mouse.down(), 30000, null);
          for (let i = 1; i <= 80; i++) {
            await withTimeout(page.mouse.move(cx + 220 * Math.sin(i / 80 * Math.PI * 2), cy + 40 * Math.sin(i / 20 * Math.PI)), 30000, null);
            await sleep(50);
          }
          await withTimeout(page.mouse.up(), 30000, null);
          const dragMs = Date.now() - td;
          const d = await since(page, s0);
          rec.drag = Object.assign({ ms: dragMs, statsAfter: await stats(page) }, d || {});
          rec.drag.settle = await waitAA(page, 60000);
        }
        // the other views, from the settled state
        rec.views = {};
        for (const [name, sel, re] of [['steps', '[data-view="1"]', /Steps/], ['slice', '[data-view="2"]', /Slice/], ['carved', '[data-preset="1"]', /8 shapes/]]) {
          const s0 = await snap(page);
          await withTimeout(page.click(sel, { timeout: 30000 }), 40000, null);
          const aa = await waitAA(page, 90000, re);
          rec.views[name] = Object.assign({ aa }, (await since(page, s0)) || {});
        }
        // stress: back to Blobs and Shaded, add shapes up to 16, max steps at the slider maximum, Steps view, Shaded view
        if (box) {
          rec.stress = {};
          const s0 = await snap(page);
          await withTimeout(page.click('[data-preset="0"]', { timeout: 30000 }), 40000, null);
          await withTimeout(page.click('[data-view="0"]', { timeout: 30000 }), 40000, null);
          await withTimeout(page.click('[data-tool="add"]', { timeout: 30000 }), 40000, null);
          let n = 0;
          for (let i = 0; i < 14 && n < 16; i++) {
            const x = box.x + box.width * (0.12 + 0.76 * ((i * 0.37) % 1)), y = box.y + box.height * (0.72 + 0.2 * ((i * 0.53) % 1));
            await withTimeout(page.mouse.click(x, y), 30000, null);
            await sleep(150);
            const s = await stats(page);
            const mm = s.match(/(\d+) shapes/);
            n = mm ? +mm[1] : n;
          }
          rec.stress.shapes = n;
          rec.stress.maxSteps = await withTimeout(page.$eval('[data-input="steps"]', (el) => {
            el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); return el.value;
          }), 30000, null);
          await withTimeout(page.click('[data-tool="move"]', { timeout: 30000 }), 40000, null);
          const aa0 = await waitAA(page, 90000, /16 shapes/);
          rec.stress.shaded = Object.assign({ aa: aa0 }, (await since(page, s0)) || {});
          const s1 = await snap(page);
          await withTimeout(page.click('[data-view="1"]', { timeout: 30000 }), 40000, null);
          const aa1 = await waitAA(page, 90000, /Steps/);
          rec.stress.steps = Object.assign({ aa: aa1 }, (await since(page, s1)) || {});
          // a short orbit drag under the stress settings
          const s2 = await snap(page);
          const td = Date.now();
          const cx = box.x + box.width / 2, cy = box.y + box.height * 0.3;
          await withTimeout(page.mouse.move(cx, cy), 30000, null);
          await withTimeout(page.mouse.down(), 30000, null);
          for (let i = 1; i <= 40; i++) {
            await withTimeout(page.mouse.move(cx + 150 * Math.sin(i / 40 * Math.PI * 2), cy + 20 * Math.sin(i / 10 * Math.PI)), 30000, null);
            await sleep(50);
          }
          await withTimeout(page.mouse.up(), 30000, null);
          rec.stress.drag = Object.assign({ ms: Date.now() - td }, (await since(page, s2)) || {});
          rec.stress.drag.settle = await waitAA(page, 90000);
          await withTimeout(page.screenshot({ path: path.join(OUT, `${cfg.name}-${v}-stress.png`) }), 30000, null);
        }
        // lost context: lose, restore, wait for the image; a second loss within a minute; a tap to resume
        if (!/orig/.test(v)) {
          rec.lose = {};
          const s0 = await snap(page);
          const lc = await withTimeout(page.evaluate(() => {
            const c = document.querySelector('#lab-sdf canvas'), g = c.getContext('webgl2');
            window.__lc = g.getExtension('WEBGL_lose_context');
            if (!window.__lc) return 'no WEBGL_lose_context';
            window.__lc.loseContext();
            return 'lost';
          }), 30000, null);
          rec.lose.first = lc;
          rec.lose.lostText = await waitText(page, 5000, /lost/);
          await sleep(500);
          await withTimeout(page.evaluate(() => window.__lc && window.__lc.restoreContext()), 30000, null);
          rec.lose.restoredAA = await waitAA(page, 90000);
          rec.lose.afterRestore = await since(page, s0);
          const s1 = await snap(page);
          await withTimeout(page.evaluate(() => window.__lc && window.__lc.loseContext()), 30000, null);
          await sleep(500);
          await withTimeout(page.evaluate(() => window.__lc && window.__lc.restoreContext()), 30000, null);
          rec.lose.pausedText = await waitText(page, 5000, /paused/);
          await sleep(1000);
          const sp = await snap(page);
          await sleep(1500);
          rec.lose.drawsIn1500msPaused = await withTimeout(page.evaluate((d0) => window.__m.draws - d0, sp.draws), 30000, null);
          if (box) await withTimeout(page.mouse.click(box.x + box.width / 2, box.y + box.height / 2), 30000, null);
          rec.lose.resumedAA = await waitAA(page, 90000);
          rec.lose.afterResume = await since(page, s1);
          await withTimeout(page.screenshot({ path: path.join(OUT, `${cfg.name}-${v}-restored.png`) }), 30000, null);
        }
        rec.errors = errs.slice(0, 12);
        rec.totalMs = Date.now() - tNav;
      } catch (e) {
        rec.error = String(e).slice(0, 300);
      }
      if (browser) await withTimeout(browser.close(), 30000, null);
      console.log(JSON.stringify(rec));
      results.push(rec);
      fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    }
  }
  server.close();
});
