/**
 * 用游戏内的 __rpgSim 配平（instant 模式 + 会用工具 + 满能量放大招）。
 *   node tools/sim.mjs [局数] [种子]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const games = Number(process.argv[2]) || 16
const seed = Number(process.argv[3]) || 20261120

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpgSim === "function"')
const out = await page.evaluate(`window.__rpgSim(${games}, ${seed})`)
console.log(JSON.stringify(out, null, 0))
if (errors.length) console.log('page errors:', errors)
await browser.close()
