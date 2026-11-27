import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__artDiag === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(800)
const out = await page.evaluate(`(() => {
  const keys = Object.keys(window.UNIT_ART || {});
  const d = window.__artDiag();
  return { hasNone1: keys.includes('none-1'), hasIcon: keys.includes('gear-tank'),
           diag: d, sample: keys.filter(k => k.startsWith('none') || k.startsWith('tank')).slice(0, 8) };
})()`)
console.log(JSON.stringify(out))
await browser.close()
