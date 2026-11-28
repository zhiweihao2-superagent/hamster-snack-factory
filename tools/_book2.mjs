import { readFileSync, writeFileSync } from 'node:fs'

const p = 'tools/shop.js'
let s = readFileSync(p, 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'

/* offerTitle / offerDesc 支持技能书 */
s = s.replace("  if (o.kind === 'shard') return '碎片包 ×' + (o.amount || 2);",
  "  if (o.kind === 'shard') return '碎片包 ×' + (o.amount || 2);\n" +
  "  if (o.kind === 'book') return '《' + skillName(o.skill) + '》技能书';")

s = s.replace("  if (o.kind === 'shard') return '拆零件拆出来的碎片，攒着能换抽卡';",
  "  if (o.kind === 'shard') return '拆零件拆出来的碎片，攒着能换抽卡';\n" +
  "  if (o.kind === 'book') return (LINE_NAME[o.line] || '') + '专属 · 只能给本职业学';")

/* 技能书图标：用技能图标的 skill-<id>（drawOfferCard 里 icId 走 skill-kind 分支） */
s = s.replace('  var icId = (o.kind === "gear") ? ("gear-" + o.line)',
              '  var icId = (o.kind === "book") ? ("skill-" + o.skill)\n           : (o.kind === "gear") ? ("gear-" + o.line)')

writeFileSync(p, s, 'utf8')
console.log('offer titles + icons for books')
