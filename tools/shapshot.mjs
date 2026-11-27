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
await page.waitForFunction('typeof window.__openShop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
const out = await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 400;
  sh.rats = [{ line: 'tank', tier: 1, mod: '' }, { line: 'shot', tier: 2, mod: 'goggles' }];
  sh.squad = [0, 1, -1, -1, -1];
  const phase = window.__openShop(true);
  return { phase, offers: (sh.offers || []).map(o => o.kind + ':' + (o.line || o.mod || '')) };
})()`)
await page.waitForTimeout(600)
await page.screenshot({ path: resolve(dir, 'tools', '_shop.png') })
console.log(JSON.stringify(out), 'errors', errors)
await browser.close()
if (errors.length) process.exit(1)
