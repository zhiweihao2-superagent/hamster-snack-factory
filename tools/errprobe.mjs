import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + (e.message || e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForTimeout(1500)
await page.keyboard.press('Enter')
await page.waitForTimeout(3000)
console.log('errors', JSON.stringify(errs.slice(0, 5)))
const st = await page.evaluate(`(() => { try { const s = window.__stage(); return { ok: true, n: s.units.filter(Boolean).length }; } catch(e){ return { ok:false, err:String(e.message) }; } })()`)
console.log('stage', JSON.stringify(st))
await browser.close()
