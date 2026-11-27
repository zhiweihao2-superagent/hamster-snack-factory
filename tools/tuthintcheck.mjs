import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__swapAt === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => { const sh = window.__shop(); sh.level = 0; sh.squad=[0,1,-1,-1,-1]; window.__shopNext(); })()`)
await page.waitForTimeout(700)

// 教学第一步：应当已经挑好一个"真能消"的两格
const hint = await page.evaluate(`(() => {
  const r = window.__rpg();
  const mv = r.tutMove;
  let valid = null;
  if (mv) {
    const b = window.__gameState().board;
    // 直接问游戏：这两格换一下是否产生消除
    const st = window.__gameState();
    valid = { a: mv[0], b: mv[1], cells: [b[mv[0][0]][mv[0][1]], b[mv[1][0]][mv[1][1]]] };
  }
  return { tut: !!r.tut, tutSwap: !!r.tutSwap, move: mv, valid };
})()`)
console.log('hint:', JSON.stringify(hint))

// 按提示那一步走 → 教学放行 + 进入资源明暗阶段
const did = await page.evaluate(`(() => {
  const r = window.__rpg(); const mv = r.tutMove;
  const ok = mv ? window.__swapAt(mv[0], mv[1]) : null;
  return { ok, tutSwap: !!r.tutSwap };
})()`)
await page.waitForTimeout(900)
const after = await page.evaluate(`(() => { const r = window.__rpg();
  return { tutSwap: !!r.tutSwap, tutT0: r.tutT0 > 0, timers: r.enemies.filter(Boolean).map(f => Math.round(f.timerMs)) }; })()`)
console.log('follow hint:', JSON.stringify(did), '→', JSON.stringify(after))
console.log('errors', errors)
await browser.close()
if (errors.length) process.exit(1)
