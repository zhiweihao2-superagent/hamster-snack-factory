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
await page.waitForFunction('typeof window.__forms === "function"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)

const forms = await page.evaluate('window.__forms()')
console.log('forms:', forms.length)
for (const f of forms) console.log(' ', f.id.padEnd(8), (f.name || '').padEnd(5), 'hp', String(f.hp).padEnd(4), 'atk', String(f.base).padEnd(3), 'act', JSON.stringify(f.act), '武器', f.weapon || '-')

// 四阶转职链：白板 → tank-2 → tank-3 → tank-4（价格 40/75/120，且不能跳级）
const chain = await page.evaluate(`(() => {
  const sh = window.__shop();
  sh.coins = 999; sh.level = 6;
  sh.rats = [{ line: 'none', tier: 1, mod: '' }];
  sh.sel = 0;
  const log = [];
  const buy = (line, tier) => {
    window.__shopRoll && null;
    sh.offers[0] = { kind: 'gear', line: line, tier: tier, price: (tier===2?40:tier===3?75:120), sold: false };
    const before = sh.rats[0].tier;
    window.__shopBuy(0);
    log.push(line + '-' + tier + ':' + (sh.rats[0].tier === before ? '拒绝' : '成功→' + sh.rats[0].line + sh.rats[0].tier));
  };
  buy('tank', 3);   // 跳级：应拒绝
  buy('tank', 2);   // 白板 → 二级
  buy('blade', 3);  // 串线：应拒绝
  buy('tank', 3);
  buy('tank', 4);
  return { log, final: sh.rats[0] };
})()`)
console.log('转职链:', chain.log.join(' | '), '→', JSON.stringify(chain.final))

// 关卡→可出证阶数
const tiers = await page.evaluate(`(() => {
  const out = {};
  for (const lv of [1, 2, 3, 5, 6, 9]) {
    window.__shop().level = lv;
    const set = new Set();
    for (let i = 0; i < 200; i++) { window.__shop().squad = [0,-1,-1,-1,-1]; window.__shop().sel = 0; window.__shopRoll(); set.add(window.__shop().offers[0].tier + '@' + window.__shop().offers[0].price); }
    out[lv] = [...set].sort().join(',');
  }
  return out;
})()`)
console.log('每关可出的证（阶@价）:', JSON.stringify(tiers))
console.log('errors:', errors)
await browser.close()
if (errors.length) process.exit(1)
