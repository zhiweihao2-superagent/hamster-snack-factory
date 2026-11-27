/**
 * 精灵导出器：把代码画的角色光栅化成真正的像素 PNG 底稿。
 *
 *   node tools/export-sprites.mjs [px] [scale]
 *     px     每张图的像素边长，默认 27（游戏里 54px 显示 = 2× 整数倍）
 *     scale  导出倍率，默认 4（27 → 108，方便美术直接改）
 *
 * 产物：
 *   assets/units/<line>-<tier>.png   每个形态一张（透明底）
 *   assets/units/_sheet.png          16 个形态的总览图
 *   assets/units/index.json          清单（名字 / 职业 / 阶 / 文件）
 *
 * 只读工程、只写 assets/units/，不碰 game.js。
 */
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const px = Number(process.argv[2]) || 27
const scale = Number(process.argv[3]) || 4
const outDir = join(dir, 'art', 'units')

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(join(dir, 'dist', 'index.html')).href)
await page.waitForFunction('typeof window.__spritePNG === "function"')

await mkdir(outDir, { recursive: true })
const forms = await page.evaluate('window.__forms().map(f => ({ line: f.cls, tier: f.tier, name: f.name, id: f.id }))')

const decode = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64')
const index = []

for (const f of forms) {
  const dataUrl = await page.evaluate(
    `window.__spritePNG(${JSON.stringify(f.line)}, ${f.tier}, ${px}, ${px * scale}, false)`
  )
  const file = `${f.line}-${f.tier}.png`
  await writeFile(join(outDir, file), decode(dataUrl))
  index.push({ id: f.id, line: f.line, tier: f.tier, name: f.name, file, px: px * scale })
}

// 敌人配色变体（去饱和 + 红眼）：同一张底图，运行时用调色板派生，这里只导一张示意
const foeUrl = await page.evaluate(`window.__spritePNG('tank', 2, ${px}, ${px * scale}, true)`)
await writeFile(join(outDir, '_foe-variant-sample.png'), decode(foeUrl))

const sheet = await page.evaluate(`window.__spriteSheetPNG(${px}, 4, ${px * scale})`)
await writeFile(join(outDir, '_sheet.png'), decode(sheet.png))
await writeFile(join(outDir, 'index.json'), JSON.stringify({ px: px * scale, basePx: px, scale, forms: index }, null, 2) + '\n')

console.log(JSON.stringify({
  out: outDir,
  files: index.length + 2,
  sheetPx: `${sheet.w}x${sheet.h}`,
  sample: index.slice(0, 4).map((i) => i.file),
  errors
}))
await browser.close()
if (errors.length) process.exit(1)
