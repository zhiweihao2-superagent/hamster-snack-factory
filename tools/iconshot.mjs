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
await page.waitForFunction('typeof window.__rpg === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
const keys = await page.evaluate(`Object.keys(window.UNIT_ART || {}).filter(k => /^(buff|gear|mod|snack|tool)-/.test(k))`)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 0; sh.squad=[0,1,-1,-1,-1]; window.__shopNext();
  const r = window.__rpg();
  if (r.tut && !r.tutSwap) { r.tutSwap = true; r.tutUlt = true; }
  r.pick = [{ id: 'dmgUp', name: '磨快牙口', desc: '本关我方伤害 +25%', apply: function(){} },
            { id: 'repair', name: '紧急修理', desc: '全队恢复 25 点生命', apply: function(){} },
            { id: 'energy', name: '备用电瓶', desc: '能量 +50', apply: function(){} }];
  window.__gameState().phaseRaw;
})()`)
await page.evaluate(`(() => { const S = window.__rpg(); })()`)
// 强制进入 pick 阶段
await page.evaluate(`(() => { window.__forcePick && window.__forcePick(); })()`)
await page.waitForTimeout(200)
const phase = await page.evaluate('window.__gameState().phaseRaw')
console.log('icon keys:', keys.length, keys.slice(0, 6).join(','), 'phase:', phase)
await page.screenshot({ path: resolve(dir, 'tools', '_icons.png') })
console.log('errors', errors)
await browser.close()
