import { readFileSync, writeFileSync } from 'node:fs'

const p = 'tools/shop.js'
let s = readFileSync(p, 'utf8')
const out = {}

/* 图鉴三页：去掉"点任意处返回"的全屏热区（容易误触退出），只保留右上角按钮 */
let removed = 0
for (const line of [
  "  shopHit(0, 0, W, H, function(){ SHOP.codex = false; SHOP.codexPage = 0; sfx('tap'); });",
  "  shopHit(0, 0, W, H, function(){ SHOP.codex = false; sfx('tap'); });"
]) {
  while (s.includes(line)) {
    s = s.replace(line + '\n', '')
    removed++
  }
}
out.removed = removed

/* 图鉴右上「天赋/技能/形态」切页按钮：46×22 → 62×34，并把它挪到右上角固定位置 */
s = s.replace("  var tbw = 46, tbh = 22;", "  var tbw = 64, tbh = 34;")
s = s.replace("  txt(nextName, tbx + tbw / 2, tby + 15,", "  txt(nextName, tbx + tbw / 2, tby + 22,")

writeFileSync(p, s, 'utf8')
console.log(JSON.stringify(out))
