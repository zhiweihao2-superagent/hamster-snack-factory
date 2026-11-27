import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', e => errs.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__foeMake === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const sets = await page.evaluate(`(() => { const F = window.UNIT_FRAMES || {}; return Object.keys(F).filter(k => k.indexOf('foe-blast') === 0); })()`)
console.log('blast sets', JSON.stringify(sets))
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 6; sh.squad = [0,1,2,3,4];
  sh.rats = [{line:'tank',tier:4,mod:''},{line:'blade',tier:4,mod:''},{line:'shot',tier:4,mod:''},{line:'hex',tier:4,mod:''},{line:'care',tier:4,mod:''}];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  r.queue = [];
  r.enemies = [1,2,3,4].map(function(t, i){ const f = window.__foeMake('blast', t); f.slot = i; f.x = 260; f.y = 200 + i*40; return f; });
})()`)
await page.waitForTimeout(1600)
await page.screenshot({ path: resolve(dir, 'tools', '_blast_new.png') })
await page.waitForTimeout(2200)
await page.screenshot({ path: resolve(dir, 'tools', '_blast_new2.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
