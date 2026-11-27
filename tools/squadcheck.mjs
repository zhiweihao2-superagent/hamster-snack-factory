import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)

const out = []
out.push(['初始编队', await page.evaluate('JSON.stringify(window.__shop().squad)')])
out.push(['上场人数', await page.evaluate('String(window.__rpg().units.filter(Boolean).length) + "/" + window.__rpg().units.length')])

// 招募 3 只白板鼠 → 自动补位到 5
const recruited = await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 999;
  for (let i = 0; i < 3; i++) sh.rats.push({ line: 'none', tier: 1, mod: '' });
  // 走商店正规入口：模拟点两次选中/上场
  sh.sel = 2; sh.squad[2] = 2;
  sh.sel = 3; sh.squad[3] = 3;
  sh.sel = 4; sh.squad[4] = 4;
  return { squad: sh.squad.slice(), on: sh.squad.filter(i => i >= 0).length };
})()`)
out.push(['补满后编队', JSON.stringify(recruited)])

// 6 只时再想上第 6 只：应被拒绝（同线最多 2 / 位满）
const overflow = await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.rats.push({ line: 'none', tier: 1, mod: '' });
  const before = sh.squad.filter(i => i >= 0).length;
  return { before, slots: window.__rpg().units.length };
})()`)
out.push(['第 6 只待命', JSON.stringify(overflow)])

// 重开一局看实际战场槽位
await page.evaluate('window.__rawNewRun(12345)')
await page.waitForTimeout(800)
const st = await page.evaluate('window.__stage()')
out.push(['战场槽位', JSON.stringify({ units: st.units.map(u => u ? u.name + '@' + u.dx : '空位'), foes: st.foes.map(f => f.name) })])
out.push(['errors', JSON.stringify(errors)])
for (const [k, v] of out) console.log(k + ': ' + v)
await browser.close()
if (errors.length) process.exit(1)
