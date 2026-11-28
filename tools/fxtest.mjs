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
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 3; sh.coins = 900;
  sh.rats = [{line:'hex',tier:3,mod:'',talents:[],skills:[]},{line:'shot',tier:3,mod:'',talents:[],skills:[]},{line:'tank',tier:3,mod:'',talents:[],skills:[]}];
  sh.squad = [0,1,2];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
})()`)
await page.waitForTimeout(5400)
await page.evaluate(`(() => {
  window.__spawnFx('chain', 150, 260, {});
  window.__spawnFx('frost', 150, 300, { delay: 400 });
  window.__spawnFx('heal', 90, 300, { delay: 200 });
})()`)
for (let i = 0; i < 5; i++){
  await page.waitForTimeout(250)
  await page.screenshot({ path: resolve(dir, 'tools', `_fx_test${i}.png`) })
}
console.log('errs', errs.slice(0,3))
await browser.close()
