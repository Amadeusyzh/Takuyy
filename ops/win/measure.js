// Measures how a Lab demo variant behaves in Chrome on Windows (ANGLE -> Direct3D 11, shaders compiled by FXC).
// For every variants/<name>.js and every browser configuration: the renderer string, the time each WebGL call
// blocked the page's main thread, long tasks, the largest event-loop stall, the time until the first frame is
// shown, and the stats line after 15 s. Output: one JSON object per run on stdout and in report/results.json.
// Usage: node measure.js [variant ...]   (default: all variants)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIR = __dirname;
const OUT = process.env.REPORT_DIR || path.join(DIR, 'report');
fs.mkdirSync(OUT, { recursive: true });
const variants = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(path.join(DIR, 'variants')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const CONFIGS = [
  { name: 'default', args: ['--ignore-gpu-blocklist'] },
  { name: 'd3d11', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] },
  { name: 'warp', args: ['--use-angle=d3d11-warp', '--ignore-gpu-blocklist'] },
];
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

const INSTRUMENT = () => {
  window.__m = { calls: [], longtasks: [], maxLag: 0, lags: [], t0: performance.now() };
  const P = WebGL2RenderingContext.prototype;
  for (const name of ['compileShader', 'linkProgram', 'getShaderParameter', 'getProgramParameter', 'useProgram', 'drawArrays',
    'clientWaitSync', 'getActiveUniform', 'getUniformLocation', 'getError', 'readPixels', 'finish', 'texImage2D']) {
    const orig = P[name];
    if (!orig) continue;
    P[name] = function () {
      const a = performance.now();
      const r = orig.apply(this, arguments);
      const dt = performance.now() - a;
      if (dt > 20) window.__m.calls.push({ name, ms: Math.round(dt), at: Math.round(a) });
      return r;
    };
  }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.longtasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) }); })
      .observe({ type: 'longtask', buffered: true });
  } catch (e) { /* no longtask API */ }
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), lag = now - last - 50;
    if (lag > window.__m.maxLag) window.__m.maxLag = lag;
    if (lag > 100) window.__m.lags.push({ at: Math.round(last), ms: Math.round(lag) });
    last = now;
  }, 50);
};

server.listen(0, async () => {
  const port = server.address().port;
  const results = [];
  for (const cfg of CONFIGS) {
    for (const v of variants) {
      const rec = { variant: v, config: cfg.name };
      let browser;
      try {
        browser = await chromium.launch({ channel: process.env.CHANNEL || 'chrome', headless: true, args: cfg.args });
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
          return (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) + (g.getExtension('KHR_parallel_shader_compile') ? ' | KHR_parallel_shader_compile' : '');
        }), 60000, 'evaluate timed out');
        // wait for the first frame: the stats line shows a frame rate or the AA counter
        let first = null, polls = 0, stuck = 0;
        while (Date.now() - tNav < 180000) {
          const a = Date.now();
          const s = await withTimeout(page.evaluate(() => (document.querySelector('.lab-stats') || {}).textContent || ''), 30000, null);
          const took = Date.now() - a;
          if (took > stuck) stuck = took;
          polls++;
          if (s && /(\d+(\.\d+)?\s*fps|AA \d+)/.test(s)) { first = { ms: Date.now() - tNav, stats: s.replace(/\s+/g, ' ').slice(0, 160) }; break; }
          await new Promise((r) => setTimeout(r, 250));
        }
        rec.firstFrame = first;
        rec.longestEvaluateWait = stuck;
        await new Promise((r) => setTimeout(r, 15000));
        rec.after15s = await withTimeout(page.evaluate(() => (document.querySelector('.lab-stats') || {}).textContent || ''), 30000, 'evaluate timed out');
        const m = await withTimeout(page.evaluate(() => window.__m), 30000, null);
        if (m) {
          rec.blockingCalls = m.calls.slice(0, 30);
          rec.longtasks = m.longtasks.filter((l) => l.ms > 100).slice(0, 30);
          rec.maxLag = Math.round(m.maxLag);
        }
        rec.errors = errs.slice(0, 10);
        await withTimeout(page.screenshot({ path: path.join(OUT, `${cfg.name}-${v}.png`) }), 30000, null);
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
