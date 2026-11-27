/**
 * 配平测量的前置检查：dist 是否比源码新。
 *
 *   node tools/checkbuild.mjs        # 只检查，打印结论
 *
 * 为什么需要它：rtcheck / detcheck / playtest 读的都是 dist/index.html，
 * 而 game.json 的改动只有 game_studio_build 才会打进 dist。
 * 这一条踩过两次 —— 只跑 compose 就去测，测出来的是旧构建，数字会骗人。
 */
import { statSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const dist = resolve(root, 'dist', 'index.html')
const sources = ['game.json', 'game.js', 'tools/rpg.js', 'tools/shop.js', 'tools/adapter.js']
  .map((f) => resolve(root, f))
  .filter((f) => existsSync(f))

if (!existsSync(dist)) {
  console.log('MISSING: dist/index.html 不存在，先跑 game_studio_build')
  process.exit(2)
}

const distTime = statSync(dist).mtimeMs
const newer = sources.filter((f) => statSync(f).mtimeMs > distTime + 500)

if (newer.length) {
  console.log('STALE: 下面这些文件比 dist 新，测量结果会是旧构建 —— 先跑 game_studio_build：')
  for (const f of newer) console.log('  - ' + f.replace(root + '\\', ''))
  process.exit(1)
}
console.log('OK: dist 是最新的（' + new Date(distTime).toLocaleString('zh-CN') + '）')
