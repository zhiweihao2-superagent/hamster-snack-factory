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
await page.waitForFunction('typeof window.__codex === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)

// 图鉴数据
const rows = await page.evaluate('window.__codex()')
console.log('codex rows:', rows.length, '×', rows[0].cells.length)
for (const r of rows) console.log(' ', r.label, r.cells.map(c => c.name + '(' + c.hp + ')' + (c.weapon ? '/' + c.weapon : '')).join(' | '))

// 提示横幅：进第 1 关后立刻读 banner
const tip = await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 1; sh.squad=[0,1,-1,-1,-1]; window.__shopNext();
  const r = window.__rpg();
  return { banner: r.banner && r.banner.text, holdMs: r.banner && r.banner.holdMs, log: (r.log||[]).slice(-2) };
})()`)
console.log('L1 banner:', JSON.stringify(tip))

// 图鉴渲染冒烟：切到 shop + codex 跑几帧，看有没有报错
await page.evaluate(`(() => { const sh = window.__shop(); sh.codex = true; })()`)
await page.evaluate(`(() => { const g = window.__gameState; window.S_TEST = 1; })()`)
await page.waitForTimeout(600)
console.log('errors after codex frame:', errors)
await browser.close()
if (errors.length) process.exit(1)
