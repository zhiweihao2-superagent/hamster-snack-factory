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
  const r = window.__rpg(); if (r.tut) { r.tutSwap=true; r.tutUlt=true; r.tutRes=3; }
  window.__setTimeScale(2);
  window.__dmgLog = {};
  // 记录每次我方受伤（用浮字位置近似不够准，这里包一层 R.units 的 hp 变化）
  window.__lastHp = r.units.map(u => u ? u.hp : 0);
})()`)
for (let i = 0; i < 14; i++) {
  await page.evaluate('window.__autoplay(window.__gameState())')
  const s = await page.evaluate(`(() => {
    const r = window.__rpg();
    const now = r.units.map(u => u ? Math.round(u.hp) : null);
    const diffs = now.map((h, i) => (h === null || window.__lastHp[i] === null) ? 0 : (window.__lastHp[i] - h));
    window.__lastHp = now;
    return { t: Math.round(performance.now()/1000), now, diffs,
             armor: Math.round(r.armor), foes: r.enemies.filter(f=>f&&f.alive).map(f=>f.name + ':' + Math.round(f.hp) + '/' + Math.round(f.atk)), q: r.queue.length };
  })()`)
  console.log(JSON.stringify(s))
  await page.waitForTimeout(1500)
}
await browser.close()
