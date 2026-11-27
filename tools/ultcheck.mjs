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
await page.waitForFunction('typeof window.__ultWhy === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
for (const lv of [1, 6]) {
  const info = await page.evaluate(`(() => {
    const sh = window.__shop();
    sh.rats = [{line:'tank',tier:2,mod:''},{line:'shot',tier:2,mod:''},{line:'blade',tier:2,mod:''},{line:'hex',tier:2,mod:''},{line:'care',tier:2,mod:''}];
    sh.squad = [0,1,2,3,4]; sh.level = ${lv} - 1; window.__shopNext();
    const r = window.__rpg();
    r.energy = 999;
    const before = r.energy;
    const fired = window.__rpgUlt ? window.__rpgUlt() : null;
    return { level: sh.level, noUlt: !!(r.mod && r.mod.noUlt), why: window.__ultWhy(),
             energyBefore: before, fired, energyAfter: Math.round(r.energy) };
  })()`)
  console.log('L' + lv, JSON.stringify(info))
}
console.log('errors', errors)
await browser.close()
