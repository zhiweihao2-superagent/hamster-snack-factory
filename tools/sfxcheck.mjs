import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__sfxProbe === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

const names = ['elite', 'gachaFlip', 'gachaGold', 'fuseClash', 'fuseWin', 'pick', 'win']
const res = {}
for (const n of names) {
  res[n] = await page.evaluate(`window.__sfxProbe(${JSON.stringify(n)})`)
}
console.log('probe', JSON.stringify(res))
console.log('errors', errors)
await browser.close()
if (errors.length) process.exit(1)
