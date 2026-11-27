/**
 * 截图：拾荒鼠（第 3 波）与质检机 Boss（第 5 波）出场的样子。
 *   node tools/waveshots.mjs
 */
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const outDir = join(dir, '.studio', 'shots')
await mkdir(outDir, { recursive: true })

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')
await page.mouse.click(195, 560)
await page.waitForTimeout(400)

async function clearWave() {
  await page.evaluate(`(() => {
    const R = window.__rpg()
    R.enemies.forEach(f => { if (f) { f.hp = 0; f.alive = false } })
    R.queue.length = 0
  })()`)
  await page.waitForTimeout(450)
}
async function wave() { return page.evaluate('window.__gameState().rpg.wave') }

// 推到第 3 波（拾荒鼠）
while (await wave() < 3) await clearWave()
await page.waitForTimeout(300)
console.log('wave', await page.evaluate('JSON.stringify(window.__gameState().rpg.enemies.map(f => f.name))'))
await page.screenshot({ path: join(outDir, 'wave3-thief.jpg'), type: 'jpeg', quality: 85 })

// 推到第 5 波（Boss）
while (await wave() < 5) await clearWave()
await page.waitForTimeout(300)
console.log('wave', await page.evaluate('JSON.stringify(window.__gameState().rpg.enemies.map(f => f.name))'))
await page.screenshot({ path: join(outDir, 'wave5-boss.jpg'), type: 'jpeg', quality: 85 })

console.log('errors:', errors)
await browser.close()
