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
await page.waitForFunction('typeof window.__shopNext === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
for (const lv of [1, 6]) {
  const info = await page.evaluate(`(() => {
    const sh = window.__shop();
    sh.rats = [{line:'tank',tier:2,mod:''},{line:'shot',tier:2,mod:''}]; sh.squad=[0,1,-1,-1,-1];
    sh.level = ${lv} - 1; window.__shopNext();
    const r = window.__rpg();
    return { level: sh.level, phase: window.__gameState().phaseRaw, brief: r.cfg && r.cfg.brief,
             armorMax: r.armorMax, partsMax: r.partsMax, energyMax: r.energyMax };
  })()`)
  // 简报阶段点一下开打
  const after = await page.evaluate(`(() => {
    const st = window.__gameState();
    if (st.phaseRaw === 'brief') { window.__autoplay(st); return { dismissedBy: 'autoplay', phase: window.__gameState().phaseRaw }; }
    return { dismissedBy: 'already', phase: st.phaseRaw };
  })()`)
  console.log('L' + lv, JSON.stringify(info), '→', JSON.stringify(after))
}
// 大招伤害随人数
const ult = await page.evaluate(`(() => {
  const r = window.__rpg();
  const before = r.enemies.filter(Boolean).map(f => Math.round(f.hp));
  r.energy = 999;
  window.__rpgUlt();
  const after = r.enemies.filter(Boolean).map(f => Math.round(f.hp));
  return { aliveUnits: r.units.filter(u => u && u.alive).length, before, after };
})()`)
console.log('ult:', JSON.stringify(ult))
console.log('errors', errors)
await browser.close()
if (errors.length) process.exit(1)
