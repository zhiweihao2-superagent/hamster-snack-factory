/**
 * 战斗数值探针：逐步调 __autoplay，打印每步的资源、分流、伤害与敌方状态。
 *   node tools/probe.mjs [步数]
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const steps = Number(process.argv[2]) || 18

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser, name } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"', undefined, { timeout: 10000 })
await page.waitForTimeout(400)

await page.evaluate('window.__autoplay(window.__gameState())')
await page.waitForTimeout(500)
const rows = []
for (let i = 0; i < steps; i++) {
  const before = await page.evaluate('window.__gameState()')
  if (before.phase !== 'playing') { rows.push({ step: i, note: 'phase ' + before.phase }); break }
  const act = await page.evaluate('window.__autoplay(window.__gameState())')
  await page.waitForTimeout(650)   // 等动画演完（一步最长约 0.5s）
  const s = await page.evaluate('window.__gameState()')
  const r = s.rpg
  rows.push({
    step: i + 1, act,
    steps: s.hearts,
    wave: r.wave + '/' + r.waveTotal,
    hp: r.hp, armor: r.armor + '/' + r.armorMax,
    parts: r.parts, energy: r.energy,
    units: r.units.map(u => u && (u.name + ' ' + u.hp + '/' + u.hpMax + (u.eats ? ' [' + u.eats + ' ' + u.charge + '/' + u.need + ']' : ''))).filter(Boolean),
    foes: r.enemies.map(f => f.name + ' ' + f.hp + '/' + f.hpMax + (f.alive ? '' : '×')),
    queue: r.queue,
    kills: r.kills,
    dmg: s.score,
  })
}
await browser.close()
console.log(name, 'errors:', errors)
for (const r of rows) console.log(JSON.stringify(r))
