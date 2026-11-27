/**
 * 失败画面：把我方血量压到 1，等敌人打死全队，拍结算卡。
 *   node tools/losetest.mjs
 */
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const outDir = join(dir, '.studio', 'shots')
await mkdir(outDir, { recursive: true })

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.mouse.click(195, 560)
await page.waitForTimeout(400)

// 压血 → 敌人一出手就全灭
await page.evaluate(`(() => { window.__rpg().units.forEach(u => { if (u) { u.hp = 1; u.hpMax = 1 } }) })()`)
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(300)
  const st = await page.evaluate('window.__gameState()')
  if (st.phase !== 'playing') {
    console.log('phase:', st.phase, 'alive:', st.rpg.alive + '/' + st.rpg.total, 'kills:', st.rpg.kills)
    break
  }
}
await page.waitForTimeout(600)
await page.screenshot({ path: join(outDir, 'lose-card.jpg'), type: 'jpeg', quality: 85 })
console.log('shot saved; errors:', errors)
await browser.close()
