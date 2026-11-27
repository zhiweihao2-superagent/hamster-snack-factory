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
  const sh = window.__shop(); sh.coins = 800; sh.level = 3;
  sh.rats = [
    { line:'tank', tier:4, mod:'', talents:[{id:'tank',lv:3},{id:'care',lv:2}], skills:[{id:'chongya',lv:3},{id:'huangyou',lv:2}] },
    { line:'shot', tier:3, mod:'', talents:[{id:'shot',lv:2}], skills:[{id:'chuangjia',lv:1},{id:'bingshuang',lv:2}] }
  ];
  sh.squad = [0,1,-1,-1,-1];
  window.__openShop(true); sh.page = 'fuse';
})()`)
await page.waitForTimeout(300)
await page.mouse.click(70, 120)
await page.waitForTimeout(150)
await page.mouse.click(190, 120)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_fuse_info.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
