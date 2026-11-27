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
const st = await page.evaluate(`(() => {
  const sh = window.__shop(); sh.coins = 5000; sh.level = 3;
  sh.rats = [{ line:'tank', tier:4, mod:'', talents:[{id:'tank',lv:3}], skills:[{id:'chongya',lv:3},{id:'jiaban',lv:2}] }];
  sh.box = []; sh.squad = [0,-1,-1,-1,-1];
  window.__openShop(true); sh.page = 'gacha';
  return { rats: sh.rats.length, box: sh.box.length };
})()`)
await page.waitForTimeout(300)
await page.mouse.click(282, 314)   // 十连
await page.waitForTimeout(1700)
await page.mouse.click(195, 700)   // 关掉揭示
await page.waitForTimeout(300)
const after = await page.evaluate(`(() => { const sh = window.__shop(); return { rats: sh.rats.length, box: (sh.box||[]).length, page: sh.page }; })()`)
// 打开详情看四页签
await page.evaluate(`(() => { const sh = window.__shop(); sh.page = 'rat'; sh.detail = 0; sh.detailTab = 1; })()`)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_detail_skills.png') })
await page.evaluate(`window.__shop().detailTab = 0`)
await page.waitForTimeout(250)
await page.screenshot({ path: resolve(dir, 'tools', '_detail_talents.png') })
console.log('before', JSON.stringify(st), 'after', JSON.stringify(after))
console.log('errs', errs.slice(0,3))
await browser.close()
