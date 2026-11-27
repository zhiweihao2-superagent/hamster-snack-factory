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
  const r = window.__rpg();
  if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  // 只留一只敌人：其余直接判死，队列清空
  r.queue = [];
  for (let i = 1; i < r.enemies.length; i++){ if (r.enemies[i]) { r.enemies[i].alive = false; r.enemies[i].hp = 0; } }
})()`)
await page.waitForTimeout(5200)   // 跳过开场
for (let i = 0; i < 5; i++){
  await page.waitForTimeout(1200)
  const st = await page.evaluate(`(() => { const s = window.__stage();
    return { allies: s.units.filter(Boolean).map(u => Math.round(u.x)+','+Math.round(u.y)),
             foes: s.foes.filter(f => f.alive !== false).map(f => f.name+':'+Math.round(f.x)+','+Math.round(f.y)) }; })()`)
  console.log(JSON.stringify(st))
}
await page.screenshot({ path: resolve(dir, 'tools', '_onefoe.png') })
console.log('errors', errors)
await browser.close()
