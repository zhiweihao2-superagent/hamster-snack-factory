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
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 2; sh.squad = [0,1,2,3,4];
  sh.rats = [{line:'tank',tier:3,mod:''},{line:'blade',tier:3,mod:''},{line:'shot',tier:3,mod:''},{line:'hex',tier:3,mod:''},{line:'care',tier:3,mod:''}];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
})()`)
await page.waitForTimeout(5200)
for (let k = 0; k < 4; k++){
  await page.waitForTimeout(1300)
  const st = await page.evaluate(`(() => {
    const s = window.__stage();
    const all = s.units.filter(u => u && u.alive).concat(s.foes.filter(f => f && f.alive));
    let min = 1e9;
    for (let i = 0; i < all.length; i++) for (let j = i+1; j < all.length; j++){
      const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
      if (d < min) min = d;
    }
    return { n: all.length, minDist: Math.round(min), sprite: s.sprite };
  })()`)
  console.log(JSON.stringify(st))
}
await page.screenshot({ path: resolve(dir, 'tools', '_sep.png') })
console.log('errors', errors)
await browser.close()
