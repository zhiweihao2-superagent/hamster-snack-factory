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
await page.waitForFunction('typeof window.__bet === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
const run = async (hurt) => page.evaluate(`(() => {
  const sh = window.__shop(); sh.coins = 300; sh.level = 0;
  sh.rats = [{line:'tank',tier:3,mod:''},{line:'shot',tier:3,mod:''}];
  sh.squad = [0,1,-1,-1,-1];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  window.__openPick();
  const betIdx = r.pick.findIndex(p => p.id === 'bet');
  const before = window.__bet();
  window.__chooseBuff ? window.__chooseBuff(betIdx) : null;
  return { betIdx, before };
})()`)
const a = await run(false)
console.log('before bet', JSON.stringify(a))
console.log('errors', errors)
await browser.close()
