import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const out = resolve(dir, 'tools', 'ui-review')
mkdirSync(out, { recursive: true })

const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message ?? e)))

await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__shop === "function"')
await page.waitForTimeout(900)
await page.screenshot({ path: resolve(out, '01-title.png') })

/* 造一份有代表性的存档 */
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 1240; sh.level = 4; sh.shard = 46; sh.best = 4;
  const mk = (line, tier, tal, sk) => ({ line, tier, mod: '', talents: tal, skills: sk });
  sh.rats = [
    mk('tank', 4, [{ id: 'tank', lv: 3 }], [{ id: 'chongya', lv: 2 }, { id: 'huangyou', lv: 2 }]),
    mk('blade', 3, [{ id: 'blade', lv: 2 }], [{ id: 'qiexiao', lv: 1 }]),
    mk('shot', 4, [{ id: 'shot', lv: 2 }], [{ id: 'chuanjia', lv: 2 }]),
    mk('hex', 4, [{ id: 'hex', lv: 2 }], [{ id: 'huoqiu', lv: 2 }, { id: 'bingshuang', lv: 1 }]),
    mk('care', 3, [], [{ id: 'tangfen', lv: 1 }]),
    mk('none', 1, [], [])
  ];
  sh.squad = [0, 1, 2, 3, 4];
  sh.box = [{ line: 'hex', tier: 2, mod: '', talents: [], skills: [] }, { line: 'blade', tier: 2, mod: '', talents: [{ id: 'blade', lv: 2 }], skills: [] }];
  sh.gears = { 'tank-4': 1, 'shot-3': 2 };
  window.__openShop(true);
})()`)
await page.waitForTimeout(500)

const shot = async (name, js) => {
  await page.evaluate(js)
  await page.waitForTimeout(450)
  await page.screenshot({ path: resolve(out, name) })
}

await shot('02-team.png', `(() => { const sh = window.__shop(); sh.page = ''; sh.mainTab = 'team'; })()`)
await shot('03-store.png', `(() => { const sh = window.__shop(); sh.page = ''; sh.mainTab = 'shop'; })()`)
await shot('04-gacha-rat.png', `(() => { const sh = window.__shop(); sh.page = 'gacha'; })()`)
await shot('05-gacha-item.png', `(() => { const sh = window.__shop(); sh.page = 'gacha'; })()`)
await shot('06-box.png', `(() => { const sh = window.__shop(); sh.page = 'box'; })()`)
await shot('07-fuse.png', `(() => { const sh = window.__shop(); sh.page = 'fuse'; })()`)
await shot('08-detail-talents.png', `(() => { const sh = window.__shop(); sh.page = 'rat'; sh.detail = 0; sh.detailTab = 0; })()`)
await shot('09-detail-skills.png', `(() => { const sh = window.__shop(); sh.detailTab = 1; })()`)
await shot('10-detail-certs.png', `(() => { const sh = window.__shop(); sh.detailTab = 2; })()`)
await shot('11-detail-stats.png', `(() => { const sh = window.__shop(); sh.detailTab = 3; })()`)
await shot('12-codex-forms.png', `(() => { const sh = window.__shop(); sh.page = ''; sh.codex = true; sh.codexPage = 0; })()`)
await shot('13-codex-talents.png', `(() => { const sh = window.__shop(); sh.codexPage = 1; })()`)
await shot('14-codex-skills.png', `(() => { const sh = window.__shop(); sh.codexPage = 2; })()`)

/* 战斗页 */
await page.evaluate(`(() => { const sh = window.__shop(); sh.codex = false; sh.page = ''; window.__shopNext(); const r = window.__rpg(); if (r.tut) { r.tutSwap = true; r.tutUlt = true; r.tutRes = 3; } })()`)
await page.waitForTimeout(2600)
await page.screenshot({ path: resolve(out, '15-battle.png') })

console.log('shots done, errs:', errs.slice(0, 3))
await browser.close()
