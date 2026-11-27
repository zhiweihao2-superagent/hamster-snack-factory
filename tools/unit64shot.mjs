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
await page.waitForFunction('typeof window.__stage === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const geom = await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 1; sh.squad = [0,1,2,3,A=4].slice(0,5);
  sh.rats = [{line:'tank',tier:3,mod:''},{line:'shot',tier:3,mod:''},{line:'blade',tier:3,mod:''},{line:'hex',tier:2,mod:''},{line:'care',tier:2,mod:''}];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  const s = window.__stage();
  return { floor: s.floor, sprite: s.sprite, units: s.units.filter(Boolean).map(u => u.name + '@' + u.x + ',' + u.y) };
})()`)
await page.waitForTimeout(2200)
await page.screenshot({ path: resolve(dir, 'tools', '_unit64.png') })
console.log(JSON.stringify(geom).slice(0, 400), 'errors', errors)
await browser.close()
if (errors.length) process.exit(1)
