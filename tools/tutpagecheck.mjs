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
await page.waitForFunction('typeof window.__swapAt === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => { const sh = window.__shop(); sh.level = 0; sh.squad=[0,1,-1,-1,-1]; window.__shopNext(); })()`)
await page.waitForTimeout(400)

const s0 = await page.evaluate(`(() => { const r = window.__rpg(); return { tut: !!r.tut, tutSwap: !!r.tutSwap, tutRes: r.tutRes }; })()`)
// 照教学走一手
await page.evaluate(`(() => { const r = window.__rpg(); const mv = r.tutMove; if (mv) window.__swapAt(mv[0], mv[1]); })()`)
await page.waitForTimeout(700)
const s1 = await page.evaluate(`(() => { const r = window.__rpg(); return { tutSwap: !!r.tutSwap, tutRes: r.tutRes, timers: r.enemies.filter(Boolean).map(f => Math.round(f.timerMs)) }; })()`)
// 点三下翻页（每次点画布）
for (let i = 0; i < 3; i++) { await page.mouse.click(195, 1300 / 2); await page.waitForTimeout(320) }
const s2 = await page.evaluate(`(() => { const r = window.__rpg(); return { tutRes: r.tutRes, tutUlt: !!r.tutUlt, timers: r.enemies.filter(Boolean).map(f => Math.round(f.timerMs)) }; })()`)
await page.waitForTimeout(900)
const s3 = await page.evaluate(`(() => { const r = window.__rpg(); return { timers: r.enemies.filter(Boolean).map(f => Math.round(f.timerMs)) }; })()`)
console.log(JSON.stringify({ s0, afterSwap: s1, afterTaps: s2, resumed: s3, errors }))
await browser.close()
if (errors.length) process.exit(1)
