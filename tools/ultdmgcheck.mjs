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
await page.waitForFunction('typeof window.__rpgUlt === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
for (const n of [2, 4]) {
  const out = await page.evaluate(`(() => {
    const sh = window.__shop();
    const all = [{line:'tank',tier:2,mod:''},{line:'shot',tier:2,mod:''},{line:'blade',tier:2,mod:''},{line:'hex',tier:2,mod:''}];
    sh.rats = all.slice(0, ${n});
    sh.squad = [0,1,2,3,4].map(i => i < sh.rats.length ? i : -1);
    sh.level = 1; window.__shopNext();
    if (window.__gameState().phaseRaw === 'brief') window.__autoplay(window.__gameState());
    const r = window.__rpg();
    const before = r.enemies.filter(Boolean).map(f => Math.round(f.hp));
    r.energy = 999;
    const ok = window.__rpgUlt();
    const after = r.enemies.filter(Boolean).map(f => Math.round(f.hp));
    return { units: r.units.filter(u => u && u.alive).length, fired: ok, before, after,
             delta: before.map((b, i) => b - (after[i] === undefined ? b : after[i])) };
  })()`)
  console.log('units=' + n, JSON.stringify(out))
}
console.log('errors', errors)
await browser.close()
