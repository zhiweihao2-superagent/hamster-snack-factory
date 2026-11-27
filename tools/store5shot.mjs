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
  const sh = window.__shop(); sh.coins = 1200; sh.level = 4; sh.shard = 40;
  const mk = (line, tier) => ({ line, tier, mod: '', talents: [{ id: line, lv: 2 }], skills: [{ id: 'chongya', lv: 2 }] });
  sh.rats = [mk('tank',4), mk('blade',3), mk('shot',4), mk('hex',4), mk('care',3), mk('none',1)];
  sh.squad = [0,1,2,3,4];
  window.__openShop(true);
  sh.mainTab = 'shop';
})()`)
await page.waitForTimeout(500)
await page.screenshot({ path: resolve(dir, 'tools', '_store5.png') })
await page.evaluate(`(() => { const sh = window.__shop(); sh.page = 'gacha'; })()`)
await page.waitForTimeout(450)
await page.screenshot({ path: resolve(dir, 'tools', '_gacha_slot.png') })
await page.evaluate(`(() => { const sh = window.__shop(); sh.page = ''; sh.mainTab = 'team'; })()`)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_team_clean.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
