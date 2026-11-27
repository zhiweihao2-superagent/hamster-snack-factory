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
  const sh = window.__shop(); sh.level = 3; sh.squad = [0, 1, 2];
  sh.rats = [
    { line: 'hex', tier: 4, mod: '', talents: [], skills: [{ id: 'huoqiu', lv: 3 }] },
    { line: 'hex', tier: 4, mod: '', talents: [], skills: [{ id: 'bingshuang', lv: 3 }] },
    { line: 'hex', tier: 4, mod: '', talents: [], skills: [{ id: 'shandian', lv: 3 }] }
  ];
  window.__shopNext();
  const r = window.__rpg();
  if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
})()`)

let sawBurn = false
let sawSlow = false
let maxDmg = 0
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(300)
  const st = await page.evaluate(`(() => {
    const r = window.__rpg();
    const now = performance.now();
    return {
      dmg: Math.round(r.dmgDealt),
      burn: r.enemies.some((f) => f && f.alive && f.ember && f.ember.until > now),
      slow: r.enemies.some((f) => f && f.alive && f.slowUntil && f.slowUntil > now)
    };
  })()`)
  if (st.burn) sawBurn = true
  if (st.slow) sawSlow = true
  maxDmg = st.dmg
}
console.log(JSON.stringify({ sawBurn, sawSlow, maxDmg, errs: errs.slice(0, 3) }))
await page.screenshot({ path: resolve(dir, 'tools', '_magic.png') })
await browser.close()
