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
const info = await page.evaluate(`(() => {
  const F = window.UNIT_FRAMES || {};
  const keys = Object.keys(F);
  const sample = keys.slice(0, 3).map(k => k + ':' + Object.keys(F[k]).join('/'));
  return { sets: keys.length, frames: sample };
})()`)
console.log('frames', JSON.stringify(info))
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 2; sh.squad = [0,1,2,3,4];
  sh.rats = [{line:'tank',tier:3,mod:''},{line:'blade',tier:4,mod:''},{line:'shot',tier:4,mod:''},{line:'hex',tier:4,mod:''},{line:'care',tier:3,mod:''}];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
})()`)
for (let i = 0; i < 3; i++){
  await page.waitForTimeout(420)
  await page.screenshot({ path: resolve(dir, 'tools', `_anim${i}.png`) })
}
console.log('errors', errors)
await browser.close()
