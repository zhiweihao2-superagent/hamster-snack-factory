import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

/* 先把仓鼠栏塞满 12 只，再去十连 */
await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 5000; sh.level = 2; sh.rats = []; sh.box = [];
  for (let i = 0; i < 12; i++) sh.rats.push({ line: 'none', tier: 1, mod: '', talents: [{ id: 'tank', lv: 1 }] });
  sh.squad = [0, 1, 2, -1, -1];
  window.__openShop(true);
  sh.page = 'gacha';
})()`)
await page.waitForTimeout(300)
await page.mouse.click(282, 314)
await page.waitForTimeout(1700)
await page.screenshot({ path: resolve(dir, 'tools', '_box_reveal.png') })
await page.mouse.click(195, 760)
await page.waitForTimeout(300)

const st = await page.evaluate(`(() => {
  const sh = window.__shop();
  return { rats: sh.rats.length, box: (sh.box || []).length, cap: window.GAME.rules.boxCap, shard: sh.shard | 0 };
})()`)
await page.evaluate(`window.__shop().page = 'box'`)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_box.png') })
console.log(JSON.stringify(st), 'errors', errors)
await browser.close()
