import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', e => errs.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.coins = 1200; sh.level = 3;
  const mk = (line, tier) => ({ line, tier, mod: '', talents: [{id: line, lv: 2}], skills: [{id: 'chongya', lv: 2}] });
  sh.rats = [mk('blade', 3), mk('hex', 3), mk('tank', 3)];
  sh.squad = [0,1,2];
  sh.books = { qiexiao: 2, huoqiu: 1 };
  window.__openShop(true);
  sh.mainTab = 'shop';
})()`)
await page.waitForTimeout(600)
await page.screenshot({ path: resolve(dir, 'tools', '_book_shop.png') })
await page.evaluate(`(() => { const sh = window.__shop(); sh.page = 'rat'; sh.detail = 0; sh.detailTab = 1; })()`)
await page.waitForTimeout(600)
await page.screenshot({ path: resolve(dir, 'tools', '_book_detail.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
