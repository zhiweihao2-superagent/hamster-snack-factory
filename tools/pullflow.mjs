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
  const sh = window.__shop(); sh.coins = 5000; sh.level = 3;
  sh.rats = [{ line: 'tank', tier: 3, mod: '', talents: [{id:'tank',lv:3}] }];
  sh.squad = [0,-1,-1,-1,-1];
  window.__openShop(true);
  sh.page = 'gacha';
})()`)
await page.waitForTimeout(300)
await page.mouse.click(282, 314)      // 十连
await page.waitForTimeout(1600)        // 含 320ms 启动帧
await page.mouse.click(195, 656)       // 去编队
await page.waitForTimeout(500)
await page.screenshot({ path: resolve(dir, 'tools', '_after_pull.png') })
const st = await page.evaluate(`(() => { const sh = window.__shop(); return { page: sh.page, rats: sh.rats.length, squad: sh.squad.filter(v=>v>=0).length, fresh: Object.keys(sh.fresh||{}).length, lines: sh.rats.map(r=>r.line+':'+r.tier).join(' ') }; })()`)
console.log(JSON.stringify(st), 'errors', errors)
await browser.close()
