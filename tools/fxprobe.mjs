import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', e => errs.push(String(e.message ?? e)))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const info = await page.evaluate(`(() => {
  const ids = Object.keys(window.FX_ART || {});
  const metas = Object.keys(window.FX_META || {});
  const r = window.__rpg ? window.__rpg() : null;
  return { ids, metas, hasFxList: !!(r && 'fx' in r) };
})()`)
console.log(JSON.stringify(info))
await browser.close()
