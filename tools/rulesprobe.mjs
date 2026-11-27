import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__rpg === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const info = await page.evaluate(`(() => {
  const g = window.GAME || {};
  const rules = g.rules || {};
  return {
    hasTalents: !!rules.talents,
    talentKeys: rules.talents ? Object.keys(rules.talents) : [],
    foeScale: rules.rpg && rules.rpg.foeScale,
    levels: (rules.rpg && rules.rpg.levels || []).map(l => ({ on: l.onField, hp: l.mod && l.mod.hpMul, atk: l.mod && l.mod.atkMul, tier: l.enemyTier }))
  };
})()`)
console.log(JSON.stringify(info))
await browser.close()
