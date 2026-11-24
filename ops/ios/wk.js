// Playwright WebKit (macOS): opens a shader test page, presses "Run all" and prints the table when done.
const { webkit } = require('playwright');
const path = require('path');
(async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(process.argv[2]));
  await page.waitForTimeout(1500);
  console.log(await page.$eval('#info', e => e.innerText));
  await page.click('#all');
  await page.waitForFunction(() => !document.getElementById('all').disabled, null, { timeout: 1500000, polling: 1000 });
  const rows = await page.$$eval('#rows tr', trs => trs.map(tr => [...tr.querySelectorAll('td')].slice(0, 5).map(td => td.innerText.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log(rows.join('\n'));
  await browser.close();
})();
