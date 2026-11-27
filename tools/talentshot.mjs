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
await page.waitForTimeout(500)
const out = await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.level = 1;
  sh.rats = [
    { line: 'tank',  tier: 3, mod: '', talents: [{ id: 'tank', lv: 3 }, { id: 'care', lv: 2 }] },
    { line: 'shot',  tier: 3, mod: '', talents: [{ id: 'shot', lv: 3 }] },
    { line: 'blade', tier: 3, mod: '', talents: [{ id: 'blade', lv: 3 }] },
    { line: 'hex',   tier: 2, mod: '', talents: [{ id: 'hex', lv: 2 }] },
    { line: 'care',  tier: 2, mod: '', talents: [{ id: 'care', lv: 2 }] }
  ];
  sh.squad = [0,1,2,3,4];
  window.__shopNext();
  const r = window.__rpg();
  if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  return r.units.filter(Boolean).map(u => u.name + ':' + (u.talents || []).map(t => t.id + t.lv).join(','));
})()`)
await page.waitForTimeout(2500)
await page.screenshot({ path: resolve(dir, 'tools', '_talents.png') })
console.log(JSON.stringify(out), 'errors', errors)
await browser.close()
if (errors.length) process.exit(1)
