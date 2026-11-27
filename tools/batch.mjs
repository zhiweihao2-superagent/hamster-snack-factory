/**
 * 用游戏自带的 __testRun 跑一批，并把每局的终局状态打出来（instant 模式下的真实数据）。
 *   node tools/batch.mjs [局数] [useTools:0|1]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const games = Number(process.argv[2]) || 12
const useTools = process.argv[3] !== '0'

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__testRun === "function"')

const out = await page.evaluate(`(function(){
  var res = window.__testRun(${games}, 20261120, ${useTools});
  var st = window.__gameState();
  var r = window.__rpg();
  return {
    winRate: res.winRate, stuck: res.stuck, errors: res.errors,
    last: { phase: st.phase, steps: st.hearts, dmg: st.score, kills: r.kills,
            wave: r.wave + 1 + '/' + r.waveTotal, hp: r.hp, armor: Math.round(r.armor),
            enemies: r.enemies.map(function(f){ return f.name + ' ' + Math.round(f.hp) + '/' + f.hpMax + (f.alive ? '' : '×'); }),
            queue: r.queue.length }
  };
})()`)

console.log(JSON.stringify(out, null, 2))
console.log('page errors:', errors)
await browser.close()
