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
  const sh = window.__shop(); sh.coins = 5000; sh.level = 2;
  sh.rats = [{line:'tank',tier:3,mod:'',talents:[{id:'tank',lv:3}]}];
  sh.squad = [0,-1,-1,-1,-1];
  window.__openShop(true);
  sh.page = 'gacha';
})()`)
await page.waitForTimeout(400)
// 点"十连 540"（坐标来自 drawGacha 布局）
await page.mouse.click(282, 302)
await page.waitForTimeout(700)
await page.screenshot({ path: resolve(dir, 'tools', '_gacha_ten.png') })
const st = await page.evaluate(`(() => { const sh = window.__shop(); return { coins: sh.coins|0, rats: sh.rats.length, pity: sh.gachaPity|0, shard: sh.shard|0 }; })()`)
console.log(JSON.stringify(st), 'errors', errors)
await browser.close()
if (errors.length) process.exit(1)
