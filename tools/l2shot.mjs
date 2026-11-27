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
await page.waitForFunction('typeof window.__foeArt === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 1; sh.squad = [0,1,2,3,4];
  sh.rats = [{line:'tank',tier:3,mod:''},{line:'shot',tier:3,mod:''},{line:'blade',tier:3,mod:''},{line:'hex',tier:2,mod:''},{line:'care',tier:2,mod:''}];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
})()`)
await page.waitForTimeout(1500)
await page.screenshot({ path: resolve(dir, 'tools', '_l2.png') })
const diag = await page.evaluate('window.__artDiag()')
console.log('diag', JSON.stringify(diag), 'errors', errors)
await browser.close()
