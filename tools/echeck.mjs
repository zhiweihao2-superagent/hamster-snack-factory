import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__foeMake === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 3; sh.squad = [0, 1, 2];
  sh.rats = [{ line: 'tank', tier: 4, mod: '' }, { line: 'blade', tier: 4, mod: '' }, { line: 'hex', tier: 4, mod: '' }];
  window.__shopNext();
  const r = window.__rpg();
  if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  r.queue = [];
  r.enemies = ['thief', 'boss', 'glue', 'shell'].map(function (t, i) {
    const f = window.__foeMake(t, 2);
    f.slot = i;
    f.x = 300;
    f.y = 180 + i * 50;
    return f;
  });
})()`)

const snap = async (label) => {
  const st = await page.evaluate(`(() => {
    const r = window.__rpg();
    const now = performance.now();
    return {
      coins: window.__shop().coins | 0,
      foes: r.enemies.filter(Boolean).map((f) => ({
        t: f.type, hp: Math.round(f.hp), rage: !!f.rage, overload: !!f.overload,
        stolen: f.stolen || 0, fleeIn: f.fleeAt ? Math.round((f.fleeAt - now) / 1000) : null,
        charge: f.chargeMs
      })),
      allySlowed: r.units.some((u) => u && u.slowAtkUntil && u.slowAtkUntil > now)
    };
  })()`)
  console.log(label, JSON.stringify(st))
}

await page.waitForTimeout(3000)
await snap('t=3s ')
await page.waitForTimeout(6000)
await snap('t=9s ')
await page.waitForTimeout(9000)
await snap('t=18s')
console.log('errs', errs.slice(0, 3))
await browser.close()
