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
  sh.rats = [
    { line:'tank', tier:4, mod:'', talents:[{id:'tank',lv:3}], skills:[{id:'chongya',lv:2}] },
    { line:'blade', tier:3, mod:'', talents:[{id:'blade',lv:2}], skills:[] },
    { line:'shot', tier:4, mod:'', talents:[], skills:[{id:'chuangjia',lv:1}] },
    { line:'hex', tier:4, mod:'', talents:[], skills:[] },
    { line:'care', tier:3, mod:'', talents:[], skills:[] }
  ];
  sh.squad = [0,1,2,3,4];
  sh.box = [{ line:'hex', tier:2, mod:'', talents:[], skills:[] }];
  window.__openShop(true);
})()`)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_icons_shop.png') })
await page.evaluate(`window.__shop().page = 'box'`)
await page.waitForTimeout(350)
await page.screenshot({ path: resolve(dir, 'tools', '_icons_box.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
