import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const logs = []
page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 120)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForTimeout(1500)
const info = await page.evaluate(`(async () => {
  const has = typeof window.PIXEL_FONT === 'string';
  const len = has ? window.PIXEL_FONT.length : 0;
  let loaded = [];
  try { loaded = [...document.fonts].map(f => f.family + ':' + f.status); } catch (e) {}
  const ok = (typeof window.__fontDiag === 'function') ? window.__fontDiag() : null;
  return { has, len, loaded, fontsReady: document.fonts.status, ok };
})()`)
console.log(JSON.stringify(info))
console.log('console', JSON.stringify(logs.slice(0, 6)))
await browser.close()
