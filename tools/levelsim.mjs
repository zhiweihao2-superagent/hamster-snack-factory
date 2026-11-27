import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const games = Number(process.argv[2]) || 10
const upto = Number(process.argv[3]) || 7
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpgSimAt === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
const rows = []
for (let lv = 1; lv <= upto; lv++) {
  const r = await page.evaluate(`window.__rpgSimAt(${lv}, ${games})`)
  rows.push(r)
  console.log(`第${r.level}关 ${r.cfg ? r.cfg.name : '?'}（轮${r.cfg ? r.cfg.round + 1 : '?'}，${r.cfg ? r.cfg.waves : '?'}波）｜胜率 ${r.winRate}%｜均伤 ${r.avgDmg}｜均到波 ${r.avgWave}｜卡死 ${r.stuck}`)
}
console.log('---')
console.log(JSON.stringify({ gamesPerLevel: games, levels: rows.map(r => ({ lv: r.level, win: r.winRate, dmg: r.avgDmg, wave: r.avgWave })), errors }))
await browser.close()
if (errors.length) process.exit(1)
