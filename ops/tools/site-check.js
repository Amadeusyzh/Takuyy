// Page checker used by the site-check wrapper. Prints one JSON record per page.
// Arguments are post slugs, or "home" for the home page, where every Interactive Lab tab is clicked
// and its panel screenshotted (WebGL runs on SwiftShader).
const { chromium } = require('playwright');

(async () => {
  const slugs = process.argv.slice(2);
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {}),
  });
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
        const url = slug === 'home'
          ? `http://127.0.0.1:4000/Takuyy/${lang}`
          : `http://127.0.0.1:4000/Takuyy/${lang}blog/2026/${slug}/`;
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => null);
        await page.waitForTimeout(2000);
        if (slug !== 'home') {
          await page.evaluate(() => window.MathJax && MathJax.startup && MathJax.startup.promise).catch(() => {});
        }
        const info = await page.evaluate(() => {
          const imgs = [...document.querySelectorAll('.blog-fig img')];
          const text = (document.querySelector('#markdown-content') || document.body).innerText;
          const vw = document.documentElement.clientWidth;
          // elements sticking out past the viewport, outside horizontal scroll boxes (outermost only)
          const clipped = (el) => {
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
              if (getComputedStyle(p).overflowX !== 'visible') return true;
            }
            return false;
          };
          const offenders = [];
          for (const el of document.querySelectorAll('article *, .lab *')) {
            const b = el.getBoundingClientRect();
            if (b.width === 0 || b.right <= vw + 1 || clipped(el)) continue;
            const pe = el.parentElement, pb = pe && pe.getBoundingClientRect();
            if (pb && pb.right > vw + 1 && !clipped(pe) && pe.closest('article, .lab')) continue;
            offenders.push(`<${el.tagName.toLowerCase()}> w=${Math.round(b.width)} right=${Math.round(b.right)} ${(el.textContent || '').replace(/\s+/g, ' ').slice(0, 60)}`);
          }
          return {
            figs: imgs.length,
            broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
            widgets: document.querySelectorAll('.blog-widget').length,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: vw,
            unrenderedMath: (text.match(/\$\$|\\\[|\\\(/g) || []).length,
            wideMath: document.querySelectorAll('mjx-container.mjx-wide').length,
            offenders: offenders.slice(0, 4),
            labTabs: [...document.querySelectorAll('.lab-tabs button')].map((b) => b.id),
          };
        });
        const name = `${slug}-${lang ? lang.slice(0, 2) : 'en'}-${w}`;
        if (slug === 'home') {
          info.labPanels = {};
          for (const id of info.labTabs) {
            await page.click('#' + id).catch(() => {});
            await page.waitForTimeout(3000);
            const panel = await page.$('#' + id.replace('lab-tab-', 'lab-'));
            if (!panel) { info.labPanels[id] = 'missing'; continue; }
            await panel.scrollIntoViewIfNeeded();
            info.labPanels[id] = await panel.evaluate((p) => {
              const c = p.querySelector('canvas');
              return {
                canvas: c ? `${c.width}x${c.height}` : 'none', w: Math.round(p.getBoundingClientRect().width), hidden: p.hidden,
                stats: (p.innerText.split('\n').find((l) => /fps/.test(l)) || '').slice(0, 90),
              };
            });
            await panel.screenshot({ path: `/tmp/shots/${name}-${id}.png` }).catch(() => {});
          }
        } else {
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
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `/tmp/shots/${name}.png` });
        if (mobile && slug !== 'home') {
          for (const [sel, tag] of [['.blog-fig', 'fig'], ['.blog-widget', 'wid']]) {
            const els = await page.$$(sel);
            for (let i = 0; i < els.length; i++) {
              await els[i].scrollIntoViewIfNeeded();
              await els[i].screenshot({ path: `/tmp/shots/${name}-${tag}${String(i).padStart(2, '0')}.png` }).catch(() => {});
            }
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
