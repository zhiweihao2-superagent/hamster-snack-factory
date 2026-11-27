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
// 造 9 只白板（超过 6，验证分页与上场）
const st = await page.evaluate(`(() => {
  const sh = window.__shop(); sh.coins = 4000; sh.shard = 0; sh.level = 3;
  sh.rats = [];
  sh.squad = [-1,-1,-1,-1,-1];
  for (let i = 0; i < 9; i++) sh.rats.push({ line: 'none', tier: 1, mod: '', talents: [{ id: ['tank','blade','shot','hex','care'][i%5], lv: 1 }] });
  window.__openShop(true);
  return { rats: sh.rats.length, cap: window.GAME.rules.rosterCap };
})()`)
await page.waitForTimeout(300)
await page.screenshot({ path: resolve(dir, 'tools', '_roster9.png') })
// 点第 1 只 → 再点一次上场
await page.mouse.click(70, 425)
await page.waitForTimeout(150)
await page.mouse.click(70, 425)
await page.waitForTimeout(300)
const after = await page.evaluate(`(() => { const sh = window.__shop(); return { squad: sh.squad, on: sh.squad.filter(v=>v>=0).length }; })()`)
await page.screenshot({ path: resolve(dir, 'tools', '_roster9b.png') })
console.log(JSON.stringify(st), JSON.stringify(after), 'errors', errors)
await browser.close()
