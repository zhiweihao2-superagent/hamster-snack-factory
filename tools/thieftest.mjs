/**
 * 拾荒鼠验证：跳到第 3 波，等它出手，看战况里是否记了"改写 N 格"、盘面是否真的变了。
 *   node tools/thieftest.mjs
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')
await page.mouse.click(195, 560)
await page.waitForTimeout(300)

const clear = () => page.evaluate(`(() => {
  const R = window.__rpg()
  R.enemies.forEach(f => { if (f) { f.hp = 0; f.alive = false } })
  R.queue.length = 0
})()`)

await clear(); await page.waitForTimeout(500)
await clear(); await page.waitForTimeout(600)
const wave = await page.evaluate('window.__gameState().rpg.wave')
const boardBefore = await page.evaluate('window.__gameState().board.map(r => r.join("")).join("|")')
console.log('wave:', wave, 'foes:', await page.evaluate('JSON.stringify(window.__gameState().rpg.enemies.filter(f => f.alive).map(f => f.name))'))

await page.waitForTimeout(9000)
const after = await page.evaluate(`({
  log: window.__rpg().log.slice(-3),
  board: window.__gameState().board.map(r => r.join('')).join('|'),
  alive: window.__gameState().rpg.alive
})`)
console.log('战况:', JSON.stringify(after.log))
console.log('盘面变化:', boardBefore !== after.board)
console.log('errors:', errors)
await browser.close()
