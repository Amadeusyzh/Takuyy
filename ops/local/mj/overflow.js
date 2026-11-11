// Usage: node overflow.js <repo> <slug> [<slug> ...]   (env LANGS=en,zh,ja WIDTH=390)
// Serves <repo>/_site under /Takuyy/, serves MathJax 3.2.2 from the local npm package instead of the CDN,
// waits for typesetting, then lists the elements that stick out past the viewport (outside scroll boxes).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const repo = path.resolve(process.argv[2]), slugs = process.argv.slice(3);
const root = path.join(repo, '_site');
const MJ = path.join(__dirname, 'package');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith('/Takuyy')) { res.writeHead(404); res.end(); return; }
  let f = path.join(root, u.slice(7)); if (u.endsWith('/')) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
server.listen(0, async () => {
  const port = server.address().port;
  const width = +(process.env.WIDTH || 390);
  const browser = await chromium.launch();
  for (const slug of slugs) {
    for (const l of (process.env.LANGS || 'en').split(',')) {
      const pre = { en: '', zh: 'zh-cn/', ja: 'ja-jp/' }[l];
      const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500, deviceScaleFactor: 1 });
      await page.route(/cdn\.jsdelivr\.net\/npm\/mathjax@3\.2\.2\/es5\/(.*)$/, (route) => {
        const rel = route.request().url().replace(/^.*\/es5\//, '').split('?')[0];
        const f = path.join(MJ, 'es5', rel);
        if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
        route.fulfill({ status: 200, contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f),
          headers: { 'access-control-allow-origin': '*' } });
      });
      await page.goto(`http://127.0.0.1:${port}/Takuyy/${pre}blog/2026/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const ok = await page.waitForFunction(() => window.MathJax && MathJax.startup && MathJax.startup.promise, null, { timeout: 30000 }).then(() => true).catch(() => false);
      if (ok) await page.evaluate(() => MathJax.startup.promise).catch(() => {});
      await page.waitForTimeout(1500);
      const r = await page.evaluate((vw) => {
        const out = [];
        const inScroller = (el) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
          }
          return false;
        };
        for (const el of document.querySelectorAll('article *')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.right <= vw + 1) continue;
          if (inScroller(el)) continue;
          // report only the outermost offender
          const parent = el.parentElement, pb = parent && parent.getBoundingClientRect();
          if (pb && pb.right > vw + 1 && !inScroller(parent) && parent.closest('article')) continue;
          out.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? el.className : '').slice(0, 60),
            right: Math.round(b.right), w: Math.round(b.width), text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 120),
            ctx: (el.closest('p,li,td,th,figure,div.blog-fig,div.blog-widget,table,h2,h3,mjx-container') || el).tagName.toLowerCase() });
        }
        return { mathjax: !!(window.MathJax && MathJax.startup), sw: document.documentElement.scrollWidth, out: out.slice(0, 15) };
      }, width);
      console.log(`== ${slug} ${l} ${width}px  mathjax=${r.mathjax} scrollWidth=${r.sw}`);
      for (const o of r.out) console.log(`   <${o.tag} ${o.cls}> right=${o.right} w=${o.w} in=${o.ctx} | ${o.text}`);
      await page.close();
    }
  }
  await browser.close(); server.close();
});
