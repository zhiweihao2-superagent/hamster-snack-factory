/**
 * 开场教学 / 倒计时自检：
 *   node tools/tutflowcheck.mjs
 * 1) 第 1 关进入后是教学暂停：敌人计时不动；
 * 2) 走一手有效交换（__swapAt 走完整包装链）后解除暂停，敌人开始计时；
 * 3) 满能量放爆产后教学完成；
 * 4) 第 2 关是 5 秒倒计时（intro.dur = 5000）。
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__swapAt === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

await page.evaluate(`(() => { const sh = window.__shop(); sh.level = 0; sh.squad = [0,1,-1,-1,-1]; window.__shopNext(); })()`)
await page.waitForTimeout(200)
const before = await page.evaluate(`(() => { const r = window.__rpg();
  return { tut: !!r.tut, tutSwap: !!r.tutSwap, intro: r.intro,
           timers: r.enemies.filter(Boolean).map(f => Math.round(f.timerMs)) }; })()`)
await page.waitForTimeout(1200)
const pausedTimers = await page.evaluate(`(() => { const r = window.__rpg();
  return r.enemies.filter(Boolean).map(f => Math.round(f.timerMs)); })()`)

await page.evaluate(`(() => { const mv = window.__bestMove(); if (mv) window.__swapAt(mv[0], mv[1]); })()`)
await page.waitForTimeout(1400)
const after = await page.evaluate(`(() => { const r = window.__rpg();
  return { tutSwap: !!r.tutSwap, timers: r.enemies.filter(Boolean).map(f => Math.round(f.timerMs)),
           energy: Math.round(r.energy) }; })()`)

const ult = await page.evaluate(`(() => { const r = window.__rpg(); r.energy = 999;
  const fired = window.__rpgUlt(); return { fired, tutUlt: !!r.tutUlt }; })()`)

const next = await page.evaluate(`(() => { const sh = window.__shop(); sh.level = 1; window.__shopNext();
  const r = window.__rpg(); return { level: sh.level, intro: r.intro && Math.round(r.intro.dur),
                                     brief: r.cfg && r.cfg.brief, tut: !!r.tut }; })()`)

console.log(JSON.stringify({ before, pausedTimers, after, ult, next, errors }, null, 1))
await browser.close()
if (errors.length) process.exit(1)
