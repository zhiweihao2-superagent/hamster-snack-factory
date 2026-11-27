/**
 * 收集游戏里真正会显示的字符 → 给字体子集化用。
 *
 *   node tools/charset.mjs            # 打印统计
 *   node tools/charset.mjs --write    # 写到 tools/_font/charset.txt
 *
 * 扫描范围：所有会被打到 game.js 里的层 + game.json（规则/关卡文案）。
 * 额外补：ASCII 可见字符 + 常用中文标点 + 罗马数字（天赋等级用 Ⅰ Ⅱ Ⅲ）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const sources = [
  'game.orig.js', 'tools/adapter.js', 'tools/rpg.js', 'tools/shop.js', 'game.json'
]

const chars = new Set()
for (const f of sources) {
  const text = readFileSync(resolve(root, f), 'utf8')
  for (const ch of text) chars.add(ch)
}

/* 常备字符：ASCII 可见 + 中文标点 + 罗马数字 + 常用符号 */
const extra = []
for (let c = 0x20; c < 0x7f; c++) extra.push(String.fromCharCode(c))
extra.push(...'ⅠⅡⅢⅣⅤ·—…→←↑↓+−×÷%？！，。、；：（）【】《》“”‘’「」『』¥$€¥/\\|<>*#@&~^_=')
for (const ch of extra) chars.add(ch)

/* 只保留能显示的字符（去掉控制字符） */
const list = [...chars].filter((ch) => ch.codePointAt(0) >= 0x20).sort()

const text = list.join('')
if (process.argv.includes('--write')) {
  mkdirSync(resolve(root, 'tools/_font'), { recursive: true })
  writeFileSync(resolve(root, 'tools/_font/charset.txt'), text, 'utf8')
  console.log('written', list.length, 'chars → tools/_font/charset.txt')
} else {
  console.log('charset size:', list.length)
  console.log('sample:', text.slice(0, 120))
}
