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
const r = await page.evaluate(`(() => {
  const sh = window.__shop(); sh.level = 5; sh.squad = [0,1,2,3,4];
  sh.rats = [1,2,3,4,5].map(function(){ return { line:'tank', tier:2, mod:'' }; });
  window.__shopNext();
  const rp = window.__rpg();
  return { level: sh.level, onField: rp.cfg && rp.cfg.onField,
           waves: (rp.cfg && rp.cfg.waves || []).map(function(w){ return w.map(function(e){ return e.type; }).join('+'); }),
           mod: rp.mod };
})()`)
console.log(JSON.stringify(r))
await browser.close()
