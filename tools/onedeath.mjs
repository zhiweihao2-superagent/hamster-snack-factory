/**
 * 只死一只时还能不能消：人为让 2 号单位阵亡，然后看步数是否继续下降。
 *   node tools/onedeath.mjs
 */
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
await page.mouse.click(195, 560)
await page.waitForTimeout(400)

const before = await page.evaluate(`(() => {
  const r = window.__rpg()
  r.units.forEach((u, i) => { if (u && i === 1) { u.hp = 0; u.alive = false } })
  return { steps: window.__gameState().hearts, alive: r.units.filter(u => u && u.alive).length }
})()`)
console.log('让人为阵亡 2 号单位后：', JSON.stringify(before))

for (let i = 0; i < 6; i++) {
  const act = await page.evaluate('window.__autoplay(window.__gameState())')
  await page.waitForTimeout(1000)
  const s = await page.evaluate(`(() => {
    const st = window.__gameState(), a = window.__animState()
    return { phase: st.phaseRaw, steps: st.hearts, anim: a && a.phase, alive: st.rpg.alive, dmg: st.score }
  })()`)
  console.log(i + 1, 'act=' + act, JSON.stringify(s))
}
console.log('errors:', errors)
await browser.close()
