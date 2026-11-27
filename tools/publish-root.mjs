/**
 * 把构建产物同步到仓库根的 index.html（给 GitHub Pages 的「Deploy from branch /root」用）。
 *
 *   node tools/publish-root.mjs
 *
 * 为什么需要：Pages 若配置成「分支 + /root」，它只会找根目录的 index.html。
 * 我们真正的产物在 dist/index.html，所以这里拷一份到根；内容完全一致（单文件、离线可玩）。
 */
import { copyFileSync, statSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'dist', 'index.html')
const dst = resolve(root, 'index.html')

if (!existsSync(src)) {
  console.error('dist/index.html 不存在，先跑 game_studio_build')
  process.exit(1)
}
copyFileSync(src, dst)
const kb = Math.round(statSync(dst).size / 1024)
console.log('已同步 dist/index.html → index.html（' + kb + ' KB）')
