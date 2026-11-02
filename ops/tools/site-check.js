// Page checker used by the site-check wrapper. Prints one JSON record per page.
const { chromium } = require('playwright');

(async () => {
  const slugs = process.argv.slice(2);
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {});
  const out = [];
  for (const slug of slugs) {
    for (const lang of ['', 'zh-cn/', 'ja-jp/']) {
      for (const w of [390, 1100]) {
        const mobile = w < 500;
        const page = await browser.newPage({
          viewport: { width: w, height: 900 }, deviceScaleFactor: mobile ? 2 : 1,
          isMobile: mobile, hasTouch: mobile,
        });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
        const url = `http://127.0.0.1:4000/Takuyy/${lang}blog/2026/${slug}/`;
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => null);
        await page.waitForTimeout(2000);
        const info = await page.evaluate(() => {
          const imgs = [...document.querySelectorAll('.blog-fig img')];
          const text = (document.querySelector('#markdown-content') || document.body).innerText;
          return {
            figs: imgs.length,
            broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
            widgets: document.querySelectorAll('.blog-widget').length,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            unrenderedMath: (text.match(/\$\$|\\\[|\\\(/g) || []).length,
          };
        });
        const targets = await page.$$('.blog-widget canvas, .blog-widget svg');
        for (const t of targets) {
          const b = await t.boundingBox();
          if (!b || b.width < 20) continue;
          await t.scrollIntoViewIfNeeded();
          const bb = await t.boundingBox();
          await page.mouse.move(bb.x + bb.width * 0.4, bb.y + bb.height * 0.5);
          await page.mouse.down();
          await page.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height * 0.4, { steps: 8 });
          await page.mouse.up();
        }
        const name = `${slug}-${lang ? lang.slice(0, 2) : 'en'}-${w}`;
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `/tmp/shots/${name}.png` });
        if (mobile) {
          const els = await page.$$('.blog-fig, .blog-widget');
          for (let i = 0; i < els.length; i++) {
            await els[i].scrollIntoViewIfNeeded();
            await els[i].screenshot({ path: `/tmp/shots/${name}-el${String(i).padStart(2, '0')}.png` }).catch(() => {});
          }
        }
        out.push({ page: name, http: resp ? resp.status() : 'ERR', ...info, errors: [...new Set(errors)].slice(0, 6) });
        await page.close();
      }
    }
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})();
