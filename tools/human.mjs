/**
 * 真人节奏测试：每 1600ms 走一步（实时制下敌方按秒出手），跑完一局看结果。
 *   node tools/human.mjs [每步毫秒] [最长秒数]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const stepMs = Number(process.argv[2]) || 1600
const maxSec = Number(process.argv[3]) || 120

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')

await page.evaluate('window.__autoplay(window.__gameState())')
const started = Date.now()
let last = null
while ((Date.now() - started) / 1000 < maxSec) {
  const st = await page.evaluate('window.__gameState()')
  if (st.phase !== 'playing') { last = st; break }
  await page.evaluate('window.__autoplay(window.__gameState())')
  await page.waitForTimeout(stepMs)
  last = await page.evaluate('window.__gameState()')
  if (last.phase !== 'playing') break
}
const r = last && last.rpg
console.log(JSON.stringify({
  secs: Math.round((Date.now() - started) / 100) / 10,
  phase: last && last.phase,
  steps: last && last.hearts,
  alive: r && (r.alive + '/' + r.total), armor: r && r.armor,
  wave: r && r.wave + '/' + r.waveTotal,
  kills: r && r.kills,
  dmg: last && last.score,
  units: r && r.units,
  foes: r && r.enemies,
}, null, 1))
if (errors.length) console.log('errors:', errors)
await browser.close()
