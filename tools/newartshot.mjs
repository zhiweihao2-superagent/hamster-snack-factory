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
  const sh = window.__shop(); sh.coins = 2000; sh.level = 4; sh.shard = 80;
  sh.rats = [
    { line:'tank', tier:4, mod:'', talents:[{id:'tank',lv:2}], skills:[{id:'chongya',lv:2}] },
    { line:'hex', tier:3, mod:'', talents:[], skills:[] },
    { line:'none', tier:1, mod:'', talents:[], skills:[] }
  ];
  sh.squad = [0,1,-1,-1,-1];
  window.__openShop(true); sh.page = 'gacha';
})()`)
await page.waitForTimeout(500)
await page.screenshot({ path: resolve(dir, 'tools', '_gacha_newart.png') })
await page.evaluate(`(() => { const sh = window.__shop(); sh.page = 'fuse'; FOOBAR=0; })()`).catch(()=>{})
await page.evaluate(`(() => { const sh = window.__shop(); sh.page = 'fuse'; })()`)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_fuse_newart.png') })
await page.evaluate(`(() => { const sh = window.__shop(); sh.page = 'rat'; sh.detail = 1; sh.detailTab = 3; })()`)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_detail_newart.png') })
console.log('errs', errs.slice(0,3))
await browser.close()
