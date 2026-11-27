/**
 * 实时截图：自己驱动 autoplay，在指定秒数各拍一张（studio 的 mid 会被提前结束的一局跳过）。
 *   node tools/shots.mjs [秒数列表,逗号分隔]
 */
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const marks = (process.argv[2] || '2,6,10,16,24').split(',').map(Number)
const outDir = join(dir, '.studio', 'shots')
await mkdir(outDir, { recursive: true })

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')
await page.evaluate('window.__autoplay(window.__gameState())')

const started = Date.now()
let next = 0
while (next < marks.length) {
  const t = (Date.now() - started) / 1000
  const phase = await page.evaluate('window.__gameState().phase')
  if (t >= marks[next] || phase !== 'playing') {
    const name = `${String(marks[next]).padStart(2, '0')}s-${phase}`
    const file = join(outDir, `${name}.jpg`)
    await page.screenshot({ path: file, type: 'jpeg', quality: 82 })
    console.log('shot', file)
    next++
    if (phase !== 'playing') {
      while (next < marks.length) { next++ }
      break
    }
  }
  if (phase === 'playing') await page.evaluate('window.__autoplay(window.__gameState())')
  await page.waitForTimeout(120)
}
console.log('errors:', errors)
await browser.close()
