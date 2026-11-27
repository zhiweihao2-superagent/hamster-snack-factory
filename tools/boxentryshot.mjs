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
  const sh = window.__shop(); sh.coins = 3000; sh.level = 2;
  sh.rats = [];
  for (let i = 0; i < 12; i++) sh.rats.push({ line: 'none', tier: 1, mod: '', talents: [{ id: 'tank', lv: 1 }] });
  sh.box = [];
  for (let i = 0; i < 4; i++) sh.box.push({ line: 'none', tier: 1, mod: '', talents: [{ id: 'blade', lv: 1 }] });
  sh.squad = [0,1,2,-1,-1];
  window.__openShop(true);
})()`)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_box_entry.png') })
console.log('errors', errors)
await browser.close()
