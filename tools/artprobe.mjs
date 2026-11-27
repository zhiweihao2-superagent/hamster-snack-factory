import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const r = await page.evaluate(`(() => {
  const A = window.__artProbe || null;
  // 直接在页面里检查 UNIT_ART 是否有 cert-2
  const keys = Object.keys(window.UNIT_ART || {}).filter(k => k.indexOf('cert') === 0);
  let img = null;
  try { img = (typeof artFromMap === 'function') ? artFromMap(unitArtMap(), ['cert-2']) : null; } catch(e) {}
  return { certKeys: keys, hasImg: !!img, w: img && img.width };
})()`)
console.log(JSON.stringify(r))
await browser.close()
