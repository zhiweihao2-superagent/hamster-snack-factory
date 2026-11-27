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
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

const info = await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 999;
  sh.rats = [
    { line: 'tank', tier: 2, mod: '' },
    { line: 'shot', tier: 2, mod: '' },
    { line: 'blade', tier: 2, mod: '' },
    { line: 'hex', tier: 2, mod: '' },
    { line: 'care', tier: 2, mod: '' },
    { line: 'shot', tier: 3, mod: '' }
  ];
  sh.squad = [0,1,2,3,4];
  window.__rawNewRun(777);
  const st = window.__stage();
  return { rats: sh.rats.length, squad: sh.squad.slice(), units: st.units, foes: st.foes, ground: st.ground };
})()`)
console.log('rats', info.rats, 'squad', JSON.stringify(info.squad))
console.log('units', info.units.map(u => u ? u.name + '@' + u.x : '空').join(' | '))
console.log('foes', info.foes.map(f => f.name + '@' + f.x).join(' | '))

// 场上敌人数量随波次变化
const waves = await page.evaluate(`(() => {
  const out = [];
  const r = window.__rpg();
  for (let w = 0; w < r.waveTotal; w++) out.push(r.waveTotal ? 0 : 0);
  return { waveTotal: r.waveTotal, onField: (window.__stage().foes || []).length };
})()`)
console.log('waveTotal', waves.waveTotal, 'onField now', waves.onField)
console.log('errors', errors)
await browser.close()
