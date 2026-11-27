/**
 * 商店点击规则：第一次点 = 只选中；再点已选中的 = 上下场。
 *   node tools/shopclick.mjs
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
await page.mouse.click(195, 560)
await page.waitForTimeout(300)
await page.evaluate('window.__shop().coins = 200; window.__shopOpen()')
await page.waitForTimeout(200)

const state = () => page.evaluate('({sel: window.__shop().sel, squad: window.__shop().squad.slice(), rats: window.__shop().rats.length, coins: window.__shop().coins})')
const hits = () => page.evaluate('window.__shopHits().shop.map(h => ({x: h.x, y: h.y, w: h.w, h: h.h}))')

console.log('初始:', JSON.stringify(await state()))
let h = await hits()
// HITS: 0..2 是三个货架，3.. 是仓鼠卡，最后两个是按钮
const rat0 = h[3], rat1 = h[4], gear = h[0]
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

await page.mouse.click(center(rat1).x, center(rat1).y)   // 第一次点第 2 只
await page.waitForTimeout(150)
console.log('点一下第2只:', JSON.stringify(await state()))

await page.mouse.click(center(rat1).x, center(rat1).y)   // 再点 → 下场
await page.waitForTimeout(150)
console.log('再点第2只:', JSON.stringify(await state()))

await page.mouse.click(center(rat1).x, center(rat1).y)   // 又点上 → 回编队
await page.waitForTimeout(150)
console.log('第三次:', JSON.stringify(await state()))

// 买证：应装到当前选中的鼠身上
h = await hits()
console.log('货架:', JSON.stringify(await page.evaluate('window.__shop().offers.map(o => ({kind:o.kind,line:o.line,tier:o.tier,price:o.price}))')))
await page.mouse.click(center(h[0]).x, center(h[0]).y)
await page.waitForTimeout(150)
console.log('买转职后:', JSON.stringify(await state()), JSON.stringify(await page.evaluate('window.__shop().rats')))

console.log('errors:', errors)
await browser.close()
