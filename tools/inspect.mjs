/**
 * 逐步观察：每 0.35s 调一次 autoplay，打印 act / 画面阶段 / 动画阶段 / 资源 / 伤害。
 *   node tools/inspect.mjs [tick 数]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const ticks = Number(process.argv[2]) || 24

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')
await page.evaluate('window.__autoplay(window.__gameState())')
await page.waitForTimeout(400)

for (let i = 0; i < ticks; i++) {
  const act = await page.evaluate('window.__autoplay(window.__gameState())')
  await page.waitForTimeout(350)
  const snap = await page.evaluate(`(() => {
    const r = window.__rpg(), st = window.__gameState(), an = window.__animState()
    return { phase: st.phaseRaw, anim: an && an.phase, steps: st.hearts, dmg: r.dmgDealt,
             cells: r.dbg && r.dbg.cells, pend: r.dbg && r.dbg.pending,
             bank: { parts: Math.round(r.parts), energy: Math.round(r.energy), armor: Math.round(r.armor) },
             units: r.units.map(u => u ? u.name + ':' + Math.round(u.charge) + '/' + u.need : 'x'),
             foes: r.enemies.filter(Boolean).map(f => f.name + ' ' + Math.round(f.hp) + '/' + f.hpMax) }
  })()`)
  console.log(
    String(i + 1).padStart(2), act.padEnd(5),
    'phase=' + snap.phase, 'anim=' + snap.anim, 'steps=' + snap.steps,
    'cells=' + snap.cells, 'dmg=' + Math.round(snap.dmg),
    'bank=' + JSON.stringify(snap.bank),
    'units=' + snap.units.join(','),
    'foes=' + snap.foes.join(','),
  )
}
console.log('errors:', errors)
await browser.close()
