import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 3;
  sh.rats = [
    { line:'tank', tier:4, mod:'', talents:[{id:'tank',lv:3}], skills:[{id:'chongya',lv:3},{id:'jiaban',lv:2}] },
    { line:'hex', tier:4, mod:'', talents:[], skills:[] }
  ];
  sh.squad = [0,1,-1,-1,-1];
  window.__openShop(true); sh.page = 'rat'; sh.detail = 0; sh.detailTab = 1;
})()`)
await page.waitForTimeout(500)
await page.screenshot({ path: resolve(dir, 'tools', '_detail_skills.png') })
await browser.close()
