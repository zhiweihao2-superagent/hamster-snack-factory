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
  const sh = window.__shop(); sh.level = 6; sh.coins = 900;
  sh.rats = [{ line:'tank', tier:2, mod:'', talents:[{id:'tank',lv:2}], skills:[{id:'chongya',lv:2}] }];
  sh.squad = [0,-1,-1,-1,-1];
  sh.gears = { 'tank-3': 2, 'blade-3': 1, 'shot-4': 1 };
  window.__openShop(true); sh.page = 'rat'; sh.detail = 0; sh.detailTab = 2;
})()`)
await page.waitForTimeout(500)
await page.screenshot({ path: resolve(dir, 'tools', '_cert_icons.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
