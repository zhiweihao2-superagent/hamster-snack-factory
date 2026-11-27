/**
 * 解锁池 + 波间三选一：不同关卡能刷到什么证；三选一界面截图与选择效果。
 *   node tools/unlocktest.mjs
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
await page.waitForTimeout(300)

// 各关卡连刷 60 次：能刷到哪些线/等级（用 __shopRoll 直接摇，不受 phase 幂等限制）
const dist = await page.evaluate(`(() => {
  const S = window.__shop()
  const out = {}
  for (const lvl of [1, 3, 5, 7]) {
    S.level = lvl
    const seen = {}
    for (let i = 0; i < 60; i++) {
      const o = window.__shopRoll()
      const key = o.line + '-' + o.tier
      seen[key] = (seen[key] || 0) + 1
    }
    out['lv' + lvl] = seen
  }
  return out
})()`)
console.log('各关可刷到的证（60 次分布）:', JSON.stringify(dist, null, 1))

// 波间三选一：打死第一波 → 应进 pick
await page.evaluate(`(() => { const S = window.__shop(); S.level = 1; S.phase = 'play'; window.__rawNewRun(12345) })()`)
await page.waitForTimeout(400)
await page.evaluate(`(() => { const R = window.__rpg(); R.enemies.forEach(f => { if (f) { f.hp = 0; f.alive = false } }); R.queue.length = 0 })()`)
await page.waitForTimeout(700)
const pick = await page.evaluate('({phase: window.__gameState().phaseRaw, cards: (window.__rpg().pick || []).map(b => b.name)})')
console.log('清完第 1 波:', JSON.stringify(pick))
await page.screenshot({ path: join(outDir, 'pick-cards.jpg'), type: 'jpeg', quality: 85 })

// 定向验证每种补给是否真的生效
const buffTest = await page.evaluate(`(() => {
  const R = window.__rpg()
  const out = {}
  window.__pickForce(['armorCap']); window.__pick(0)
  out.armorCap = { armorMax: R.armorMax }
  window.__pickForce(['dmgUp']); window.__pick(0)
  out.dmgUp = { dmgMul: R.buffDmgMul }
  window.__pickForce(['atkSpeed']); window.__pick(0)
  out.atkSpeed = { atkMul: R.buffAtkMul }
  window.__pickForce(['repair']); window.__pick(0)
  out.repair = { hp: R.units.filter(Boolean).map(u => u.hp) }
  return out
})()`)
console.log('补给生效验证:', JSON.stringify(buffTest))
console.log('errors:', errors)
await browser.close()
