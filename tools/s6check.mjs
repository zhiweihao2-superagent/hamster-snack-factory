import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 3; sh.squad = [0, 1, 2, 3];
  sh.rats = [
    { line: 'care', tier: 4, mod: '', talents: [], skills: [{ id: 'huangyou', lv: 3 }] },
    { line: 'care', tier: 4, mod: '', talents: [], skills: [{ id: 'jiaban', lv: 3 }] },
    { line: 'care', tier: 4, mod: '', talents: [], skills: [{ id: 'xingyun', lv: 3 }] },
    { line: 'care', tier: 4, mod: '', talents: [], skills: [{ id: 'tangfen', lv: 3 }] }
  ];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  /* 先掉点血，才能观察到回血 */
  r.units.filter(Boolean).forEach(function(u){ if (u.alive) u.hp = Math.max(1, u.hp - 45); });
})()`)

let saw = { armor: false, as: false, crit: false, healed: false }
let hp0 = null
for (let i = 0; i < 40; i++){
  await page.waitForTimeout(300)
  const st = await page.evaluate(`(() => { const r = window.__rpg(); const now = performance.now();
    const us = r.units.filter(u => u && u.alive);
    return {
      armor: us.some(u => u.armorUntil && u.armorUntil > now),
      as: us.some(u => u.asUntil && u.asUntil > now),
      crit: us.some(u => u.critUntil && u.critUntil > now),
      hp: us.reduce((s,u) => s + Math.round(u.hp), 0),
      armorPool: Math.round(r.armor)
    }; })()`)
  if (st.armor) saw.armor = true
  if (st.as) saw.as = true
  if (st.crit) saw.crit = true
  if (hp0 === null) hp0 = st.hp
  if (st.hp > hp0) saw.healed = true
}
await page.screenshot({ path: resolve(dir, 'tools', '_buff.png') })
console.log(JSON.stringify({ saw, errs: errs.slice(0, 3) }))
await browser.close()
