/**
 * 商店规则验证：L3 需同线同二级、错线被拒、配件生效、新鼠入库、编队换人。
 *   node tools/shoprules.mjs
 */
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
await page.waitForFunction('typeof window.__shop === "function"')
await page.mouse.click(195, 560)          // 正常开局，让 rng/棋盘就绪
await page.waitForTimeout(400)

const out = await page.evaluate(`(() => {
  const S = window.__shop()
  S.coins = 500
  window.__shopOpen()
  const log = []

  S.offers = [{ kind: 'gear', line: 'wrench', tier: 3, price: 70, sold: false }]
  S.sel = 0
  window.__shopBuy(0)
  log.push('L3 同线同二级 -> ' + S.rats[0].line + '-' + S.rats[0].tier + '  金币=' + S.coins)

  S.offers = [{ kind: 'gear', line: 'sack', tier: 3, price: 70, sold: false }]
  S.sel = 1
  window.__shopBuy(0)
  log.push('L3 错线应被拒 -> ' + S.rats[1].line + '-' + S.rats[1].tier + '  金币=' + S.coins)

  S.offers = [{ kind: 'mod', mod: 'irontooth', price: 30, sold: false }]
  S.sel = 1
  window.__shopBuy(0)
  log.push('配件 -> ' + S.rats[1].mod)

  S.offers = [{ kind: 'rat', price: 35, sold: false }]
  window.__shopBuy(0)
  const last = S.rats[S.rats.length - 1]
  log.push('新鼠 -> 共 ' + S.rats.length + ' 只，最后一只 ' + last.line + '-' + last.tier)

  S.squad = [0, 2]
  window.__shopNext()
  const r = window.__gameState().rpg
  return {
    log,
    level: S.level,
    coins: S.coins,
    units: r.units.map(u => u && (u.name + '  阈值=' + u.need + '  间隔=' + u.atkMs + 'ms  基础=' + (u.hp ? u.hpMax : ''))),
  }
})()`)
console.log(JSON.stringify(out, null, 1))
console.log('errors:', errors)
await browser.close()
