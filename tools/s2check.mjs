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
await page.waitForFunction('typeof window.__gachaSim === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

// 分布：20000 抽
const sim = await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.tier2Pity = 0;
  const tiers = { 1: 0, 2: 0, 3: 0 };
  const skillCount = { 0: 0, 1: 0, 2: 0, 3: 0 };
  let pityHit = 0;
  const saved = sh.tier2Pity;
  sh.tier2Pity = 0;
  for (let i = 0; i < 20000; i++){
    const before = sh.tier2Pity | 0;
    const r = window.__rollRatDebug ? window.__rollRatDebug() : null;
    if (!r) return { err: 'no hook' };
    tiers[r.tier] = (tiers[r.tier] || 0) + 1;
    const n = (r.skills || []).length;
    skillCount[n] = (skillCount[n] || 0) + 1;
    if (before + 1 >= 10 && r.tier === 2) pityHit++;
  }
  sh.tier2Pity = saved;
  return { tiers, skillCount, pityHit };
})()`)
console.log('sim', JSON.stringify(sim))
console.log('errors', errors)
await browser.close()
