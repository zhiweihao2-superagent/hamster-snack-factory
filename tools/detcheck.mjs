import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
/* 测量前先确认 dist 比源码新：node tools/checkbuild.mjs（否则测到的是旧构建） */
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpgSim === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
const r = await page.evaluate('window.__rpgSim(24)')
console.log('deterministic __rpgSim(24):', JSON.stringify(r))
console.log('errors:', errors)
await browser.close()
