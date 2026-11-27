import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', e => errs.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__stage === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const sets = await page.evaluate(`(() => { const F = window.UNIT_FRAMES || {}; const k = Object.keys(F); return { total: k.length, foe: k.filter(x => x.indexOf('foe-') === 0).length, sample: k.filter(x => x.indexOf('foe-') === 0).slice(0, 3) }; })()`)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 4; sh.squad = [0,1,2,3,4];
  sh.rats = [{line:'tank',tier:4,mod:''},{line:'blade',tier:4,mod:''},{line:'shot',tier:4,mod:''},{line:'hex',tier:4,mod:''},{line:'care',tier:4,mod:''}];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
})()`)
await page.waitForTimeout(5200)
await page.screenshot({ path: resolve(dir, 'tools', '_foeart.png') })
console.log('frames', JSON.stringify(sets))
console.log('errs', errs.slice(0,3))
await browser.close()
