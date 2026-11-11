// Usage: node site-check-local.js <repo-dir> <slug|home> [<slug> ...]
// Serves <repo>/_site under /Takuyy/ on a free port and checks pages in en, zh-cn and ja-jp at 390 and
// 1100 px, with SwiftShader WebGL.
// CDN requests (MathJax, jQuery, fonts) are blocked in this sandbox, so their errors are ignored. Raw LaTeX
// can widen pages here, so treat scrollWidth as indicative only.
// "home" opens the home page and clicks every Interactive Lab tab.
// Screenshots go to /tmp/shots-<pid>/.
// Env: LANGS=en,zh,ja (default all), WIDTHS=390,1100 (default both), LAB_TABS=lab-tab-x,lab-tab-y (home: only these tabs).
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2]);
const targets = process.argv.slice(3);
const root = path.join(repo, '_site');
const shots = `/tmp/shots-${process.pid}`;
fs.mkdirSync(shots, { recursive: true });
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.ply': 'application/octet-stream', '.pdf': 'application/pdf',
};
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith('/Takuyy')) { res.writeHead(404); res.end(); return; }
  let f = path.join(root, u.slice('/Takuyy'.length));
  if (u.endsWith('/')) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
});
const ignorable = (t) => /ERR_|net::|Failed to load resource|MathJax|jQuery|\$ is not|mermaid|polyfill|googleapis|jsdelivr|cdnjs/i.test(t);

server.listen(0, async () => {
  const port = server.address().port;
  const out = [];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const t of targets) {
    const langs = (process.env.LANGS || 'en,zh,ja').split(',').map((l) => ({ en: '', zh: 'zh-cn/', ja: 'ja-jp/' }[l.trim()]));
    const widths = (process.env.WIDTHS || '390,1100').split(',').map(Number);
    for (const lang of langs) {
      for (const w of widths) {
        const mobile = w < 500;
        const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', (e) => { if (!ignorable(e.message)) errors.push(String(e.message).slice(0, 200)); });
        page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text().slice(0, 200)); });
        const url = t === 'home'
          ? `http://127.0.0.1:${port}/Takuyy/${lang}`
          : `http://127.0.0.1:${port}/Takuyy/${lang}blog/2026/${t}/`;
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
        await page.waitForTimeout(1500);
        const name = `${t}-${lang ? lang.slice(0, 2) : 'en'}-${w}`;
        const info = await page.evaluate(() => {
          const imgs = [...document.querySelectorAll('.blog-fig img')];
          return {
            figs: imgs.length,
            broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
            widgets: document.querySelectorAll('.blog-widget').length,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            labTabs: [...document.querySelectorAll('.lab-tabs button')].map((b) => b.id),
          };
        });
        for (const c of await page.$$('.blog-widget canvas, .blog-widget svg')) {
          const b = await c.boundingBox();
          if (!b || b.width < 20) continue;
          await c.scrollIntoViewIfNeeded();
          const bb = await c.boundingBox();
          await page.mouse.move(bb.x + bb.width * 0.4, bb.y + bb.height * 0.5);
          await page.mouse.down();
          await page.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height * 0.4, { steps: 8 });
          await page.mouse.up();
        }
        if (mobile) {
          let i = 0;
          for (const el of await page.$$('.blog-fig, .blog-widget')) {
            await el.scrollIntoViewIfNeeded();
            await el.screenshot({ path: `${shots}/${name}-el${String(i++).padStart(2, '0')}.png` }).catch(() => {});
          }
        }
        if (t === 'home') {
          const only = (process.env.LAB_TABS || '').split(',').filter(Boolean);
          for (const id of info.labTabs.filter((x) => !only.length || only.includes(x))) {
            await page.click('#' + id).catch(() => {});
            await page.waitForTimeout(2000);
            const panel = await page.$('#' + id.replace('lab-tab-', 'lab-'));
            if (panel) {
              await panel.scrollIntoViewIfNeeded();
              await panel.screenshot({ path: `${shots}/${name}-${id}.png` }).catch(() => {});
            }
          }
        }
        await page.screenshot({ path: `${shots}/${name}.png` });
        out.push({ page: name, http: resp ? resp.status() : 'ERR', ...info, errors: [...new Set(errors)].slice(0, 6) });
        await page.close();
      }
    }
  }
  await browser.close();
  server.close();
  console.log(JSON.stringify(out, null, 1));
  console.log('screenshots in ' + shots);
});
