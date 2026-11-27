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
await page.waitForFunction('typeof window.__animInfo === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 6; sh.squad = [0, 1, 2, 3, 4];
  sh.rats = [{ line: 'tank', tier: 4, mod: '' }, { line: 'blade', tier: 4, mod: '' }, { line: 'shot', tier: 4, mod: '' }, { line: 'hex', tier: 4, mod: '' }, { line: 'care', tier: 4, mod: '' }];
  window.__shopNext();
  const r = window.__rpg();
  if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
})()`)

let seenHop = 0
let seenLift = 0
const samples = []
for (let i = 0; i < 90; i++) {
  const st = await page.evaluate(`window.__animInfo()`)
  const moving = st.filter((u) => u.moving)
  if (moving.length) {
    samples.push(moving.slice(0, 3).map((u) => u.frame + '@' + u.lift).join(' '))
    if (moving.some((u) => u.frame === 'hop')) seenHop++
    if (moving.some((u) => u.lift > 0)) seenLift++
  }
  await page.waitForTimeout(70)
}
console.log('moving samples:', samples.length)
console.log('first 8:', JSON.stringify(samples.slice(0, 8)))
console.log('saw hop frame:', seenHop, '| saw lift>0:', seenLift)
console.log('errs', errs.slice(0, 3))
await browser.close()
