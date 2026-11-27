/**
 * 统计一局里三选一弹了几次、在第几波之间。
 *   node tools/pickfreq.mjs
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
await page.waitForFunction('typeof window.__setTimeScale === "function"')
await page.evaluate('window.__setTimeScale(3)')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

const picks = []
let lastWave = -1
for (let i = 0; i < 400; i++) {
  const s = await page.evaluate(`(() => {
    const st = window.__gameState()
    return { phase: st.phaseRaw, wave: st.rpg.wave, cards: (window.__rpg().pick || []).map(b => b.id) }
  })()`)
  if (s.phase === 'pick' && s.cards.length && !picks.some(p => p.wave === s.wave && p.cards.join() === s.cards.join())) {
    picks.push({ wave: s.wave, cards: s.cards })
  }
  if (s.phase !== 'play' && s.phase !== 'pick') break
  await page.evaluate('window.__autoplay(window.__gameState())')
  await page.waitForTimeout(110)
}
console.log('本局弹了三选一', picks.length, '次:', JSON.stringify(picks))
console.log('errors:', errors)
await browser.close()
