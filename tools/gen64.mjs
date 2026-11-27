import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__spritePNG === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)

const forms = [['tank',3],['blade',4],['shot',4],['hex',4],['care',4]]
const out = {}
for (const [line, tier] of forms) {
  const key = `${line}-${tier}`
  // A: Tessera 16×16 放大到 64
  const a = await page.evaluate(`window.__spritePNG(${JSON.stringify(line)}, ${tier}, 16, 64, false)`)
  // B: 代码绘制 → 64 网格 → 24 色量化（真 64×64）
  const b = await page.evaluate(`window.__spritePNG(${JSON.stringify(line)}, ${tier}, 64, 64, false)`)
  out[key] = { a: a.split(',')[1], b: b.split(',')[1] }
}
console.log(JSON.stringify({ keys: Object.keys(out), errors }))
writeFileSync(resolve(dir, 'tools', '_sprite64.json'), JSON.stringify(out))
await browser.close()
if (errors.length) process.exit(1)
