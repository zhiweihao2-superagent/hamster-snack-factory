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
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 4; sh.coins = 900;
  sh.rats = [{line:'tank',tier:4,mod:''},{line:'blade',tier:4,mod:''},{line:'shot',tier:4,mod:''},{line:'hex',tier:4,mod:''},{line:'care',tier:4,mod:''}];
  sh.squad = [0,1,2,3,4];
  window.__shopNext();
})()`)
await page.waitForTimeout(900)
await page.screenshot({ path: resolve(dir, 'tools', '_intro_card.png') })
await page.waitForTimeout(4200)
await page.screenshot({ path: resolve(dir, 'tools', '_intro_gone.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
