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
  const sh = window.__shop(); sh.level = 4; sh.coins = 900;
  const mk = (line, sk) => ({ line, tier: 4, mod: '', talents: [], skills: sk });
  sh.rats = [
    mk('tank', [{id:'chongya',lv:2},{id:'huangyou',lv:1}]),
    mk('blade', [{id:'qiexiao',lv:2}]),
    mk('shot', [{id:'chuanjia',lv:2}]),
    mk('hex', [{id:'huoqiu',lv:2},{id:'shandian',lv:1}]),
    mk('care', [{id:'tangfen',lv:1}])
  ];
  sh.squad = [0,1,2,3,4];
  window.__shopNext();
  const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
})()`)
await page.waitForTimeout(5200)
for (let i = 0; i < 3; i++){
  await page.waitForTimeout(700)
  await page.screenshot({ path: resolve(dir, 'tools', `_skhud${i}.png`) })
}
console.log('errs', errs.slice(0,3))
await browser.close()
