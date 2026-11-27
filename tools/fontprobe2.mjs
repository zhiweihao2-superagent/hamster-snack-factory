import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForTimeout(1200)
const r = await page.evaluate(`(async () => {
  const out = {};
  out.head = window.PIXEL_FONT ? window.PIXEL_FONT.slice(0, 60) : null;
  try {
    const ff = new FontFace('tz', 'url(' + window.PIXEL_FONT + ')');
    await ff.load();
    document.fonts.add(ff);
    out.ok = true;
    out.families = [...document.fonts].map(f => f.family);
  } catch (e) { out.err = String(e && e.message || e); }
  return out;
})()`)
console.log(JSON.stringify(r))
await browser.close()
