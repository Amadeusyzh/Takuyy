// Opens the home page, selects one Lab tab and samples the panel's stats line over time (SwiftShader).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(process.argv[2], '_site'), tab = process.argv[3] || 'rc', width = +(process.argv[4] || 1100);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith('/Takuyy')) { res.writeHead(404); res.end(); return; }
  let f = path.join(root, u.slice(7)); if (u.endsWith('/')) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
server.listen(0, async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const mobile = width < 500;
  const p = await b.newPage({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/Takuyy/`, { waitUntil: 'domcontentloaded' });
  await p.click('#lab-tab-' + tab);
  await p.$eval('#lab-' + tab, (el) => el.scrollIntoView());
  const t0 = Date.now();
  for (const s of [3, 8, 15, 25, 40]) {
    await p.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
    const txt = await p.$eval('#lab-' + tab, (el) => { const c = el.querySelector('[class*=stats], .lab-stats, small'); return c ? c.textContent : el.innerText.split('\n').filter((l) => /fps/.test(l)).join(' | '); });
    console.log(s + 's', txt.trim().slice(0, 160));
  }
  console.log('errors', errs.slice(0, 3));
  await b.close(); server.close();
});
