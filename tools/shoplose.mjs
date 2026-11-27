/**
 * 失败 → 补给站 的闭环：保底金币、按钮文案、重打本关（不加关数）。
 *   node tools/shoplose.mjs
 */
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const outDir = join(dir, '.studio', 'shots')
await mkdir(outDir, { recursive: true })

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')

await page.evaluate('window.__shop().coins = 0; window.__shop().level = 3')
await page.mouse.click(195, 560)
await page.waitForTimeout(300)
await page.evaluate('window.__shop().level = 3')
await page.waitForTimeout(100)

// 直接把小队打光
await page.evaluate(`(() => { const r = window.__rpg(); r.units.forEach(u => { if (u) { u.hp = 0; u.alive = false } }); })()`)
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(200)
  const ph = await page.evaluate('window.__gameState().phaseRaw')
  if (ph !== 'play') break
}
const lost = await page.evaluate('({phase: window.__gameState().phaseRaw, coins: window.__shop().coins, level: window.__shop().level})')
console.log('失败后（未点按钮）:', JSON.stringify(lost))
await page.screenshot({ path: join(outDir, 'lose-to-shop-1.jpg'), type: 'jpeg', quality: 85 })

const btn = await page.evaluate(`(() => { const h = window.__shopHits().hit.again; return h ? { x: h[0] + h[2] / 2, y: h[1] + h[3] / 2 } : null })()`)
if (btn) await page.mouse.click(btn.x, btn.y)
await page.waitForTimeout(400)
const shop = await page.evaluate('({phase: window.__gameState().phaseRaw, coins: window.__shop().coins, earned: window.__shop().earned, advance: window.__shop().advance, level: window.__shop().level})')
console.log('点结算卡后:', JSON.stringify(shop))
await page.screenshot({ path: join(outDir, 'lose-to-shop-2.jpg'), type: 'jpeg', quality: 85 })

// 点「重打本关」：关卡数不该变
const startBtn = await page.evaluate(`(() => {
  const h = window.__shopHits().shop
  const last = h[h.length - 1]
  return last ? { x: last.x + last.w / 2, y: last.y + last.h / 2 } : null
})()`)
if (startBtn) await page.mouse.click(startBtn.x, startBtn.y)
await page.waitForTimeout(500)
const after = await page.evaluate('({phase: window.__gameState().phaseRaw, level: window.__shop().level, units: window.__gameState().rpg.units.filter(Boolean).length})')
console.log('重打本关后:', JSON.stringify(after))
console.log('errors:', errors)
await browser.close()
