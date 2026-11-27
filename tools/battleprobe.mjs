import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 6; sh.squad = [0,1,2,3,4];
  sh.rats = [{line:'tank',tier:3,mod:''},{line:'shot',tier:3,mod:''},{line:'blade',tier:3,mod:''},{line:'hex',tier:2,mod:''},{line:'care',tier:2,mod:''}];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  window.__setTimeScale(2);
})()`)
await page.waitForTimeout(600)
for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(`(() => { const r = window.__rpg();
    return { t: Math.round(performance.now()/1000), armor: Math.round(r.armor), hp: r.units.filter(u=>u&&u.alive).map(u=>Math.round(u.hp)).join('/'),
             foes: r.enemies.filter(f=>f&&f.alive).length, q: r.queue.length, dmg: Math.round(r.dmgDealt) }; })()`)
  console.log(JSON.stringify(s))
  await page.evaluate('window.__autoplay(window.__gameState())')
  await page.waitForTimeout(2200)
}
await browser.close()
