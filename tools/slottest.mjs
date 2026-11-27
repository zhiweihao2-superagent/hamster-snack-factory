/**
 * 槽位测试：买一只白板鼠，是否自动进第三槽并能在战斗里上场。
 *   node tools/slottest.mjs
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.mouse.click(195, 560)
await page.waitForTimeout(300)

const out = await page.evaluate(`(() => {
  const S = window.__shop()
  S.coins = 500
  window.__shopOpen()
  const before = { squad: S.squad.slice(), rats: S.rats.length }
  S.offers = [
    { kind: 'rat', price: 35, sold: false },
    { kind: 'mod', mod: 'goggles', price: 22, sold: false },
    { kind: 'gear', line: 'spring', tier: 2, price: 40, sold: false }
  ]
  window.__shopBuy(0)
  const afterBuy = { squad: S.squad.slice(), rats: S.rats.length, sel: S.sel, coins: S.coins }
  window.__shopNext()
  const r = window.__gameState().rpg
  return { before, afterBuy, units: r.units.map(u => u ? u.name : '空槽'), alive: r.alive, total: r.total }
})()`)
console.log(JSON.stringify(out, null, 1))
await page.screenshot({ path: resolve(dir, '.studio/shots/three-units.jpg'), type: 'jpeg', quality: 85 })
console.log('errors:', errors)
await browser.close()
