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
await page.waitForFunction('typeof window.__rollRatDebug === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

// 保底：把计数压到 9，再抽一次应该必出二级
const pity = await page.evaluate(`(() => {
  const sh = window.__shop();
  const out = [];
  for (let i = 0; i < 5; i++){
    sh.tier2Pity = 9;
    const r = window.__rollRatDebug();
    out.push(r.tier);
  }
  sh.tier2Pity = 0;
  return out;
})()`)
console.log('pity forced tiers:', JSON.stringify(pity))

// 造一只有技能的鼠，看详情页技能块
await page.evaluate(`(() => {
  const sh = window.__shop(); sh.coins = 900; sh.level = 2; sh.gears = {};
  sh.rats = [{ line: 'hex', tier: 2, mod: '',
    talents: [{ id: 'hex', lv: 2 }, { id: 'tank', lv: 1 }],
    skills: [{ id: 'huoqiu', lv: 2 }, { id: 'shandian', lv: 3 }, { id: 'jiaban', lv: 1 }, { id: 'chongya', lv: 1 }] }];
  sh.squad = [0, -1, -1, -1, -1];
  window.__openShop(true);
  sh.detail = 0; sh.page = 'rat';
})()`)
await page.waitForTimeout(500)
await page.screenshot({ path: resolve(dir, 'tools', '_skills.png') })
console.log('errors', errors)
await browser.close()
