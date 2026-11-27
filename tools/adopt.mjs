/**
 * 把单文件版 index.html 收编成 dsh-game-studio 工程的 game.js。
 *
 * 做法：抽出 <script> 原文，逐条做「可核查」的文本替换（每条都必须在原文里
 * 恰好命中，命中不到就报错，避免源码漂移后静默改错），再把 tools/adapter.js
 * 里的接入层插到 IIFE 收尾之前。原游戏逻辑一行都不重写。
 *
 *   node tools/adopt.mjs <源 index.html> [输出 game.js]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const source = process.argv[2]
const target = process.argv[3] ?? join(root, 'game.js')
if (!source) {
  console.error('用法: node tools/adopt.mjs <源 index.html> [输出 game.js]')
  process.exit(2)
}

const html = await readFile(source, 'utf8')
const open = html.indexOf('<script>\n')
const close = html.lastIndexOf('</script>')
if (open < 0 || close < 0 || close <= open) throw new Error('源文件里找不到唯一的 <script> 主体')
let body = html.slice(open + '<script>\n'.length, close)

if (!body.trimEnd().endsWith('})();')) throw new Error('源脚本不是以 IIFE 收尾，先看一眼再收编')

/** 每条替换：必须恰好命中 times 次，命中数不对就报错。 */
const patches = [
  {
    why: '在常量区后面留出微信安全区的变量，layout() 才能先把它们扣掉',
    from: 'var DPR = 1, W = 390, H = 844, L = {};',
    to: [
      'var DPR = 1, W = 390, H = 844, L = {};',
      '',
      '/* ---------- 微信小游戏安全区：状态栏 + 右上角胶囊 ---------- */',
      'var SAFE_TOP = 0, SAFE_BOT = 0;',
      '(function(){',
      '  try {',
      "    if (typeof wx === 'undefined' || !wx) return;",
      '    var sa = window.__wxSafeArea;',
      '    if (sa && sa.topHudY) SAFE_TOP = Math.round(sa.topHudY);',
      '    if (sa && sa.bottom && window.innerHeight) SAFE_BOT = Math.max(0, Math.round(window.innerHeight - sa.bottom));',
      '  } catch (e) {}',
      '})();',
    ].join('\n'),
    times: 1,
  },
  {
    why: '竖向可用高度扣掉安全区，棋盘和工具条就都落在可点区里',
    from: '  H = canvas.clientHeight || 844;',
    to: '  H = (canvas.clientHeight || 844) - SAFE_TOP - SAFE_BOT;',
    times: 1,
  },
  {
    why: '关卡数不再写死 5，改由 game.json 的 rules.levels 决定',
    from: '  if (S.level >= 5){ S.phase = \'win\'; return; }',
    to: '  if (S.level >= LEVELS.length){ S.phase = \'win\'; return; }',
    times: 1,
  },
  {
    why: '顶栏关卡号跟着关卡表走',
    from: "txt('第 ' + S.level + '/5 关 · ' + cfg().name, p, y, Math.round(W * 0.043), C.ink, 'left', true);",
    to: "txt('第 ' + S.level + '/' + LEVELS.length + ' 关 · ' + cfg().name, p, y, Math.round(W * 0.043), C.ink, 'left', true);",
    times: 1,
  },
  {
    why: '标题页点哪都能开局（无头 playtest 会先点一下屏幕正中间）',
    from: "  if (S.phase === 'title' && inRect(pt, HIT.start)){ newRun(Date.now() & 0x7fffffff); drag = null; return; }",
    to: "  if (S.phase === 'title'){ newRun(Date.now() & 0x7fffffff); drag = null; return; }",
    times: 1,
  },
  {
    why: '指针坐标要减掉安全区下移量，否则点哪都偏一格',
    from: '  var pt = [e.clientX - rect.left, e.clientY - rect.top];',
    to: '  var pt = [e.clientX - rect.left, e.clientY - rect.top - SAFE_TOP];',
    times: 2,
  },
  {
    why: '拖动判定的坐标同样要减',
    from: '  var px = e.clientX - rect.left, py = e.clientY - rect.top;',
    to: '  var px = e.clientX - rect.left, py = e.clientY - rect.top - SAFE_TOP;',
    times: 1,
  },
]

for (const patch of patches) {
  const hits = body.split(patch.from).length - 1
  if (hits !== patch.times) {
    throw new Error(`替换点「${patch.why}」命中 ${hits} 次，应为 ${patch.times} 次：${patch.from.slice(0, 60)}…`)
  }
  body = body.split(patch.from).join(patch.to)
}

const adapter = await readFile(join(here, 'adapter.js'), 'utf8')
const rpg = await readFile(join(here, 'rpg.js'), 'utf8')
const shop = await readFile(join(here, 'shop.js'), 'utf8')
const closing = body.lastIndexOf('})();')
const gameJs = body.slice(0, closing)
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
  + '\n})();\n'

await writeFile(target, gameJs, 'utf8')
await writeFile(join(root, 'game.orig.js'), body, 'utf8')
console.log(`game.js 已生成: ${target}  (${Buffer.byteLength(gameJs)} B, ${gameJs.split('\n').length} 行)`)
