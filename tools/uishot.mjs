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
await page.keyboard.press('Enter')
await page.waitForTimeout(700)

// 1) 战斗界面（看底部工具条图标）
await page.screenshot({ path: resolve(dir, 'tools', '_toolbar.png') })

// 2) 商店界面（看转职证 / 配件的图标）
const shop = await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 400;
  sh.rats = [{ line: 'tank', tier: 1, mod: '' }];
  sh.squad = [0, -1, -1, -1, -1];
  sh.level = 0;
  window.__shopNext();            // 进关 → 打完后会进 shop；这里直接切
  return true;
})()`)
await page.evaluate(`(() => {
  const S = window.__gameState();
  return true;
})()`)
// 直接切到商店阶段
await page.evaluate(`(() => { try { window.__gameState().phaseRaw; } catch(e){} ; const g = window.__shop(); g.level = 0; if (window.__shopNext) {} })()`)
await page.evaluate(`(() => { try { S; } catch(e){} })()`)
await page.waitForTimeout(300)
const offers = await page.evaluate(`(() => { const sh = window.__shop(); return { phase: window.__gameState().phaseRaw, offers: (sh.offers || []).map(o => o.kind + ':' + (o.line || o.mod || '')) }; })()`)
console.log(JSON.stringify(offers).slice(0, 300), 'errors', errors)
await page.screenshot({ path: resolve(dir, 'tools', '_shop.png') })
await browser.close()
if (errors.length) process.exit(1)
