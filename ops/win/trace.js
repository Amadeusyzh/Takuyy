// node trace.js <variant> [dpr] [seconds] [angle]: records a Chrome trace while the demo runs and lists what the
// renderer main thread and the GPU main thread were doing in every slice longer than 150 ms.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIR = __dirname, v = process.argv[2] || 'orig', dpr = +(process.argv[3] || 1), secs = +(process.argv[4] || 8);
const angleArgs = process.env.WIN ? (process.env.ANGLE ? ['--use-angle=' + process.env.ANGLE, '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'])
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const server = http.createServer((req, res) => {
  const f = path.join(DIR, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); res.end(d); });
});
function analyze(trace) {
  const ev = trace.traceEvents || trace;
  const names = {};
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names[e.pid + ':' + e.tid] = e.args.name;
  const byThread = {};
  for (const e of ev) {
    if (e.ph !== 'X' || !e.dur) continue;
    const k = e.pid + ':' + e.tid;
    (byThread[k] = byThread[k] || []).push(e);
  }
  const out = [];
  for (const k in byThread) {
    const tn = names[k] || '?';
    if (!/CrRendererMain|CrGpuMain|VizCompositor|Compositor|GpuWatchdog/.test(tn)) continue;
    const list = byThread[k].sort((a, b) => a.ts - b.ts);
    // top-level slices: not contained in an earlier slice
    let end = -1;
    for (const e of list) {
      if (e.ts >= end) {
        if (e.dur > (+process.env.MIN_MS || 150) * 1000) {
          const kids = list.filter((c) => c !== e && c.ts >= e.ts && c.ts + c.dur <= e.ts + e.dur && c.dur > 0.5 * e.dur).sort((a, b) => b.dur - a.dur || a.ts - b.ts);
          out.push({ thread: tn, name: e.name, ms: Math.round(e.dur / 1000), at: Math.round(e.ts / 1000), chain: kids.slice(0, 12).map((c) => c.name + ' ' + Math.round(c.dur / 1000)) });
        }
        end = e.ts + e.dur;
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
module.exports = { analyze };
if (require.main === module) server.listen(0, async () => {
  const browser = await chromium.launch(process.env.WIN ? { channel: 'chrome', headless: true, args: angleArgs } : { args: angleArgs });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  await page.addInitScript((dpr) => {
    Object.defineProperty(window, 'devicePixelRatio', { get: () => dpr });
    const m = window.__m = { lag: [], t0: Date.now() - performance.now() };
    let last = performance.now();
    setInterval(() => { const now = performance.now(); const lag = now - last - 50; if (lag > 60) m.lag.push([Math.round(last), Math.round(lag)]); last = now; }, 50);
  }, dpr);
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'blink', 'cc', 'gpu', 'viz', 'ipc', 'mojom', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.decoder', 'benchmark', 'renderer.scheduler', 'v8.execute'] });
  await page.goto(`http://127.0.0.1:${server.address().port}/harness.html?v=${v}`);
  await page.waitForTimeout(secs * 1000);
  const lag = await page.evaluate(() => window.__m.lag);
  console.log('event-loop lags (page time, ms):', JSON.stringify(lag));
  const buf = await browser.stopTracing();
  const tr = JSON.parse(buf.toString());
  const res = analyze(tr);
  fs.writeFileSync(path.join(DIR, 'trace-' + v + '.json.summary'), JSON.stringify(res, null, 1));
  for (const r of res) console.log(r.thread, r.at, r.ms + 'ms', r.name, '|', r.chain.join(' > '));
  await browser.close(); server.close();
});
