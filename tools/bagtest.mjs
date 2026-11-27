import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
// 造一只白板 + 抽 40 次道具池，看证是否进背包
const st = await page.evaluate(`(() => {
  const sh = window.__shop(); sh.coins = 20000; sh.level = 2;
  sh.rats = [{ line: 'none', tier: 1, mod: '', talents: [] }];
  sh.squad = [0, -1, -1, -1, -1]; sh.gears = {};
  window.__openShop(true);
  let gearPrizes = 0;
  for (let i = 0; i < 40; i++){
    const r = window.__slot();
    if (r.prize && r.prize.indexOf('证') >= 0) gearPrizes++;
  }
  return { gearPrizes, bag: sh.gears, ratsTier: sh.rats.map(r => r.line + ':' + r.tier) };
})()`)
// 进详情页看「可用转职证」
await page.evaluate(`(() => { const sh = window.__shop(); sh.detail = 0; sh.page = 'rat'; })()`)
await page.waitForTimeout(500)
await page.screenshot({ path: resolve(dir, 'tools', '_gearbag.png') })
console.log(JSON.stringify(st).slice(0, 400), 'errors', errors)
await browser.close()
