import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const { launchBrowser } = await import(pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src/playtest.ts')).href)
const { browser } = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
await page.goto(pathToFileURL(resolve(dir, 'dist/index.html')).href)
await page.waitForFunction('typeof window.__fuseDebug === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

const stat = await page.evaluate(`(() => {
  const sh = window.__shop();
  let skillEaten = 0, skillEntries = 0, talEaten = 0, talEntries = 0, slot1Lost = 0;
  const runs = 4000;
  for (let i = 0; i < runs; i++){
    sh.rats = [
      { line: 'tank', tier: 3, mod: '', talents: [{ id: 'tank', lv: 3 }, { id: 'care', lv: 2 }],
        skills: [{ id: 'chongya', lv: 2 }, { id: 'huoqiu', lv: 1 }] },
      { line: 'shot', tier: 3, mod: '', talents: [{ id: 'shot', lv: 2 }, { id: 'hex', lv: 3 }],
        skills: [{ id: 'shandian', lv: 1 }, { id: 'jiaban', lv: 2 }] }
    ];
    sh.squad = [0, 1, -1, -1, -1];
    sh.sel = 0;
    const before = sh.rats[0].talents[0].id;
    const res = window.__fuseDebug();
    skillEntries += 4;
    talEntries += 3;
    skillEaten += (res.lostSkills || []).length;
    talEaten += (res.lostTalents || []).length;
    if (!res.kept || res.kept[0].id !== before) slot1Lost++;
  }
  return { runs,
    skillEatRate: +(skillEaten / skillEntries).toFixed(4),
    talEatRate: +(talEaten / talEntries).toFixed(4),
    slot1Lost };
})()`)
console.log('fuse stat', JSON.stringify(stat))

await page.evaluate(`(() => {
  const sh = window.__shop(); sh.coins = 500; sh.level = 3;
  sh.rats = [
    { line: 'tank', tier: 3, mod: '', talents: [{ id: 'tank', lv: 3 }, { id: 'care', lv: 2 }], skills: [{ id: 'chongya', lv: 2 }, { id: 'huoqiu', lv: 1 }] },
    { line: 'shot', tier: 3, mod: '', talents: [{ id: 'shot', lv: 2 }], skills: [{ id: 'shandian', lv: 1 }] }
  ];
  sh.squad = [0, 1, -1, -1, -1];
  window.__openShop(true);
  sh.page = 'fuse';
})()`)
await page.waitForTimeout(300)
await page.mouse.click(70, 120)
await page.waitForTimeout(150)
await page.mouse.click(190, 120)
await page.waitForTimeout(250)
await page.mouse.click(195, 474)
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(dir, 'tools', '_fuse_confirm.png') })
console.log('errors', errors)
await browser.close()
