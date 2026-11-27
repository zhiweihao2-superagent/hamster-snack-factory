/**
 * 排查：为什么不同关卡刷到的证一样。
 *   node tools/dbg-unlock.mjs
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.mouse.click(195, 560)
await page.waitForTimeout(300)

const out = await page.evaluate(`(() => {
  const S = window.__shop()
  const rows = []
  S.level = 7
  const info = window.__rollInfo()
  for (let i = 0; i < 6; i++) {
    S.phase = 'play'
    window.__shopOpen()
    rows.push(S.offers[0].line + '-' + S.offers[0].tier)
  }
  return { info, rows }
})()`)
console.log(JSON.stringify(out, null, 1))
await browser.close()
