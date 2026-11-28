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
  const sh = window.__shop(); sh.coins = 900; sh.level = 3;
  const mk = (line) => ({ line, tier: 3, mod: '', talents: [{id: line, lv: 2}], skills: [{id:'chongya', lv: 2}] });
  sh.rats = [mk('tank'),mk('blade'),mk('shot'),mk('hex'),mk('care'),mk('tank'),mk('blade'),mk('shot'),mk('hex'),mk('care')];
  sh.squad = [0,1,2,3,4];
  window.__openShop(true);
  sh.mainTab = 'team'; sh.ratPage = 0;
})()`)
await page.waitForTimeout(700)
await page.screenshot({ path: resolve(dir, 'tools', '_page_arrows.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
