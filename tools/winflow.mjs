/**
 * 完整循环：开局 → 快速打死（把敌人 HP 压到 1）→ 结算 → 进商店 → 开工 → 第 2 关。
 *   node tools/winflow.mjs
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
await page.mouse.click(195, 560)
await page.waitForTimeout(400)

// 清空钱包，确认金币来自结算
await page.evaluate('window.__shop().coins = 0; window.__shop().level = 1; window.__shop().earned = 0')

// 把四波敌人压成 1 血，然后让自动战斗收尾
const log = []
for (let i = 0; i < 40; i++) {
  const phase = await page.evaluate(`(() => {
    const R = window.__rpg()
    R.enemies.forEach(f => { if (f.alive) { f.hp = 1; f.hpMax = 1 } })
    R.queue.forEach(f => { f.hp = 1; f.hpMax = 1 })
    window.__autoplay(window.__gameState())
    return window.__gameState().phase
  })()`)
  await page.waitForTimeout(450)
  if (phase !== 'playing') { log.push('phase=' + phase + ' at step ' + i); break }
}
const afterWin = await page.evaluate('({phase: window.__gameState().phase, coins: window.__shop().coins, earned: window.__shop().earned, best: window.__shop().best, steps: window.__gameState().hearts})')
console.log('after win:', JSON.stringify(afterWin))
await page.screenshot({ path: join(outDir, 'win-end.jpg'), type: 'jpeg', quality: 85 })

// 点结算卡按钮（位置从 HIT 里读，别硬编码）→ 应进商店
const btn = await page.evaluate(`(() => {
  const h = window.__shopHits().hit.again
  return h ? { x: h[0] + h[2] / 2, y: h[1] + h[3] / 2 } : null
})()`)
console.log('again button:', JSON.stringify(btn))
if (btn) await page.mouse.click(btn.x, btn.y)
await page.waitForTimeout(120)
const immediate = await page.evaluate('({phase: window.__gameState().phase, level: window.__shop().level, offers: window.__shop().offers.length, c: window.__counters})')
console.log('immediately after click:', JSON.stringify(immediate))
await page.waitForTimeout(400)
const inShop = await page.evaluate('({phase: window.__gameState().phase, offers: window.__shop().offers.length, coins: window.__shop().coins})')
console.log('after click:', JSON.stringify(inShop))
await page.screenshot({ path: join(outDir, 'shop-after-win.jpg'), type: 'jpeg', quality: 85 })

// 开工 → 第 2 关，敌人应更硬
await page.evaluate('window.__shopNext()')
await page.waitForTimeout(500)
const lvl2 = await page.evaluate(`(() => {
  const st = window.__gameState(), r = st.rpg
  return { phase: st.phase, level: window.__shop().level, steps: st.hearts,
           units: r.units.filter(Boolean).map(u => u.name + ' ' + u.hp + '/' + u.hpMax),
           foes: r.enemies.filter(f => f.alive).map(f => f.name + ' hp=' + f.hpMax) }
})()`)
console.log('level 2:', JSON.stringify(lvl2))
console.log('errors:', errors)
await browser.close()
