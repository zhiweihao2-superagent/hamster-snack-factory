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
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.coins = 800; sh.level = 3;
  sh.rats = [
    { line: 'tank', tier: 3, mod: '', talents: [{id:'tank',lv:3},{id:'care',lv:2},{id:'shot',lv:1}] },
    { line: 'shot', tier: 2, mod: '', talents: [{id:'shot',lv:2}] }
  ];
  sh.squad = [0,1,-1,-1,-1];
  window.__openShop(true);
  sh.detail = 0;
  sh.page = 'rat';
})()`)
await page.waitForTimeout(600)
await page.screenshot({ path: resolve(dir, 'tools', '_ratdetail.png') })
console.log('errors', errors)
await browser.close()
if (errors.length) process.exit(1)
