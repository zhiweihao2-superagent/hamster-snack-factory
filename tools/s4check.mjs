import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => console.error('ERR', e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__stage === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

// 造一队带物理技能的鼠，观察技能是否释放（看战况/飘字/伤害跳变）
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 3; sh.squad = [0,1,2];
  sh.rats = [
    { line: 'blade', tier: 4, mod: '', talents: [{id:'blade',lv:2}],
      skills: [{id:'chongya',lv:3},{id:'qiexiao',lv:3}] },
    { line: 'shot', tier: 4, mod: '', talents: [{id:'shot',lv:2}],
      skills: [{id:'chuanjia',lv:3}] },
    { line: 'tank', tier: 4, mod: '', talents: [{id:'tank',lv:2}],
      skills: [{id:'duantou',lv:3}] }
  ];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  window.__setTimeScale(1);
})()`)
await page.waitForTimeout(5200)
const before = await page.evaluate(`(() => { const r = window.__rpg();
  return { dmg: Math.round(r.dmgDealt), skills: r.units.filter(Boolean).map(u => (u.skills||[]).map(s => s.id + ':' + Math.round((s.readyAt||0)/1000)).join('|')) }; })()`)
await page.waitForTimeout(4000)
const after = await page.evaluate(`(() => { const r = window.__rpg();
  return { dmg: Math.round(r.dmgDealt), fx: (r.skillFx||[]).length,
           skills: r.units.filter(Boolean).map(u => (u.skills||[]).map(s => s.id + ':' + Math.round((s.readyAt||0)/1000)).join('|')) }; })()`)
await page.screenshot({ path: resolve(dir, 'tools', '_skills_cast.png') })
console.log('before', JSON.stringify(before))
console.log('after ', JSON.stringify(after))
console.log('errors', errors)
await browser.close()
