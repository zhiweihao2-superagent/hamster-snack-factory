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
await page.waitForTimeout(600)
await page.evaluate('window.__setTimeScale(2)')

const snap = []
let maxShots = 0, sawWindup = false
const t0 = Date.now()
while (Date.now() - t0 < 14000) {
  await page.evaluate('window.__autoplay(window.__gameState())')
  const st = await page.evaluate('window.__stage()')
  maxShots = Math.max(maxShots, st.shots)
  if ([...st.units, ...st.foes].some(o => o && o.windup > 0)) sawWindup = true
  if (snap.length < 3) snap.push(st.units.map(u => u ? u.name + '@' + u.x : '空').join(' | ') + '  ||  ' + st.foes.map(f => f.name + '@' + f.x).join(' | '))
  await page.waitForTimeout(700)
}
const st = await page.evaluate('window.__stage()')
console.log('ground', st.ground, 'sprite', st.sprite, 'reach', st.reach)
snap.forEach((s, i) => console.log('t' + i, s))
console.log('final', st.units.map(u => u ? u.name + '@' + u.x : '空').join(' | '), '||', st.foes.map(f => f.name + '@' + f.x).join(' | '))
console.log(JSON.stringify({ maxShots, sawWindup, errors }))
await browser.close()
if (errors.length) process.exit(1)
