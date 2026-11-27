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
await page.waitForFunction('typeof window.__openPick === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
const phase = await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 0; sh.squad=[0,1,-1,-1,-1]; window.__shopNext();
  const r = window.__rpg();
  if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  return window.__openPick();
})()`)
await page.waitForTimeout(500)
await page.screenshot({ path: resolve(dir, 'tools', '_pick.png') })
console.log('phase', phase, 'errors', errors)
await browser.close()
if (errors.length) process.exit(1)
