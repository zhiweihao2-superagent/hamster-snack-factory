/**
 * 批量实时模拟：游戏内时间 ×N 跑若干局，统计胜率 / 存活 / 时长 / 波次。
 *   node tools/batch-run.mjs [局数] [timeScale]
 *
 * 注意：timeScale 只加速"战斗计时"（敌我出手），动画仍是 1x，所以玩家侧相当于被放慢——
 * 结果偏保守（比真人略难）。要精确手感的单局请用 tools/human.mjs。
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const games = Number(process.argv[2]) || 6
const scale = Number(process.argv[3]) || 2

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__setTimeScale === "function"')

await page.evaluate(`window.__setTimeScale(${scale}); window.__shop().coins = 0; window.__shop().level = 1`)
await page.keyboard.press('Enter')
await page.waitForTimeout(500)

const runs = []
for (let g = 0; g < games; g++) {
  await page.evaluate(`window.__rawNewRun(${20261120 + g * 7919})`)
  await page.waitForTimeout(200)
  const started = Date.now()
  let phase = 'play'
  while ((Date.now() - started) / 1000 < 120) {
    phase = await page.evaluate('window.__gameState().phaseRaw')
    if (phase !== 'play' && phase !== 'pick') break
    await page.evaluate('window.__autoplay(window.__gameState())')
    await page.waitForTimeout(120)
  }
  const s = await page.evaluate(`(() => {
    const st = window.__gameState(), r = st.rpg
    return { phase: st.phaseRaw, alive: r.alive, total: r.total, wave: r.wave, waveTotal: r.waveTotal,
             kills: r.kills, dmg: Math.round(st.score), swaps: st.hearts }
  })()`)
  runs.push({ ...s, secs: Math.round((Date.now() - started) / 100) / 10 })
  console.log(g + 1, JSON.stringify(runs[runs.length - 1]))
}

const wins = runs.filter(r => r.phase === 'win').length
const avg = (k) => Math.round(runs.reduce((a, r) => a + r[k], 0) / Math.max(1, runs.length) * 10) / 10
console.log('---')
console.log(JSON.stringify({
  games, timeScale: scale,
  winRate: Math.round(wins / runs.length * 100),
  avgAlive: avg('alive'), avgWave: avg('wave'), avgSecs: avg('secs'), avgSwaps: avg('swaps'),
  lostWaves: runs.filter(r => r.phase !== 'win').map(r => r.wave + '/' + r.waveTotal),
}))
if (errors.length) console.log('errors:', errors)
await browser.close()
