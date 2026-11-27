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
  const sh = window.__shop(); sh.level = 6; sh.squad = [0, 1, 2];
  sh.rats = [{ line: 'tank', tier: 4, mod: '' }, { line: 'blade', tier: 4, mod: '' }, { line: 'care', tier: 4, mod: '' }];
  window.__shopNext();
  const r = window.__rpg();
  if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; }
  const f = window.__foeMake('blast', 2);
  f.slot = 0;
  f.x = 150;
  f.y = 250;
  f.hp = Math.round(f.hpMax * 0.30);
  r.enemies = [f];
  r.queue = [];
  r.units.filter(Boolean).forEach(function (u, i) {
    u.x = 140 + i * 12;
    u.y = 245 + i * 10;
  });
  window.__blast = f;
  window.__hp0 = r.units.filter(Boolean).map(function (u) { return Math.round(u.hp); });
})()`)

await page.waitForTimeout(2200)
const st = await page.evaluate(`(() => {
  const r = window.__rpg();
  return {
    before: window.__hp0,
    after: r.units.filter(Boolean).map(function (u) { return Math.round(u.hp); }),
    blastAlive: (window.__blast || {}).alive,
    fx: (r.blastFx || []).length
  };
})()`)
await page.screenshot({ path: resolve(dir, 'tools', '_blast.png') })
console.log(JSON.stringify(st))
console.log('errs', errs.slice(0, 3))
await browser.close()
