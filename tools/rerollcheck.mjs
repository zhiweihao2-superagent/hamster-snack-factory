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
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.coins = 800; sh.shard = 40; sh.level = 3;
  sh.rats = [{ line: 'tank', tier: 3, mod: '', talents: [{id:'tank',lv:1},{id:'care',lv:1}] }];
  sh.squad = [0,-1,-1,-1,-1];
  window.__openShop(true);
  sh.detail = 0; sh.page = 'rat';
})()`)
await page.waitForTimeout(400)
const before = await page.evaluate(`(() => { const sh = window.__shop(); return { shard: sh.shard|0, lv: sh.rats[0].talents.map(t=>t.lv) }; })()`)
// 点两次「洗 6」（两段确认）
await page.mouse.click(343, 268)
await page.waitForTimeout(200)
await page.mouse.click(343, 268)
await page.waitForTimeout(300)
const after = await page.evaluate(`(() => { const sh = window.__shop(); return { shard: sh.shard|0, lv: sh.rats[0].talents.map(t=>t.lv) }; })()`)
await page.screenshot({ path: resolve(dir, 'tools', '_reroll.png') })
console.log(JSON.stringify({ before, after }), 'errors', errors)
await browser.close()
if (errors.length) process.exit(1)
