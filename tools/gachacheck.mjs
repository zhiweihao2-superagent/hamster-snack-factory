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
  sh.coins = 2000; sh.level = 0;
  sh.rats = [{line:'tank',tier:3,mod:''},{line:'shot',tier:2,mod:''},{line:'blade',tier:1,mod:'',talents:[]}];
  sh.squad = [0,1,-1,-1,-1];
  window.__openShop(true);
})()`)
await page.waitForTimeout(300)
// 连抽 2000 次统计分布
const stat = await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 1000000;
  const cnt = {};
  for (let i = 0; i < 2000; i++){
    const r = window.__slot();
    const k = (r.prize || '').replace(/[0-9]+/g, 'N');
    cnt[k] = (cnt[k] || 0) + 1;
  }
  return { cnt, shard: sh.shard | 0 };
})()`)
console.log(JSON.stringify(stat))
await page.waitForTimeout(300)
await page.screenshot({ path: resolve(dir, 'tools', '_shop_p1.png') })
console.log('errors', errors)
await browser.close()
if (errors.length) process.exit(1)
