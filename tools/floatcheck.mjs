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
await page.evaluate('window.__setTimeScale(2)')
let maxFloats = 0, mergedSeen = false, kinds = new Set()
const t0 = Date.now()
while (Date.now() - t0 < 14000) {
  await page.evaluate('window.__autoplay(window.__gameState())')
  const st = await page.evaluate(`(() => { const r = window.__rpg(); return { n: r.floats.length, f: r.floats.map(x => (x.kind||'') + ':' + x.text) }; })()`)
  maxFloats = Math.max(maxFloats, st.n)
  for (const f of st.f) { const [k, t] = f.split(':'); if (k) kinds.add(k); if (/^-\d{2,}/.test(t)) mergedSeen = true }
  await page.waitForTimeout(110)
}
console.log(JSON.stringify({ maxFloats, kinds: [...kinds], mergedSeen, errors }))
await browser.close()
if (errors.length) process.exit(1)
