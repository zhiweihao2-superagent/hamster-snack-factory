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
const frames = await page.evaluate(`(() => { const F = window.UNIT_FRAMES || {}; const k = Object.keys(F);
  return { total: k.length, none: k.filter(x => x.indexOf('none') === 0), blast: k.filter(x => x.indexOf('foe-blast') === 0), fx: k.filter(x => x.indexOf('fx-blast') === 0) }; })()`)
console.log('frames', JSON.stringify(frames))
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 6; sh.squad = [0,1,2,3,4];
  sh.rats = [{line:'none',tier:1,mod:''},{line:'tank',tier:4,mod:''},{line:'blade',tier:4,mod:''},{line:'shot',tier:4,mod:''},{line:'hex',tier:4,mod:''}];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  const f = window.__foeMake('blast', 2); f.slot = 0; f.x = 150; f.y = 250; f.hp = Math.round(f.hpMax * 0.3);
  r.enemies = [f]; r.queue = [];
  window.__blast = f;
})()`)
await page.waitForTimeout(1500)
await page.screenshot({ path: resolve(dir, 'tools', '_codexart.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
