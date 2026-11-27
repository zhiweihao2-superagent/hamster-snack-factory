import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto('http://127.0.0.1:8791/')
await page.waitForTimeout(1800)
const state = await page.evaluate("document.querySelectorAll('#tbl tbody tr').length")
await page.screenshot({ path: resolve(dir, 'tools', '_editor.png') })
console.log('rows', state, 'errors', errors)
await browser.close()
if (errors.length) process.exit(1)
