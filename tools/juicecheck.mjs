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
await page.waitForFunction('typeof window.__stage === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
await page.evaluate('window.__setTimeScale(2)')

// 打一会儿，采样顿帧/震屏是否触发、音效名是否合法
let sawHitstop = false, sawShake = false, sfxNames = new Set()
await page.evaluate(`(() => {
  const orig = window.sfx || null;
  window.__sfxLog = [];
  const patch = () => {
    if (typeof window.sfx === 'function' && !window.__sfxPatched){
      const o = window.sfx; window.sfx = function(n, opt){ window.__sfxLog.push(n); return o(n, opt); }; window.__sfxPatched = true;
    }
  };
  patch();
})()`)
const t0 = Date.now()
while (Date.now() - t0 < 12000) {
  await page.evaluate('window.__autoplay(window.__gameState())')
  const st = await page.evaluate(`(() => { const r = window.__rpg(); return { hitstop: r.hitstopUntil > 0, shake: r.shakeUntil > 0, log: window.__sfxLog ? window.__sfxLog.slice(-40) : [] }; })()`)
  if (st.hitstop) sawHitstop = true
  if (st.shake) sawShake = true
  for (const n of st.log) sfxNames.add(n)
  await page.waitForTimeout(120)
}
console.log(JSON.stringify({ phase: (await page.evaluate('window.__gameState().phaseRaw')), sawHitstop, sawShake, sfxNames: [...sfxNames], errors }))
await browser.close()
if (errors.length) process.exit(1)
