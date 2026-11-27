/**
 * 商店流程测试：进店 → 改钱 → 买一件证 → 买配件 → 换编队 → 开工 → 看新一关的单位。
 *   node tools/shoptest.mjs
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
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')

// 开局 → 直接进商店（跳过打一局）
await page.mouse.click(195, 560)
await page.waitForTimeout(400)
await page.evaluate('window.__shop().coins = 300; window.__shopOpen()')
await page.waitForTimeout(500)
await page.screenshot({ path: join(outDir, 'shop-1.jpg'), type: 'jpeg', quality: 85 })

const offers = await page.evaluate('JSON.stringify(window.__shop().offers.map(o => ({kind:o.kind,line:o.line,tier:o.tier,mod:o.mod,price:o.price})))')
console.log('offers:', offers)

// 买第一件（可能是证/配件/新鼠），再买第二件
const before = await page.evaluate('JSON.stringify({rats: window.__shop().rats, squad: window.__shop().squad, coins: window.__shop().coins})')
await page.evaluate('window.__shopBuy(0); window.__shopBuy(1)')
await page.waitForTimeout(300)
const after = await page.evaluate('JSON.stringify({rats: window.__shop().rats, squad: window.__shop().squad, coins: window.__shop().coins})')
console.log('before:', before)
console.log('after :', after)
await page.screenshot({ path: join(outDir, 'shop-2.jpg'), type: 'jpeg', quality: 85 })

// 开工 → 看新一关的单位是否跟着换了
await page.evaluate('window.__shopNext()')
await page.waitForTimeout(600)
const battle = await page.evaluate(`(() => {
  const st = window.__gameState(), r = st.rpg
  return { phase: st.phase, steps: st.hearts,
           units: r.units.map(u => u && (u.name + ' ' + u.hp + '/' + u.hpMax + ' need=' + u.need + ' atkMs=' + u.atkMs + ' base=' + u.baseDmg)),
           level: window.__shop().level, foes: r.enemies.filter(f => f.alive).map(f => f.name + ' ' + f.hpMax) }
})()`)
console.log('battle:', JSON.stringify(battle, null, 1))
await page.screenshot({ path: join(outDir, 'shop-3.jpg'), type: 'jpeg', quality: 85 })
console.log('errors:', errors)
await browser.close()
