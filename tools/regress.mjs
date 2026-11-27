/**
 * 规则回归：在无头浏览器里跑原工程自带的 __testRun，确认收编后规则数值没被改动。
 *   node tools/regress.mjs [局数]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const games = Number(process.argv[2]) || 20

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser, name } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__testRun === "function"', undefined, { timeout: 10000 })

const withTools = await page.evaluate(`window.__testRun(${games})`)
const noTools = await page.evaluate(`window.__testRun(${games}, 20261120, false)`)
const state = await page.evaluate('window.__gameState()')

await browser.close()
console.log(JSON.stringify({
  browser: name,
  errors,
  withTools: { winRate: withTools.winRate, levelReach: withTools.levelReach, stepsLeft: withTools.stepsLeft, avgCascade: withTools.avgCascade, maxCascade: withTools.maxCascade, stuck: withTools.stuck, picks: withTools.picks, toolsUsed: withTools.toolsUsed, errors: withTools.errors },
  noTools: { winRate: noTools.winRate, levelReach: noTools.levelReach, stepsLeft: noTools.stepsLeft, avgCascade: noTools.avgCascade, stuck: noTools.stuck },
  state,
}, null, 2))
