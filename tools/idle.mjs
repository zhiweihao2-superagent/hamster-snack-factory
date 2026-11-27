/**
 * 挂机测试：开局后完全不操作，只等——验证"自动战斗"不会自己赢。
 *   node tools/idle.mjs [秒数]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const secs = Number(process.argv[2]) || 90

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')
// 只点一下开局，之后一个输入都不给
await page.mouse.click(195, 422)
await page.waitForTimeout(secs * 1000)
const st = await page.evaluate('window.__gameState()')
const r = st.rpg
console.log(JSON.stringify({
  secs, phase: st.phase, steps: st.hearts,
  alive: r.alive + '/' + r.total, armor: r.armor,
  wave: r.wave + '/' + r.waveTotal, kills: r.kills, dmg: st.score,
  units: r.units.map(u => u && (u.name + ' ' + u.hp + '/' + u.hpMax + (u.alive ? '' : ' 阵亡'))),
  foes: r.enemies.filter(f => f.alive).map(f => f.name + ' ' + f.hp + '/' + f.hpMax),
}, null, 1))
await browser.close()
