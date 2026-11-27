/**
 * 卡死诊断：真人节奏跑，逐秒看 steps / anim / 存活 / 伤害，找"交换被拒"的时刻。
 *   node tools/diag.mjs [每步毫秒] [最长秒]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const stepMs = Number(process.argv[2]) || 1200
const maxSec = Number(process.argv[3]) || 90

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')
await page.mouse.click(195, 560)
await page.waitForTimeout(400)

const started = Date.now()
let lastSteps = null
let stall = 0
for (let i = 0; i < 200 && (Date.now() - started) / 1000 < maxSec; i++) {
  const act = await page.evaluate('window.__autoplay(window.__gameState())')
  await page.waitForTimeout(stepMs)
  const s = await page.evaluate(`(() => {
    const st = window.__gameState(), a = window.__animState(), r = window.__rpg()
    return { phase: st.phaseRaw, steps: st.hearts, anim: a && a.phase, animIdx: a && a.idx,
             alive: r.units.filter(u => u && u.alive).length, total: r.units.filter(Boolean).length,
             dmg: Math.round(r.dmgDealt), out: !!r.outOfStock,
             units: r.units.map(u => u && (u.hp + '/' + u.hpMax + (u.alive ? '' : '×'))) }
  })()`)
  const t = ((Date.now() - started) / 1000).toFixed(1)
  if (s.steps === lastSteps && act === 'swap') stall++
  else stall = 0
  lastSteps = s.steps
  console.log(`${t}s act=${act} phase=${s.phase} steps=${s.steps} anim=${s.anim}#${s.animIdx} alive=${s.alive}/${s.total} dmg=${s.dmg} out=${s.out} units=${s.units.join(',')}`)
  if (stall >= 3) { console.log('!! 连续 3 次 swap 但步数没动（疑似卡住）'); break }
  if (s.phase !== 'play') { console.log('结束：' + s.phase); break }
}
console.log('errors:', errors)
await browser.close()
