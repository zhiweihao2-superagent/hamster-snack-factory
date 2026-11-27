/**
 * 把分层源码合成一个 game.js（可重复、可核查）。
 *
 * 背景：tools/adopt.mjs 需要原始的单文件 index.html 才能跑；收编完成后
 * game.orig.js 已经是「打过补丁的游戏主体」，再跑 adopt 就找不到源文件了。
 * 之后每次改 tools/adapter.js / rpg.js / shop.js 都需要重新拼一次 game.js，
 * 所以单独拆出这个合成器：只做拼接，不做文本替换，改哪个层都安全。
 *
 * 合成顺序（与 adopt.mjs 完全一致，逐字节可复现）：
 *   game.orig.js（去掉 IIFE 收尾）
 *   + 接入层 tools/adapter.js
 *   + RPG 战斗层 tools/rpg.js
 *   + 商店层 tools/shop.js
 *   + IIFE 收尾
 *
 *   node tools/compose.mjs [--check]
 *     --check  只比对，不写盘；不一致时退出码 1
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const checkOnly = process.argv.includes('--check')

const read = (p) => readFile(join(root, p), 'utf8')
const body = await read('game.orig.js')
const adapter = await read('tools/adapter.js')
const rpg = await read('tools/rpg.js')
const shop = await read('tools/shop.js')

if (!body.trimEnd().endsWith('})();')) throw new Error('game.orig.js 不是以 IIFE 收尾，先看一眼再合成')
const closing = body.lastIndexOf('})();')
if (closing < 0) throw new Error('game.orig.js 里找不到 IIFE 收尾')

/* 像素贴图：把 art/tessera/picks/*@4x.png 以 data URL 注入 game.js。
   这样 dist 是单文件离线可玩，也不需要往 assets/ 里塞东西（子目录会让 studio 构建报错）。 */
let unitArt = ''
try {
  const { readdir, readFile } = await import('node:fs/promises')
  const artDir = join(root, 'art', 'tessera', 'picks')
  const files = (await readdir(artDir)).filter((f) => f.endsWith('@4x.png')).sort()
  if (files.length) {
    const entries = []
    for (const f of files) {
      const key = f.replace(/@4x\.png$/, '')
      const b64 = (await readFile(join(artDir, f))).toString('base64')
      entries.push(`  ${JSON.stringify(key)}: 'data:image/png;base64,${b64}'`)
    }
    unitArt = '/* 像素贴图（构建时从 art/tessera/picks 注入，64×64） */\n'
      + `window.UNIT_ART = {\n${entries.join(',\n')}\n};\n\n`
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e
}

/* 像素字体：tools/_font/pixel.woff2（subset 后的 12px 点阵字体），BASE64 注入 */
let pixelFont = ''
try {
  const { readFile: rf, access } = await import('node:fs/promises')
  const fp = join(root, 'tools', '_font', 'pixel.woff2')
  let ok = true
  try { await access(fp) } catch { ok = false }
  if (ok) {
    const b64 = (await rf(fp)).toString('base64')
    pixelFont = '/* 像素字体（构建时注入） */\nwindow.PIXEL_FONT = "data:font/woff2;base64,' + b64 + '";\n\n'
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e
}

/* 版本号：从 CHANGELOG 顶部那一行取（用于界面上显示"你跑的是哪一版"） */
let versionTag = ''
try {
  const cl = await read('CHANGELOG.md')
  const m = cl.match(/^##\s*(\d+\.\d+\.\d+)/m)
  if (m) versionTag = 'window.BUILD_TAG = "v' + m[1] + '";\n\n'
} catch (e) {}

/* 多帧动画：art/frames/<key>/<frame>.png → window.UNIT_FRAMES[key][frame] */
let unitFrames = ''
try {
  const { readdir, readFile } = await import('node:fs/promises')
  const { existsSync } = await import('node:fs')
  const froot = join(root, 'art', 'frames')
  if (existsSync(froot)) {
    const dirs = (await readdir(froot, { withFileTypes: true })).filter((d) => d.isDirectory())
    const lines = []
    for (const d of dirs) {
      const files = (await readdir(join(froot, d.name))).filter((f) => f.endsWith('.png')).sort()
      if (!files.length) continue
      const parts = []
      for (const f of files) {
        const b64 = (await readFile(join(froot, d.name, f))).toString('base64')
        parts.push('    ' + JSON.stringify(f.replace(/\.png$/, '')) + ": 'data:image/png;base64," + b64 + "'")
      }
      lines.push('  ' + JSON.stringify(d.name) + ': {\n' + parts.join(',\n') + '\n  }')
    }
    if (lines.length) {
      unitFrames = '/* 多帧动画（构建时从 art/frames 注入） */\nwindow.UNIT_FRAMES = {\n' + lines.join(',\n') + '\n};\n\n'
    }
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e
}

const composed = versionTag + pixelFont + unitFrames
  + body.slice(0, closing)
  + '\n/* ============================================================\n'
  + '   dsh-game-studio 接入层（收编时追加，上面的原逻辑一行未改）\n'
  + '   ============================================================ */\n'
  + adapter
  + '\n/* ============================================================\n'
  + '   RPG 战斗层（M2）：三资源 → 仓鼠小队 / 尖牙帮\n'
  + '   ============================================================ */\n'
  + rpg
  + '\n/* ============================================================\n'
  + '   商店层（M3）：金币 → 工种证 / 配件 / 编队\n'
  + '   ============================================================ */\n'
  + shop
  + '\n'
  + unitArt
  + '})();\n'

const current = await read('game.js')
if (current === composed) {
  console.log(`game.js 已是最新（${Buffer.byteLength(composed)} B, ${composed.split('\n').length} 行）`)
  process.exit(0)
}
if (checkOnly) {
  console.log('game.js 与分层源码不一致：先跑 node tools/compose.mjs')
  process.exit(1)
}
await writeFile(join(root, 'game.js'), composed, 'utf8')
console.log(`game.js 已由分层源码重建：${Buffer.byteLength(composed)} B, ${composed.split('\n').length} 行`)
