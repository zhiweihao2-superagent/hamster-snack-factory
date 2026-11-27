import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const level = Number(process.argv[2] || 6)
const games = Number(process.argv[3] || 3)
const nRats = Number(process.argv[4] || 5)

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser: br } = await launchBrowser()
const page = await br.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shopNext === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate('window.__setTimeScale(2)')

const lines = ['tank', 'shot', 'blade', 'hex', 'care']
const mkTalents = (n, line) => {
  const out = n >= 1 ? [{ id: line, lv: 2 }] : []
  if (n >= 2) out.push({ id: lines[(lines.indexOf(line) + 2) % 5], lv: 2 })
  if (n >= 3) out.push({ id: lines[(lines.indexOf(line) + 4) % 5], lv: 2 })
  return out
}

const rows = []
for (const n of [0, 1, 2, 3]) {
  let wins = 0, alive = 0
  for (let g = 0; g < games; g++) {
    await page.evaluate(`(() => {
      const sh = window.__shop();
      sh.level = ${level} - 1;
      const lines = ['tank','shot','blade','hex','care'];
      const mk = ${mkTalents.toString()};
      sh.rats = lines.slice(0, ${nRats}).map((l) => ({ line: l, tier: 2, mod: '', talents: mk(${n}, l) }));
      sh.squad = sh.rats.map((_, i) => i);
      window.__shopNext();
      const r = window.__rpg();
      if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
    })()`)
    const t0 = Date.now()
    let phase = 'play'
    while ((Date.now() - t0) / 1000 < 90) {
      phase = await page.evaluate('window.__gameState().phaseRaw')
      if (phase !== 'play' && phase !== 'pick') break
      await page.evaluate('window.__autoplay(window.__gameState())')
      await page.waitForTimeout(110)
    }
    const s = await page.evaluate(`(() => { const r = window.__rpg(); return { alive: r.units.filter(u => u && u.alive).length, phase: window.__gameState().phaseRaw }; })()`)
    if (s.phase === 'won' || s.phase === 'win' || phase === 'won') wins++
    else if (s.alive > 0 && phase !== 'lost') wins++
    alive += s.alive
  }
  rows.push({ talents: n, winRate: Math.round((wins / games) * 100), avgAlive: +(alive / games).toFixed(1) })
}
console.log('L' + level + ' talent tiers:', JSON.stringify(rows), 'errors', errors)
await br.close()
if (errors.length) process.exit(1)
