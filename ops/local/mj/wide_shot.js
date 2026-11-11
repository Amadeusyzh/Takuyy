// Counts .mjx-wide formulas per page and width, and screenshots the first one (context included).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(process.argv[2], '_site'), slugs = process.argv.slice(3), MJ = path.join(__dirname, 'package');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff': 'font/woff' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(root, u.slice(7)); if (u.endsWith('/')) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
server.listen(0, async () => {
  const b = await chromium.launch();
  for (const slug of slugs) for (const [l, pre] of [['en', ''], ['zh', 'zh-cn/'], ['ja', 'ja-jp/']]) for (const w of [360, 1100]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 });
    await p.route(/cdn\.jsdelivr\.net\/npm\/mathjax@3\.2\.2\/es5\/(.*)$/, (r) => {
      const f = path.join(MJ, 'es5', r.request().url().replace(/^.*\/es5\//, '').split('?')[0]);
      r.fulfill({ status: fs.existsSync(f) ? 200 : 404, body: fs.existsSync(f) ? fs.readFileSync(f) : '', contentType: types[path.extname(f)] || 'application/octet-stream' });
    });
    await p.goto(`http://127.0.0.1:${server.address().port}/Takuyy/${pre}blog/2026/${slug}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.MathJax && MathJax.startup && MathJax.startup.promise, null, { timeout: 30000 }).catch(() => {});
    await p.evaluate(() => MathJax.startup.promise).catch(() => {});
    const n = await p.$$eval('mjx-container.mjx-wide', (els) => els.length);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(`${slug} ${l} ${w}: mjx-wide=${n} scrollWidth=${sw}`);
    if (n && w === 360 && l === 'en') {
      const el = await p.$('mjx-container.mjx-wide');
      await p.evaluate((e) => { const blk = e.closest('p,li,td') || e; blk.scrollIntoView({ block: 'center' }); }, el);
      const box = await p.evaluate((e) => { const r = (e.closest('p,li,td') || e).getBoundingClientRect(); return { x: 0, y: Math.max(0, r.y - 10), width: 360, height: Math.min(400, r.height + 20) }; }, el);
      await p.screenshot({ path: `/tmp/claude-0/-home-user-takuyy/0c443e9e-c3ce-5795-8d74-9c6cb688c2ab/scratchpad/mj/wide-${slug.slice(0, 20)}.png`, clip: box });
    }
    await p.close();
  }
  await b.close(); server.close();
});
