import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message ?? e)))

const step = {}
const snap = async (label) => {
  const s = await page.evaluate(`(() => {
    const sh = window.__shop();
    const r = window.__rpg ? window.__rpg() : { units: [] };
    return {
      page: sh.page || '(shop)', coins: sh.coins | 0, shard: sh.shard | 0,
      rats: sh.rats.length,
      squad: (sh.squad || []).filter((v) => v >= 0).length,
      phase: (window.__gameState ? window.__gameState().phaseRaw : '?'),
      level: sh.level, talents: sh.rats.map((x) => (x.talents || []).length).join('')
    };
  })()`)
  step[label] = s
  return s
}

await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)

await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 6000; sh.shard = 40; sh.level = 4;
  sh.rats = [
    { line: 'tank', tier: 3, mod: '', talents: [{ id: 'tank', lv: 3 }] },
    { line: 'shot', tier: 3, mod: '', talents: [{ id: 'shot', lv: 2 }] }
  ];
  sh.squad = [0, 1, -1, -1, -1];
  window.__openShop(true);
})()`)
await snap('shop')

/* 抽卡：十连 */
await page.evaluate(`window.__shop().page = 'gacha'`)
await page.waitForTimeout(300)
await page.mouse.click(282, 314)
await page.waitForTimeout(1500)
await page.mouse.click(195, 700)      // 点屏幕跳过揭示
await page.waitForTimeout(300)
await snap('afterGacha')

/* 炼妖 */
await page.evaluate(`(() => { const sh = window.__shop(); sh.page = 'fuse'; })()`)
await page.waitForTimeout(300)
await page.mouse.click(70, 120)
await page.waitForTimeout(150)
await page.mouse.click(190, 120)
await page.waitForTimeout(200)
await page.mouse.click(195, 423)
await page.waitForTimeout(1600)
await page.mouse.click(195, 760)      // 跳过动画
await page.waitForTimeout(300)
await snap('afterFuse')

/* 回商店 → 下一关 → 打一会儿 */
await page.evaluate(`window.__shop().page = ''`)
await page.waitForTimeout(300)
await page.mouse.click(305, 782)
await page.waitForTimeout(1200)
await page.keyboard.press('Enter')     // 关掉开场倒计时（如有）
for (let i = 0; i < 40; i++) {
  await page.evaluate('window.__autoplay(window.__gameState())')
  await page.waitForTimeout(150)
}
await snap('battle')
await page.screenshot({ path: resolve(dir, 'tools', '_smoke.png') })

console.log(JSON.stringify(step, null, 1))
console.log('errors', errors)
await browser.close()
if (errors.length) process.exit(1)
