/**
 * 关卡表自检：逐关跳过去，把「关卡名 / 波数 / 同屏上限 / 修饰符 / 第一个敌人的血量」打出来。
 * 用来验证 game.json 的 rules.rpg.levels 真的生效，而不是掉回默认章节。
 *
 *   node tools/levelcheck.mjs [到第几关]      # 默认 9 关（覆盖一轮 6 关 + 第二轮放大）
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const upto = Number(process.argv[2]) || 9

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shopNext === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

const rows = []
for (let lv = 1; lv <= upto; lv++) {
  const row = await page.evaluate(`(() => {
    window.__shop().level = ${lv - 1};
    window.__shopNext();
    const r = window.__rpg();
    const cfg = r.cfg || {};
    const mod = cfg.mod || {};
    const foes = r.enemies.filter(Boolean);
    const q = window.__gameState();
    return {
      level: q.level,
      name: cfg.name,
      round: cfg.round,
      waves: (cfg.waves || []).length,
      waveTotal: r.waveTotal,
      onField: (cfg.waves && cfg.waves[0] ? cfg.waves[0].length : 0),
      enemiesNow: foes.length,
      first: foes[0] ? foes[0].name + ' ' + Math.round(foes[0].hpMax) + 'HP/' + foes[0].chargeMax + '格' : null,
      hpMul: Math.round((mod.hpMul || 1) * 100) / 100,
      atkMul: Math.round((mod.atkMul || 1) * 100) / 100,
      chargeMul: mod.chargeMul,
      armorMaxDelta: mod.armorMaxDelta,
      noUlt: !!mod.noUlt,
      stealBonus: mod.stealBonus,
      armorMax: Math.round(r.armorMax),
      note: mod.note || '',
    };
  })()`)
  rows.push(row)
  console.log(
    `第${row.level}关 ${row.name}｜轮次${row.round + 1}｜${row.waves}波(舞台${row.waveTotal})｜同屏${row.onField}` +
    `｜hp×${row.hpMul} 攻×${row.atkMul}${row.chargeMul !== undefined ? ' 充能×' + row.chargeMul : ''}` +
    `${row.armorMaxDelta ? ' 护甲上限' + row.armorMaxDelta : ''}${row.noUlt ? ' 大招停用' : ''}` +
    `｜护甲上限${row.armorMax}｜首个敌人 ${row.first}${row.note ? '｜' + row.note : ''}`,
  )
}

const names = new Set(rows.slice(0, 6).map((r) => r.name))
console.log('---')
console.log(JSON.stringify({
  levels: rows.length,
  distinctNamesInFirstLoop: names.size,
  tableInUse: rows[0].name === '工厂开张' && rows[1].name === '订单加急' && rows[5].name === '夜班',
  roundScalingAt7: rows[6] ? rows[6].round : null,
  noUltAt6: rows[5] ? rows[5].noUlt : null,
  errors,
}))
await browser.close()
if (errors.length) process.exit(1)
