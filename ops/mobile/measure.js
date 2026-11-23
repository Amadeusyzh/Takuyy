// Mobile check of the home-page Interactive Lab on the live site (or URL env).
// node measure.js <browser: webkit|chromium> <device: Playwright device name> [tab ...]
// For each Lab tab (default: all, in page order) a fresh page is opened with the device's viewport, scale and
// touch, the Lab is scrolled into view, the tab is tapped, and for 25 s we record: the WebGL renderer and
// extensions, WebGL calls that blocked the main thread for more than 30 ms, event-loop stalls (a 50 ms interval
// timer; WebKit has no Long Tasks API), how long page.evaluate itself waited (a frozen page answers late),
// the panel's stats line over time, errors, and a screenshot. One JSON line per tab on stdout and in OUT.
const pw = require('playwright');
const fs = require('fs'), path = require('path');
const [browserName, deviceName, ...tabsArg] = process.argv.slice(2);
const URL = process.env.URL || 'https://amadeusyzh.github.io/Takuyy/';
const OUT = process.env.REPORT_DIR || path.join(__dirname, 'report');
fs.mkdirSync(OUT, { recursive: true });
const TABS = tabsArg.length ? tabsArg : ['pt', 'rs', 'gs', 'cloth', 'fov', 'rc', 'mpm', 'sdf', 'sky'];
const SECS = +(process.env.SECS || 25);

const INSTRUMENT = () => {
  window.__m = { calls: [], lags: [], maxLag: 0 };
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  if (P) {
    for (const name of ['compileShader', 'linkProgram', 'getShaderParameter', 'getProgramParameter', 'useProgram', 'drawArrays',
      'drawElements', 'clientWaitSync', 'getActiveUniform', 'getUniformLocation', 'getError', 'readPixels', 'finish', 'texImage2D', 'getExtension']) {
      const orig = P[name];
      if (!orig) continue;
      P[name] = function () {
        const a = performance.now();
        const r = orig.apply(this, arguments);
        const dt = performance.now() - a;
        if (dt > 30) {
          const panel = this.canvas && this.canvas.closest && this.canvas.closest('[id^="lab-"]');
          window.__m.calls.push({ name, ms: Math.round(dt), at: Math.round(a), panel: panel ? panel.id : '' });
        }
        return r;
      };
    }
  }
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), lag = now - last - 50;
    if (lag > window.__m.maxLag) window.__m.maxLag = lag;
    if (lag > 100) window.__m.lags.push({ at: Math.round(last), ms: Math.round(lag) });
    last = now;
  }, 50);
};

function withTimeout(p, ms, fallback) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
}

(async () => {
  const device = pw.devices[deviceName];
  if (!device) throw new Error('unknown device ' + deviceName);
  const browser = await pw[browserName].launch(browserName === 'chromium'
    ? { args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] } : {});
  const results = [];
  for (const tab of TABS) {
    const rec = { browser: browserName, device: deviceName, tab };
    let ctx;
    try {
      ctx = await browser.newContext({ ...device });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); });
      await page.addInitScript(INSTRUMENT);
      await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
      rec.gl = await withTimeout(page.evaluate(() => {
        const c = document.createElement('canvas'), g = c.getContext('webgl2');
        if (!g) return { webgl2: false };
        const e = g.getExtension('WEBGL_debug_renderer_info');
        return {
          webgl2: true,
          renderer: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER),
          parallelCompile: !!g.getExtension('KHR_parallel_shader_compile'),
          colorBufferFloat: !!g.getExtension('EXT_color_buffer_float'),
          timerQuery: !!g.getExtension('EXT_disjoint_timer_query_webgl2'),
          maxTex: g.getParameter(g.MAX_TEXTURE_SIZE),
        };
      }), 30000, 'evaluate timed out');
      const lab = await page.$('#lab');
      if (lab) await lab.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      const t0 = await withTimeout(page.evaluate(() => performance.now()), 30000, -1);
      rec.tabFound = !!(await page.$('#lab-tab-' + tab));
      if (rec.tabFound) await withTimeout(page.tap('#lab-tab-' + tab), 30000, null);
      const panelSel = '#lab-' + tab;
      const timeline = [];
      let lastText = null, longestWait = 0;
      const tStart = Date.now();
      while (Date.now() - tStart < SECS * 1000) {
        const a = Date.now();
        const s = await withTimeout(page.evaluate((sel) => {
          const p = document.querySelector(sel);
          const st = p && p.querySelector('.lab-stats');
          return st ? st.textContent.replace(/\s+/g, ' ').slice(0, 140) : '(no stats)';
        }, panelSel), 30000, null);
        const waited = Date.now() - a;
        if (waited > longestWait) longestWait = waited;
        if (s !== lastText) { timeline.push([Date.now() - tStart, s]); lastText = s; }
        await new Promise((r) => setTimeout(r, 500));
      }
      rec.timeline = timeline.slice(0, 20);
      rec.longestEvaluateWait = longestWait;
      const m = await withTimeout(page.evaluate(() => window.__m), 30000, null);
      if (m) {
        rec.blockingCalls = m.calls.filter((c) => c.at >= t0 - 50).slice(0, 20);
        rec.blockingBeforeTap = m.calls.filter((c) => c.at < t0 - 50).slice(0, 10);
        rec.lagsAfterTap = m.lags.filter((l) => l.at >= t0 - 50).slice(0, 20);
        rec.lagsBeforeTap = m.lags.filter((l) => l.at < t0 - 50).slice(0, 10);
        rec.maxLag = Math.round(m.maxLag);
      }
      rec.canvas = await withTimeout(page.evaluate((sel) => {
        const c = document.querySelector(sel + ' canvas');
        return c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null;
      }, panelSel), 30000, null);
      rec.errors = [...new Set(errs)].slice(0, 10);
      const panel = await page.$(panelSel);
      if (panel) await withTimeout(panel.screenshot({ path: path.join(OUT, `${browserName}-${deviceName.replace(/\W+/g, '_')}-${tab}.png`) }), 30000, null);
    } catch (e) {
      rec.error = String(e).slice(0, 300);
    }
    if (ctx) await withTimeout(ctx.close(), 30000, null);
    console.log(JSON.stringify(rec));
    results.push(rec);
    fs.writeFileSync(path.join(OUT, `${browserName}-${deviceName.replace(/\W+/g, '_')}.json`), JSON.stringify(results, null, 1));
  }
  await browser.close();
})();
