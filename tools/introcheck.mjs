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
await page.waitForTimeout(600)

// 第 1 关：教学暂停 —— 敌人计时不该动
const tut = await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 0; sh.squad=[0,1,-1,-1,-1]; window.__shopNext();
  const r = window.__rpg();
  const t0 = r.enemies.filter(Boolean).map(f => Math.round(f.timerMs));
  return { tut: !!r.tut, tutSwap: !!r.tutSwap, intro: r.intro, enemyTimers: t0, phase: window.__gameState().phaseRaw };
})()`)
await page.waitForTimeout(1500)
const paused = await page.evaluate(`(() => { const r = window.__rpg(); return { enemyTimers: r.enemies.filter(Boolean).map(f => Math.round(f.timerMs)), tutSwap: !!r.tutSwap }; })()`)
console.log('L1 tutorial:', JSON.stringify(tut), '→ after 1.5s:', JSON.stringify(paused))

// 模拟一次成功交换后：教学应放行，出现资源说明
const swapped = await page.evaluate(`(() => {
  const st = window.__gameState();
  return { cand: window.__bestMove ? !!window.__bestMove() : null, steps: st.steps };
})()`)
console.log('board playable:', JSON.stringify(swapped))

// 第 2 关：倒计时 5 秒
const intro = await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 1; window.__shopNext();   // 跳到第 2 关
  const r = window.__rpg();
  return { level: sh.level, intro: r.intro && Math.round(r.intro.dur), brief: r.cfg && r.cfg.brief, tut: !!r.tut };
})()`)
console.log('L2 intro:', JSON.stringify(intro))
console.log('errors', errors)
await browser.close()
if (errors.length) process.exit(1)
