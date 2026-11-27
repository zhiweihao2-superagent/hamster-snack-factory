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
await page.waitForTimeout(400)
const r = await page.evaluate(`(() => {
  const g = window.GAME.rules;
  const sh = window.__shop(); sh.level = 3; sh.squad = [0,1,2];
  sh.rats = [{line:'tank',tier:3,mod:''},{line:'hex',tier:3,mod:''},{line:'shot',tier:2,mod:''}];
  window.__shopNext();
  const rpg = window.__rpg();
  const foes = rpg.enemies.filter(Boolean).map(f => ({ type: f.type, name: f.name, resP: f.resP, resM: f.resM, hp: Math.round(f.hpMax) }));
  return { foeResCfg: g.foeRes, ratStats: g.ratStats.tank, foes, kinds: window.__kindCheck ? window.__kindCheck() : null };
})()`)
console.log(JSON.stringify(r).slice(0, 700))
console.log('errors', errors)
await browser.close()
