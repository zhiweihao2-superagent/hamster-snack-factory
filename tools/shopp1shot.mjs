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
  sh.coins = 300; sh.level = 2;
  sh.rats = [
    { line: 'tank', tier: 3, mod: '', talents: [{id:'tank',lv:3},{id:'care',lv:2}] },
    { line: 'shot', tier: 2, mod: '', talents: [{id:'shot',lv:2}] },
    { line: 'blade', tier: 1, mod: 'goggles', talents: [] }
  ];
  sh.squad = [0,1,-1,-1,-1];
  window.__openShop(true);
  window.__slot();
})()`)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_shop_p1.png') })
const info = await page.evaluate(`(() => { const sh = window.__shop(); return { shard: sh.shard|0, coins: sh.coins|0, rats: sh.rats.map(r => r.line + ':' + (r.talents||[]).map(t=>t.id+t.lv).join('/') ) }; })()`)
console.log(JSON.stringify(info), 'errors', errors)
await browser.close()
if (errors.length) process.exit(1)
