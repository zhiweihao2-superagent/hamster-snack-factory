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
await page.waitForFunction('typeof window.__hitTest === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
// L1 是纸箱鼠（有箱子），先测魔法穿箱、再测物理破箱与减伤
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 0; sh.squad = [0];
  sh.rats = [{ line: 'hex', tier: 3, mod: '' }];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  window.__setTimeScale(1);
})()`)
await page.waitForTimeout(600)
const mag = await page.evaluate('window.__hitTest("mag", 20)')
const phys1 = await page.evaluate('window.__hitTest("phys", 20)')
const phys2 = await page.evaluate('window.__hitTest("phys", 20)')
console.log('mag  ', JSON.stringify(mag))
console.log('phys1', JSON.stringify(phys1))
console.log('phys2', JSON.stringify(phys2))
console.log('errors', errors)
await browser.close()
