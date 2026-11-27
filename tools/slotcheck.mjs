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
await page.waitForFunction('typeof window.__slot === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 500;
  sh.rats = [{ line: 'tank', tier: 1, mod: '' }];
  sh.squad = [0, -1, -1, -1, -1];
  sh.level = 0;
  window.__openShop(true);
})()`)
await page.waitForTimeout(400)
const rolls = []
for (let i = 0; i < 6; i++) {
  rolls.push(await page.evaluate('window.__slot()'))
}
console.log(JSON.stringify(rolls))
await page.waitForTimeout(300)
await page.screenshot({ path: resolve(dir, 'tools', '_slot.png') })
console.log('errors', errors)
await browser.close()
if (errors.length) process.exit(1)
