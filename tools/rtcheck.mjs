import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const level = Number(process.argv[2]) || 1
const games = Number(process.argv[3]) || 5
const nRats = Number(process.argv[4]) || 5
/* 测量前先确认 dist 比源码新：node tools/checkbuild.mjs（否则测到的是旧构建） */
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shopNext === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate('window.__setTimeScale(2)')
const rows = []
for (let g = 0; g < games; g++) {
  await page.evaluate(`(() => {
    const sh = window.__shop();
    const all = [{line:'tank',tier:2,mod:''},{line:'shot',tier:2,mod:''},{line:'blade',tier:2,mod:''},{line:'hex',tier:2,mod:''},{line:'care',tier:2,mod:''}];
    sh.rats = all.slice(0, ${nRats});
    sh.squad = [0,1,2,3,4].map(i => i < sh.rats.length ? i : -1);
    sh.level = ${level} - 1;
    window.__shopNext();
    if (window.__gameState().phaseRaw === 'brief') window.__autoplay(window.__gameState());
  })()`)
  const started = Date.now()
  let phase = 'play'
  while ((Date.now() - started) / 1000 < 90) {
    phase = await page.evaluate('window.__gameState().phaseRaw')
    if (phase !== 'play' && phase !== 'pick') break
    await page.evaluate('window.__autoplay(window.__gameState())')
    await page.waitForTimeout(110)
  }
  const s = await page.evaluate(`(() => { const st = window.__gameState(), r = window.__rpg();
    return { phase: st.phaseRaw, alive: r.units.filter(u => u && u.alive).length, total: r.units.filter(Boolean).length,
             wave: r.wave + 1, waveTotal: r.waveTotal, secs: 0 }; })()`)
  rows.push({ ...s, secs: Math.round((Date.now() - started) / 100) / 10 })
}
const wins = rows.filter(r => r.phase === 'win').length
const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length * 10) / 10
console.log('L' + level, JSON.stringify({ games, winRate: Math.round(wins / rows.length * 100), avgAlive: avg('alive'), avgWave: avg('wave'), avgSecs: avg('secs'), loses: rows.filter(r => r.phase !== 'win').map(r => r.wave + '/' + r.waveTotal) }))
console.log('errors', errors)
await browser.close()
