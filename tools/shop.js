/* ============================================================
   M3 · 商店 / 工种证 / 配件 / 编队 / 金币（接在 RPG 战斗层之后）
   ------------------------------------------------------------
   设计依据：docs/GDD-v4-shop-routing.md
   · 每过一关进店，3 个货架 + 刷新
   · 买到的工种证装到"当前选中的仓鼠"身上 → 转职
   · 配件（改装件）每只鼠一个位置，覆盖旧的
   · 编队：从拥有的仓鼠里选 1~2 只上场
   · 敌人每关递增（hp +18%、atk +10%），靠商店跟上
   ============================================================ */

/* ---------- 1. 品种映射：线 + 等级 → ROSTER 里的 id ---------- */
var VARIANT = {
  'none-1': 'worker',
  /* 新五线（M6-2）：白板 → 二级 → 三级 → 四级 */
  'tank-2': 'tank-2', 'tank-3': 'tank-3', 'tank-4': 'tank-4',
  'blade-2': 'blade-2', 'blade-3': 'blade-3', 'blade-4': 'blade-4',
  'shot-2': 'shot-2', 'shot-3': 'shot-3', 'shot-4': 'shot-4',
  'hex-2': 'hex-2', 'hex-3': 'hex-3', 'hex-4': 'hex-4',
  'care-2': 'care-2', 'care-3': 'care-3', 'care-4': 'care-4',
  /* 老版 id 保留：读老存档时还能解析 */
  'wrench-2': 'tin', 'wrench-3': 'hydra',
  'driver-2': 'cannon', 'driver-3': 'sniper',
  'spring-2': 'spring', 'spring-3': 'boom',
  'medic-2': 'medic', 'medic-3': 'nurse',
  'sack-2': 'collect', 'sack-3': 'store'
};

var LINE_NAME = {
  tank: '肉盾', blade: '近战', shot: '远程', hex: '魔法', care: '增益',
  wrench: '钳工', driver: '装配', spring: '调试', medic: '医务', sack: '仓管'
};

/* 老存档的线 id → 新五线（0.9.5 之前存的鼠） */
var LINE_MIGRATE = { wrench: 'tank', driver: 'shot', spring: 'blade', medic: 'care', sack: 'hex' };

/* 转职证的阶与解锁关卡：T2 第 1 关、T3 第 3 关、T4 第 6 关 */
var TIER_UNLOCK = { 2: 1, 3: 3, 4: 6 };
var TIER_PRICE = { 2: 40, 3: 75, 4: 120 };
var TIER_LABEL = { 1: '白板', 2: '二级', 3: '三级', 4: '四级' };
function maxTierFor(lvl){ return lvl >= 6 ? 4 : (lvl >= 3 ? 3 : 2); }

/* ---------- 2. 配件 ---------- */
var MODS = {
  goggles: { name: '护目镜', price: 22, desc: '该鼠伤害 +15%', dmgMul: 1.15 },
  oilcan: { name: '油壶', price: 26, desc: '该鼠出手间隔 −10%', atkMul: 0.9 },
  backpack: { name: '小背包', price: 28, desc: '该鼠强化阈值 −2', needMinus: 2 },
  irontooth: { name: '铁牙套', price: 30, desc: '该鼠基础伤害 +2', basePlus: 2 },
  padspring: { name: '垫片', price: 24, desc: '该鼠受伤 −15%', defMul: 0.85 }
};

/* ---------- 3. 商店存档（v2：5 个上阵位 + 大厅位用 -1 表示） ---------- */
/* ---------- 碎片（P1）：分解仓鼠 / 道具池产出；兑换按池定价 ---------- */
var SHARD_KEY = 'hamsterSnackFactory.shard.v1';
function shardLoad(){
  try {
    var raw = localStorage.getItem(SHARD_KEY);
    if (raw){
      var o = JSON.parse(raw);
      SHOP.shard = Math.max(0, o.shard | 0);
      SHOP.gachaPity = (o.gachaPity | 0) || 0;
    }
  } catch (e) {}
  if (typeof SHOP.shard !== 'number') SHOP.shard = 0;
  if (typeof SHOP.gachaPity !== 'number') SHOP.gachaPity = 0;
  if (typeof SHOP.tier2Pity !== 'number') SHOP.tier2Pity = 0;
}
function shardSave(){
  try {
    localStorage.setItem(SHARD_KEY, JSON.stringify({ shard: SHOP.shard | 0, gachaPity: SHOP.gachaPity | 0 }));
  } catch (e) {}
}
function addShard(n){
  SHOP.shard = Math.max(0, Math.round((SHOP.shard || 0) + n));
  shardSave();
  return SHOP.shard;
}
/* 分解价目：2×槽数 + 1×(总等级−槽数)，上限 12 */
function shardValueOf(rat){
  var list = (rat && rat.talents) ? rat.talents : [];
  var slots = list.length;
  if (!slots) return 1;                       /* 白板鼠也给 1，别让玩家觉得白抽 */
  var sum = 0;
  for (var i = 0; i < list.length; i++) sum += (list[i].lv || 1);
  var cfg = (RULES && RULES.shard) || {};
  var base = (cfg.decompBase || 2) * slots + (cfg.decompPerLevel || 1) * (sum - slots);
  return Math.min(cfg.cap || 12, Math.max(1, base));
}
/* ---------- 仓鼠池（P2）与炼妖（P3）的核心逻辑 ---------- */
var RAT_LINES = ['tank', 'blade', 'shot', 'hex', 'care'];

function gachaCfg(){
  var cfg = (RULES && RULES.gacha) || {};
  return {
    rat: cfg.rat || { cost: 60, tenCost: 540, pityDouble: 20, shardCost: 12 },
    item: cfg.item || { cost: 20, tenCost: 180, pityGear: 10, shardCost: 5 }
  };
}

/* 槽位：5% 三天赋 / 13% 双天赋 / 82% 单天赋（合起来 P3=5%、P2=18%） */
function rollTalentSlots(){
  var r = Math.random();
  if (r < 0.05) return 3;
  if (r < 0.18) return 2;
  return 1;
}
/* 等级：62% Ⅰ / 30% Ⅱ / 8% Ⅲ */
function rollTalentGrade(){
  var r = Math.random();
  if (r < 0.62) return 1;
  if (r < 0.92) return 2;
  return 3;
}

/* 生成一只新仓鼠（职业随机，天赋按规则掷） */
/* ---------- 技能（S2：只携带与展示，战斗生效在 S4–S6） ---------- */
function skillDefs(){ return (RULES.skills && RULES.skills.list) || {}; }
function skillList(){ return Object.keys(skillDefs()); }
function skillName(id){ var d = skillDefs()[id]; return d ? d.name : id; }
function skillKindLabel(kind){ return kind === 'mag' ? '魔法' : (kind === 'buff' ? '增益' : '物理'); }

/* 数量：30% 0 个 / 42% 1 个 / 22% 2 个 / 6% 3 个 */
function rollSkillCount(){
  var c = (RULES.gacha && RULES.gacha.rat && RULES.gacha.rat.slots) || { p0: 0.30, p1: 0.42, p2: 0.22, p3: 0.06 };
  var r = Math.random();
  if (r < c.p0) return 0;
  if (r < c.p0 + c.p1) return 1;
  if (r < c.p0 + c.p1 + c.p2) return 2;
  return 3;
}
function rollSkills(n){
  var pool = skillList();
  var out = [];
  for (var i = 0; i < n && pool.length; i++){
    var k = Math.floor(Math.random() * pool.length);
    var id = pool.splice(k, 1)[0];
    out.push({ id: id, lv: rollTalentGrade() });
  }
  return out;
}

function rollRat(){
  var cfg = (RULES.gacha && RULES.gacha.rat) || {};
  var p2 = typeof cfg.tier2 === 'number' ? cfg.tier2 : 0.08;
  var p3 = typeof cfg.tier3 === 'number' ? cfg.tier3 : 0.005;
  var pityMax = cfg.tier2Pity || 10;

  /* 三档：三级 0.5% / 二级 8% / 其余白板 */
  var r = Math.random();
  var tier = 1;
  if (r < p3) tier = 3;
  else if (r < p3 + p2) tier = 2;

  /* 保底：累计 10 抽没出 ≥二级 → 这一抽强制二级 */
  SHOP.tier2Pity = (SHOP.tier2Pity | 0) + 1;
  var forced = SHOP.tier2Pity >= pityMax && tier === 1;
  if (forced) tier = 2;
  if (tier >= 2) SHOP.tier2Pity = 0;

  var line = RAT_LINES[Math.floor(Math.random() * RAT_LINES.length)];

  /* 天赋：二级/三级必带职业天赋；其余按老规则随机携带 */
  var talents = [];
  if (tier >= 2){
    talents.push({ id: line, lv: rollTalentGrade() });
    /* 二级/三级再抽 0–2 条跨线天赋（跟白板同表，只是先占掉一条职业天赋） */
    var extra = rollTalentSlots() - 1;
    var pool = RAT_LINES.filter(function(l){ return l !== line; });
    for (var i = 0; i < extra && pool.length; i++){
      var k = Math.floor(Math.random() * pool.length);
      talents.push({ id: pool.splice(k, 1)[0], lv: rollTalentGrade() });
    }
  } else {
    var n = rollTalentSlots();
    var pool0 = RAT_LINES.slice();
    for (var j = 0; j < n && pool0.length; j++){
      var k0 = Math.floor(Math.random() * pool0.length);
      talents.push({ id: pool0.splice(k0, 1)[0], lv: rollTalentGrade() });
    }
    line = 'none';
  }

  /* 技能：三档同一张表 */
  var skills = rollSkills(rollSkillCount());

  return { line: line, tier: tier, mod: '', talents: talents, skills: skills, tierRoll: tier };
}


/* 抽一次仓鼠（花 60 金币或外部已经扣碎片） */
function ratGachaRoll(){
  var cost = gachaCfg().rat.cost;
  if (SHOP.coins < cost){ sfx('invalid'); return null; }
  SHOP.coins -= cost;
  return ratGachaApply();
}

/* 不扣钱、直接出结果（十连 / 碎片兑换都走这里） */
function ratGachaApply(forceTier2){
  var rat = rollRat();
  if (forceTier2 && rat.tier < 2){
    rat.tier = 2;
    rat.line = RAT_LINES[Math.floor(Math.random() * RAT_LINES.length)];
    if (!rat.talents.some(function(t){ return t.id === rat.line; })){
      rat.talents.unshift({ id: rat.line, lv: rollTalentGrade() });
    }
  }
  var full = (SHOP.rats.length >= rosterCap()) && (boxList().length >= boxCap());
  var result = { rat: rat, shard: 0, full: full };
  if (full){
    /* 队伍满了：直接折碎片，别让玩家白抽 */
    result.shard = shardValueOf(rat);
    addShard(result.shard);
  } else {
    /* 抽到的一律先进仓鼠盒：由玩家决定搬哪只进栏（栏满以前是自动进栏，容易把栏塞满） */
    var bi = boxAdd(rat);
    if (bi >= 0){
      result.boxed = true;
      result.boxIndex = bi;
    } else {
      result.shard = shardValueOf(rat);
      addShard(result.shard);
    }
  }
  /* Ⅲ 级：记下来给播报用 */
  for (var ti = 0; ti < rat.talents.length; ti++){
    if ((rat.talents[ti].lv || 1) >= 3){
      result.t3 = (TALENT_DEF[rat.talents[ti].id] ? TALENT_DEF[rat.talents[ti].id].name : rat.talents[ti].id);
      result.t0 = performance.now();
      break;
    }
  }
  GACHA_LAST.push(result);
  rebuildUnitsIfShop();
  shopSave();
  sfx('pick');
  return result;
}

var GACHA_LAST = [];

/* 十连：一次扣钱，连续出 10 只 */
function ratGachaTen(){
  var cfg = gachaCfg().rat;
  var cost = cfg.tenCost || (cfg.cost * 9);
  if (SHOP.coins < cost){ sfx('invalid'); return []; }
  SHOP.coins -= cost;
  GACHA_LAST = [];
  var sawTier2 = false;
  for (var i = 0; i < 10; i++){
    var last = (i === 9);
    var res = ratGachaApply(last && !sawTier2);
    if (res && res.rat && res.rat.tier >= 2) sawTier2 = true;
  }
  return GACHA_LAST.slice();
}

/* ---------- 炼妖：主鼠槽1 固定，其余按概率继承 ---------- */
function fusePreview(mainIdx, subIdx){
  var a = SHOP.rats[mainIdx], b = SHOP.rats[subIdx];
  if (!a || !b || mainIdx === subIdx) return null;
  var rows = [];
  /* 槽1 保留且等级取主鼠的（以前这里写死 1，会把 Ⅲ 级洗成 Ⅰ） */
  var s1 = (a.talents && a.talents[0]) ? a.talents[0] : null;
  var s1lv = s1 ? (s1.lv || 1) : 1;
  var s1id = s1 ? s1.id : a.line;
  /* 副鼠若也带这条天赋，等级取较高的那条 */
  for (var si = 0; si < (b.talents || []).length; si++){
    if (b.talents[si].id === s1id) s1lv = Math.max(s1lv, b.talents[si].lv || 1);
  }
  rows.push({ id: s1id, lv: s1lv, who: '主', chance: 1 });
  var extras = [];
  var push = function(list, who, chance){
    for (var i = 0; i < (list || []).length; i++){
      var t = list[i];
      var isSlot1 = (who === '主' && i === 0);
      if (isSlot1) continue;
      extras.push({ id: t.id, lv: t.lv || 1, who: who, chance: chance });
    }
  };
  var fc = (RULES.fuse) || {};
  push(a.talents, '主', fc.keepMain || 0.70);
  push(b.talents, '副', fc.keepSub || 0.55);
  return {
    main: a, sub: b, slot1: rows[0], extras: extras,
    skillsMain: (a.skills || []).slice(),
    skillsSub: (b.skills || []).slice(),
    eatSkill: (typeof fc.eatSkill === 'number') ? fc.eatSkill : 0.08,
    eatTalent: (typeof fc.eatTalent === 'number') ? fc.eatTalent : 0.025,
    cost: fc.cost || 30, refund: fc.refundIfNone || 3
  };
}

/* ---------- 天赋洗练（P5）：花碎片重掷某一槽的等级，可升可降 ---------- */
var REROLL_COST = 6;
var REROLL_ARM = '';        /* 两段确认：第一次点只是"上膛" */

function rerollTalent(ratIdx, slotIdx){
  var rat = SHOP.rats[ratIdx];
  if (!rat || !rat.talents || !rat.talents[slotIdx]) return null;
  if ((SHOP.shard | 0) < REROLL_COST){ sfx('invalid'); return null; }
  addShard(-REROLL_COST);
  var t = rat.talents[slotIdx];
  var from = t.lv || 1;
  var to = rollTalentGrade();
  t.lv = to;
  rebuildUnitsIfShop();
  shopSave();
  sfx(to > from ? 'pick' : 'invalid');
  return { from: from, to: to, id: t.id };
}

function fuseRats(mainIdx, subIdx){
  var pv = fusePreview(mainIdx, subIdx);
  if (!pv) return null;
  if (SHOP.coins < pv.cost){ sfx('invalid'); return null; }
  SHOP.coins -= pv.cost;

  var kept = [{ id: pv.slot1.id, lv: pv.slot1.lv }];   /* 槽1 职业天赋：免疫 */
  var lostSkills = [], lostTalents = [];

  /* 1) 技能：先判"被吃"（8%），再判继承（主 70% / 副 55%），同名合并升级 */
  function mergeSkill(t){
    for (var i = 0; i < kept.length; i++){
      if (kept[i].id === t.id){ kept[i].lv = Math.max(kept[i].lv, t.lv || 1); return; }
    }
    kept.push({ id: t.id, lv: t.lv || 1, isSkill: true });
  }
  var skAll = [];
  for (var i = 0; i < pv.skillsMain.length; i++) skAll.push({ t: pv.skillsMain[i], keep: pv.keepMain, who: '主' });
  for (var j = 0; j < pv.skillsSub.length; j++) skAll.push({ t: pv.skillsSub[j], keep: pv.keepSub, who: '副' });
  for (var k = 0; k < skAll.length; k++){
    var e = skAll[k];
    if (Math.random() < pv.eatSkill){ lostSkills.push(e.t); continue; }
    if (Math.random() < (e.keep || 0.6)) mergeSkill(e.t);
  }

  /* 2) 额外天赋：先判"被吃"（2.5%），再判继承（70%） */
  for (var m = 0; m < pv.extras.length; m++){
    var x = pv.extras[m];
    if (Math.random() < pv.eatTalent){ lostTalents.push(x); continue; }
    if (Math.random() < (x.chance || 0.6)){
      var merged = false;
      for (var n = 0; n < kept.length; n++){
        if (kept[n].id === x.id){ kept[n].lv = Math.max(kept[n].lv, x.lv || 1); merged = true; break; }
      }
      if (!merged) kept.push({ id: x.id, lv: x.lv || 1 });
    }
  }

  /* 3) 分开技能/天赋，各自按上限整理（技能不限、天赋最多 3 个槽） */
  var tal = [], sk = [];
  for (var q = 0; q < kept.length; q++) (kept[q].isSkill ? sk : tal).push(kept[q]);
  tal = tal.slice(0, 3);

  var main = SHOP.rats[mainIdx];
  var fused = {
    line: main.line, tier: main.tier, mod: '',
    talents: tal.map(function(t){ return { id: t.id, lv: t.lv }; }),
    skills: sk.map(function(t){ return { id: t.id, lv: t.lv }; })
  };
  SHOP.rats[mainIdx] = fused;
  SHOP.rats.splice(subIdx, 1);
  SHOP.squad = SHOP.squad.map(function(v){
    if (v === subIdx) return -1;
    return v > subIdx ? v - 1 : v;
  });
  SHOP.sel = Math.min(mainIdx, SHOP.rats.length - 1);

  var refunded = 0;
  var gotExtra = Math.max(0, tal.length - 1) + sk.length;
  if (!gotExtra){ refunded = pv.refund; addShard(refunded); }

  rebuildUnitsIfShop();
  shopSave();
  sfx('pick');
  return { fused: fused, gotExtra: gotExtra, refunded: refunded, kept: kept,
           lostSkills: lostSkills, lostTalents: lostTalents };
}

/* 新抽到的鼠：在补给站里挂一个 NEW 角标，进过详情就清掉 */
function markFresh(idx){
  SHOP.fresh = SHOP.fresh || {};
  SHOP.fresh[idx] = performance.now();
}
function isFresh(idx){
  return !!(SHOP.fresh && SHOP.fresh[idx]);
}
function clearFresh(idx){
  if (SHOP.fresh) delete SHOP.fresh[idx];
}

function decompRat(idx){
  var rat = SHOP.rats[idx];
  if (!rat) return 0;
  if (SHOP.squad.indexOf(idx) >= 0) return -1;     /* 场上的不能拆 */
  if (SHOP.rats.length <= 1) return -1;            /* 至少留一只 */
  var gain = shardValueOf(rat);
  SHOP.rats.splice(idx, 1);
  SHOP.squad = SHOP.squad.map(function(v){ return v === idx ? -1 : (v > idx ? v - 1 : v); });
  SHOP.sel = Math.max(0, Math.min(SHOP.sel, SHOP.rats.length - 1));
  addShard(gain);
  rebuildUnitsIfShop();
  shopSave();
  sfx('pick');
  return gain;
}

var SHOP_KEY = 'hamsterSnackFactory.shop.v2';
var SHOP_KEY_V1 = 'hamsterSnackFactory.shop.v1';
var SQUAD_SLOTS = function(){ return Math.max(1, CFG.slots || 5); };

var SHOP = {
  coins: 0,
  level: 1,
  best: 1,
  rats: [
    { line: 'tank', tier: 2, mod: '' },
    { line: 'shot', tier: 2, mod: '' }
  ],
  squad: [0, 1, -1, -1, -1],
  sel: 0,
  codex: false,
  offers: [],
  refreshLeft: 3,
  earned: 0
};

/* 编队工具：-1 = 空位；同一条线最多 compose.maxSameLine 只 */
function squadSlots(){ return SQUAD_SLOTS(); }
function squadOnCount(){
  var n = 0;
  for (var i = 0; i < SHOP.squad.length; i++) if (SHOP.squad[i] >= 0 && SHOP.rats[SHOP.squad[i]]) n++;
  return n;
}
function squadLineCount(line){
  var n = 0;
  for (var i = 0; i < SHOP.squad.length; i++){
    var r = SHOP.rats[SHOP.squad[i]];
    if (r && (r.line || 'none') === line) n++;
  }
  return n;
}
/* 队伍上限（仓鼠存栏数）：默认 12，抽卡满员才折碎片 */
/* ---------- 仓鼠盒：仓鼠栏（可上场，12）满了就往盒子里放 ---------- */
function boxCap(){
  var v = (RULES && RULES.boxCap);
  return (typeof v === 'number' && v > 0) ? Math.round(v) : 60;
}
function boxList(){
  if (!SHOP.box) SHOP.box = [];
  return SHOP.box;
}
function boxAdd(rat){
  var box = boxList();
  if (box.length >= boxCap()) return -1;
  box.push(rat);
  return box.length - 1;
}
/* 取出到仓鼠栏；栏满则返回 false */
function boxTake(idx){
  var box = boxList();
  var rat = box[idx];
  if (!rat) return false;
  if (SHOP.rats.length >= rosterCap()) return false;
  box.splice(idx, 1);
  SHOP.rats.push(rat);
  SHOP.sel = SHOP.rats.length - 1;
  markFresh(SHOP.sel);
  rebuildUnitsIfShop();
  shopSave();
  sfx('pick');
  return true;
}
function boxDecomp(idx){
  var box = boxList();
  var rat = box[idx];
  if (!rat) return 0;
  var gain = shardValueOf(rat);
  box.splice(idx, 1);
  addShard(gain);
  shopSave();
  sfx('pick');
  return gain;
}

function rosterCap(){
  var v = (RULES && RULES.rosterCap);
  return (typeof v === 'number' && v >= 6) ? Math.round(v) : 12;
}

/* 同线最多几只上场：白板（none）没有职业线，所以不占这条限制 */
function maxSameLine(line){
  if (line === 'none') return fieldCap();
  var c = (RULES.rpg || {}).compose || {};
  return Math.max(1, c.maxSameLine || 2);
}
function squadIndexOf(idx){
  for (var i = 0; i < SHOP.squad.length; i++) if (SHOP.squad[i] === idx) return i;
  return -1;
}
function squadFirstEmpty(){
  for (var i = 0; i < SHOP.squad.length; i++) if (!(SHOP.squad[i] >= 0)) return i;
  return -1;
}
function squadNormalize(){
  var slots = squadSlots(), out = [];
  for (var i = 0; i < slots; i++){
    var v = SHOP.squad[i];
    out.push((typeof v === 'number' && v >= 0 && v < SHOP.rats.length) ? v : -1);
  }
  SHOP.squad = out;
}

/* v2 → v3：配件下线（每个折 2 碎片），天赋槽1 补齐 */
function migrateRats(rats){
  var gained = 0;
  var cfg = (RULES && RULES.shard) || {};
  var per = cfg.legacyMod || 2;
  for (var i = 0; i < (rats || []).length; i++){
    var r = rats[i];
    if (!r) continue;
    if (r.mod){
      gained += per;
      r.mod = '';
    }
    if (typeof ensureTalentSlot1 === 'function') ensureTalentSlot1(r);
  }
  if (gained) addShard(gained);
  return gained;
}

function shopSave(){
  try {
    localStorage.setItem(SHOP_KEY, JSON.stringify({
      version: 3,
      coins: SHOP.coins, level: SHOP.level, best: SHOP.best,
      rats: SHOP.rats, squad: SHOP.squad, box: SHOP.box || [], gears: SHOP.gears || {},
      shard: SHOP.shard | 0, gachaPity: SHOP.gachaPity | 0, tier2Pity: SHOP.tier2Pity | 0
    }));
  } catch (e) {}
}

function shopLoad(){
  try {
    var raw = localStorage.getItem(SHOP_KEY);
    if (!raw) raw = localStorage.getItem(SHOP_KEY_V1);   // v1 → v2 迁移（squad 只有 2 位、没有 version）
    if (!raw) return;
    var o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return;
    if (typeof o.coins === 'number') SHOP.coins = Math.max(0, o.coins);
    if (typeof o.level === 'number') SHOP.level = Math.max(1, o.level);
    if (typeof o.best === 'number') SHOP.best = Math.max(1, o.best);
    if (Array.isArray(o.rats) && o.rats.length){
      SHOP.rats = o.rats.map(function(r){
        var line = r && r.line;
        if (LINE_MIGRATE[line]) line = LINE_MIGRATE[line];   /* 老五线 → 新五线 */
        return {
          line: line || 'none',
          tier: Math.min(4, Math.max(1, (r && r.tier) || 1)),
          mod: (r && r.mod) || ''
        };
      });
    }
    if (Array.isArray(o.squad)) SHOP.squad = o.squad.slice();
    squadNormalize();
    if (!squadOnCount()){ SHOP.squad[0] = 0; }
    if (SHOP.sel >= SHOP.rats.length) SHOP.sel = 0;
  } catch (e) {}
  SHOP.box = Array.isArray(SHOP.box) ? SHOP.box : [];
  SHOP.gears = (SHOP.gears && typeof SHOP.gears === 'object') ? SHOP.gears : {};
  shardLoad();
  if (SHOP.rats && SHOP.rats.length) migrateRats(SHOP.rats);
}

shopLoad();

function ratId(rat){ return VARIANT[(rat.line || 'none') + '-' + (rat.tier || 1)] || 'worker'; }

function ratLabel(rat){
  var id = ratId(rat);
  return (ROSTER[id] && ROSTER[id].name) || '工鼠';
}

function ratLineLabel(rat){
  if (!rat) return '';
  var tier = rat.tier || 1;
  if (!rat.line || rat.line === 'none') return '未转职 · ' + (TIER_LABEL[tier] || '白板');
  return (LINE_NAME[rat.line] || rat.line) + ' · ' + (TIER_LABEL[tier] || '');
}

/* ---------- 4. 用编队生成我方单位（覆盖 RPG 层的 buildSquad） ---------- */
var _shopBuildSquad = buildSquad;
buildSquad = function(){
  R.units = [];
  var slots = CFG.slots || 5;
  /* 编队里放了几只就上几只（最多 slots=5）。
     循序渐进靠"你一开始只有 2 只仓鼠 + 敌人一关比一关多"，不靠砍上场位 ——
     玩家凑齐 5 只就该看见 5 只站在台上。 */
  for (var s = 0; s < slots; s++){
    var idx = SHOP.squad[s];
    var rat = (typeof idx === 'number' && idx >= 0) ? SHOP.rats[idx] : null;
    if (!rat){ R.units.push(null); continue; }
    var u = makeUnit(ratId(rat), s);
    u.ratIndex = idx;
    ensureTalentSlot1(rat);
    u.talents = (rat.talents || []).slice();
    u.skills = (rat.skills || []).map(function(t){ return { id: t.id, lv: t.lv || 1, readyAt: 0 }; });
    u.rat = rat;
    applyMod(u, rat.mod);
    R.units.push(u);
  }
  for (var j = 0; j < R.units.length; j++) if (R.units[j]) R.units[j].slot = j;
};

/* 上场上限：编队位就是上限（5）。留这个函数给商店/顶栏读，避免各处自己算 */
function fieldCap(){
  return CFG.slots || 5;
}

/* 配件在"造单位"的时候一次性烤进数值，避免战斗中反复换算 */
function applyMod(u, modId){
  /* P1：配件不再出售，但老存档里残留的 mod 仍然按原规则生效（避免读档后手感突变） */
  var m = MODS[modId];
  if (!u || !m) return;
  u.modId = modId;
  if (m.dmgMul){
    u.baseDmg = Math.round(u.baseDmg * m.dmgMul);
    if (u.act && u.act.dmg){
      u.act = { kind: u.act.kind, dmg: Math.round(u.act.dmg * m.dmgMul), pierce: u.act.pierce, armor: u.act.armor };
    }
  }
  if (m.atkMul) u.atkMs = Math.max(400, Math.round(u.atkMs * m.atkMul));
  if (m.needMinus && u.need) u.need = Math.max(2, u.need - m.needMinus);
  if (m.basePlus) u.baseDmg = (u.baseDmg || 0) + m.basePlus;
  if (m.defMul) u.defMul = m.defMul;
}

var _shopApplyUnitDamage = applyUnitDamage;
applyUnitDamage = function(u, dmg, pierce, kind){
  if (u && u.defMul) dmg = Math.max(1, Math.round(dmg * u.defMul));
  return _shopApplyUnitDamage(u, dmg, pierce, kind);
};

/* ---------- 5. 关卡递增：改为读关卡表（applyLevelCfg）的修饰符，别再按关数硬乘 ----------
   原来这里按 (1 + 0.18 × 关数) 放大，会和关卡表里的 hpMul 叠加两次；现在数值全部由
   levelCfgFor() 统一给出，这个包装只保留占位，方便以后加"某些关卡特殊敌人"的逻辑。 */


/* ---------- 6. 货架：三个固定类目（转职 / 属性 / 招募） ---------- */
var SHOP_SECTIONS = [
  { key: 'gear', label: '转职（工种证）' },
  { key: 'rat', label: '招募（白板仓鼠）' }
];

/* 解锁池：证按关卡开放，别让第 1 关就刷到仓管专精证 */
function unlockedLines(lvl){
  /* 五条线全开：职业本身没有门槛，门槛放在"阶"上（见 maxTierFor）。
     留这个函数是为了以后做"章节解锁某条线"。 */
  return ['tank', 'blade', 'shot', 'hex', 'care'];
}
function allowTier3(lvl){ return lvl >= TIER_UNLOCK[3]; }

function rollOffers(){
  var lvl = SHOP.level || 1;
  var lines = unlockedLines(lvl);
  var maxTier = maxTierFor(lvl);
  var cand = [];
  for (var i = 0; i < lines.length; i++){
    for (var t = 2; t <= maxTier; t++){
      cand.push({ kind: 'gear', line: lines[i], tier: t, price: TIER_PRICE[t] });
    }
  }

  /* 保底：优先给"选中鼠现在就能用的下一阶证"，但别刷成固定一张
     —— 60% 出同线下一阶，40% 出别的可用证（换线也是合法养成路线）。
     四阶之后"下一阶"就是 +1，不会一次跳两级。 */
  var rat = SHOP.rats[SHOP.sel] || SHOP.rats[0] || null;
  var myTier = rat ? (rat.tier || 1) : 1;
  var nextTier = Math.min(4, myTier + 1);
  var sameLineNext = cand.filter(function(c){
    return rat && c.tier === nextTier && rat.line === c.line;
  });
  var sameTierAny = cand.filter(function(c){
    return !rat || rat.line !== c.line || (rat.tier || 1) !== c.tier - 1;
  });
  var pool;
  if (sameLineNext.length && Math.random() < 0.6) pool = sameLineNext;
  else if (sameTierAny.length) pool = sameTierAny;
  else pool = cand;
  var g = pool[Math.floor(Math.random() * pool.length)];

  SHOP.offers = [
    { kind: 'gear', line: g.line, tier: g.tier, price: g.price, sold: false },
    { kind: 'shard', amount: 2, price: 10, sold: false },
    { kind: 'rat', price: 35, sold: false }
  ];
}

function offerTitle(o){
  if (o.kind === 'gear') return (LINE_NAME[o.line] || '') + (TIER_LABEL[o.tier] || '') + '证';
  if (o.kind === 'shard') return '碎片包 ×' + (o.amount || 2);
  return '新仓鼠（白板）';
}

function offerDesc(o){
  if (o.kind === 'gear'){
    var id = VARIANT[o.line + '-' + o.tier];
    var nm = (ROSTER[id] && ROSTER[id].name) || '';
    if (o.tier >= 3) return '升到四级前必须逐阶转（' + nm + '）';
    return '转职为 ' + nm;
  }
  if (o.kind === 'shard') return '拆零件拆出来的碎片，攒着能换抽卡';
  return '白板仓鼠，可再买证转职';
}

/* ---------- 7. 结算与进店 ---------- */
var _shopCheckEnd = checkBattleEnd;
checkBattleEnd = function(){
  var was = S.phase;
  _shopCheckEnd.apply(null, arguments);
  if (S.phase === 'win' && was !== 'win') onLevelWin();
};

function onLevelWin(){
  // 无限步之后，"剩余步数"不再存在：改用存活仓鼠数 + 护甲余量结算
  var coins = 12 + aliveUnits().length * 6 + (R.armor >= R.armorMax * 0.8 ? 8 : 0);
  SHOP.earned = coins;
  SHOP.coins += coins;
  SHOP.best = Math.max(SHOP.best, SHOP.level);
  shopSave();
}

/* 失败也进补给站，而且给保底收入——否则卡关 = 没钱 = 永远打不过的死循环 */
function onLevelLose(){
  var coins = 8 + R.kills * 3 + (R.wave + 1) * 4;
  SHOP.earned = coins;
  SHOP.coins += coins;
  shopSave();
}

function openShop(afterWin){
  if (S.phase === 'shop') return;      // 幂等：事件顺序兜底，别重复摇货架
  window.__counters.openShop++;
  SHOP.advance = afterWin !== false;   // true = 赢了，开工进下一关；false = 输了，重打本关
  if (SHOP.advance) onLevelWin(); else onLevelLose();
  S.phase = 'shop';
  SHOP.refreshLeft = 3;
  SHOP.sel = Math.min(SHOP.sel, SHOP.rats.length - 1);
  rollOffers();
  shopSave();
}

function startNextLevel(){
  SHOP.level += SHOP.advance === false ? 0 : 1;
  shopSave();
  // 正常流程里 rng 早就有了；这条只在测试/异常路径下兜底
  if (typeof S.rng !== 'function'){ S.seed = Date.now() & 0x7fffffff; S.rng = mulberry32(S.seed); }
  startLevel(SHOP.level);
}

/* 结算卡上的按钮：赢了先进商店。
   注意：同一节点上的监听按"注册顺序"跑，原版 onDown 会先一步把局面重开，
   所以真正的守卫放在 newRun 里（下面），事件顺序不再是依赖项。 */
var _shopNewRun = newRun;
window.__counters = { openShop: 0, startLevel: 0, newRun: 0, log: [] };
newRun = function(){
  window.__counters.newRun++;
  window.__counters.log.push('newRun@' + S.phase);
  if (S.phase === 'win' || S.phase === 'shop'){ openShop(true); return; }
  return _shopNewRun.apply(null, arguments);
};
window.__rawNewRun = function(){ return _shopNewRun.apply(null, arguments); };

/* ---------- 8. 商店界面 ---------- */
var HITS = [];

function shopHit(x, y, w, h, fn){
  HITS.push({ x: x, y: y, w: w, h: h, fn: fn });
}

function hitShop(pt){
  for (var i = HITS.length - 1; i >= 0; i--){
    var r = HITS[i];
    if (pt[0] >= r.x && pt[0] <= r.x + r.w && pt[1] >= r.y && pt[1] <= r.y + r.h){
      r.fn();
      return true;
    }
  }
  return false;
}

var _shopDraw = draw;
draw = function(){
  if (S.phase !== 'shop'){ _shopDraw(); return; }
  var scene = SHOP.codex ? drawCodex
    : (SHOP.page === 'gacha' ? drawGacha
    : (SHOP.page === 'fuse' ? drawFuse
    : (SHOP.page === 'rat' ? drawRatDetail
    : (SHOP.page === 'box' ? drawBoxPage : drawShop))));
  if (SAFE_TOP || SAFE_BOT){
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H + SAFE_TOP + SAFE_BOT);
    ctx.translate(0, SAFE_TOP);
    scene();
    ctx.restore();
  } else {
    scene();
  }
};

/* ---------- 7.5 图鉴：五职业 × 四阶（含手里那把武器） ---------- */
function codexRows(){
  var rows = [];
  for (var i = 0; i < CLASS_LINES.length; i++){
    var line = CLASS_LINES[i];
    var cells = [];
    for (var t = 1; t <= 4; t++){
      var id = t === 1 ? 'worker' : (line + '-' + t);
      var def = ROSTER[id] || {};
      cells.push({
        line: line, tier: t,
        name: t === 1 ? '白板鼠' : (def.name || ''),
        weapon: t === 1 ? '拳头' : ((WEAPON_NAME[line] || [])[t - 1] || ''),
        hp: def.hp || 0,
        atk: def.act ? (def.act.kind === 'heal' ? '治疗' + def.act.dmg : def.act.dmg) : (def.baseDmg || 0)
      });
    }
    rows.push({ line: line, label: CLASS_NAME[line], cells: cells });
  }
  return rows;
}
window.__codex = codexRows;

/* ---------- 图鉴 · 天赋页（P0） ---------- */
var TALENT_FIELD_NAME = {
  dr: '减伤', heal: '击杀回血', atk: '攻速', pierce: '穿甲', crit: '暴击',
  burn: '灼烧/秒', stack: '层数', amp: '易伤',
  overflow: '溢出转盾', armor: '盾上限', haste: '攻速'
};

function talentLevelText(def, lv){
  if (!def || !def.levels || !def.levels[lv - 1]) return '—';
  var o = def.levels[lv - 1], parts = [];
  for (var k in o){
    var v = o[k];
    var label = TALENT_FIELD_NAME[k] || k;
    if (k === 'dr' || k === 'pierce' || k === 'crit' || k === 'atk' || k === 'amp' || k === 'haste'){
      parts.push(label + ' +' + Math.round(v * 100) + '%');
    } else {
      parts.push(label + ' ' + v);
    }
  }
  return parts.join(' · ');
}

function drawCodexTalents(pad){
  var top = 66, rowH = 88, gap = 8;
  var lines = ['tank', 'blade', 'shot', 'hex', 'care'];
  for (var i = 0; i < lines.length; i++){
    var id = lines[i];
    var def = (TALENT_DEF || {})[id] || {};
    var y = top + i * (rowH + gap);
    rr(pad, y, W - pad * 2, rowH, 10);
    ctx.fillStyle = C.panel; ctx.fill();
    ctx.strokeStyle = 'rgba(232,172,80,.35)'; ctx.lineWidth = 1; ctx.stroke();

    txt((LINE_NAME[id] || id) + ' · ' + (def.name || ''), pad + 12, y + 18,
        Math.round(W * 0.036), C.amber, 'left', true);
    txt('槽1 必带 · 槽2/槽3 可跨职业', W - pad - 12, y + 18,
        Math.max(8, Math.round(W * 0.023)), C.muted, 'right');

    for (var lv = 1; lv <= 3; lv++){
      var col = pad + 12 + (lv - 1) * ((W - pad * 2 - 24) / 3);
      txt('ⅠⅡⅢ'.charAt(lv - 1), col, y + 36, Math.max(9, Math.round(W * 0.026)), '#ffd98a', 'left', true);
      txt(talentLevelText(def, lv), col + 14, y + 36,
          Math.max(8, Math.round(W * 0.0235)), C.ink, 'left');
    }
  }
  txt('等级概率：Ⅰ 62% · Ⅱ 30% · Ⅲ 8%（Ⅲ 级抽到会全屏播报）',
      pad, top + 5 * (rowH + gap) + 12, Math.max(9, Math.round(W * 0.026)), C.muted, 'left');
}

/* 图鉴 · 技能页：11 个技能的类型 / 目标数 / 冷却 */
function drawCodexSkills(pad){
  var ids = Object.keys(skillTable());
  var top = 66, rowH = 44, gap = 6;
  var shown = Math.min(ids.length, 11);
  for (var i = 0; i < shown; i++){
    var id = ids[i];
    var d = skillTable()[id];
    var y = top + i * (rowH + gap);
    rr(pad, y, W - pad * 2, rowH, 8);
    ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = d.kind === 'mag' ? 'rgba(143,184,255,.35)'
      : (d.kind === 'buff' ? 'rgba(121,201,138,.35)' : 'rgba(255,179,122,.35)');
    ctx.stroke();
    var col = d.kind === 'mag' ? '#8fb8ff' : (d.kind === 'buff' ? '#79c98a' : '#ffb37a');
    txt(d.name || id, pad + 10, y + 17, Math.max(10, Math.round(W * 0.028)), col, 'left', true);
    txt(skillKindLabel(d.kind), pad + W - pad * 2 - 10, y + 17,
        Math.max(8, Math.round(W * 0.022)), C.muted, 'right');
    var t = (d.targets || []).join(' / ');
    var c = (d.cd || []).map(function(v){ return Math.round(v / 1000) + 's'; }).join(' / ');
    txt('目标 ' + t + ' · 冷却 ' + c, pad + 10, y + 34,
        Math.max(8, Math.round(W * 0.022)), '#8f86a6', 'left');
    txt(d.desc || '', pad + W - pad * 2 - 10, y + 34,
        Math.max(8, Math.round(W * 0.021)), '#5b5374', 'right');
  }
}

function drawCodex(){
  HITS = [];
  var pad = L.pad;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  SHOP.codexPage = SHOP.codexPage | 0;
  var pageName = ['图鉴 · 五职业 × 四阶', '图鉴 · 天赋', '图鉴 · 技能'][SHOP.codexPage | 0] || '图鉴';
  txt(pageName, pad, 42,
      Math.round(W * 0.045), C.ink, 'left', true);
  txt('点任意处返回', W - pad, 42, Math.max(10, Math.round(W * 0.028)), C.muted, 'right');
  /* 页签按钮 */
  var tbx = W - pad - 46, tby = 8, tbw = 46, tbh = 22;
  rr(tbx, tby, tbw, tbh, 11);
  ctx.fillStyle = SHOP.codexPage ? 'rgba(232,172,80,.9)' : C.panel2; ctx.fill();
  var nextName = ['天赋', '技能', '形态'][SHOP.codexPage | 0] || '天赋';
  txt(nextName, tbx + tbw / 2, tby + 15,
      Math.max(9, Math.round(W * 0.026)), SHOP.codexPage ? '#241d2e' : C.ink, 'center', true);
  shopHit(tbx, tby, tbw, tbh, function(){
    SHOP.codexPage = ((SHOP.codexPage | 0) + 1) % 3;
    sfx('tap');
  });
  if ((SHOP.codexPage | 0) === 1){
    drawCodexTalents(pad);
    shopHit(0, 0, W, H, function(){ SHOP.codex = false; SHOP.codexPage = 0; sfx('tap'); });
    return;
  }
  if ((SHOP.codexPage | 0) === 2){
    drawCodexSkills(pad);
    shopHit(0, 0, W, H, function(){ SHOP.codex = false; SHOP.codexPage = 0; sfx('tap'); });
    return;
  }
  var rows = codexRows();
  var top = 62, gapX = 5, gapY = 8;
  var cw = Math.round((W - pad * 2 - gapX * 3) / 4), chh = 98;
  for (var r = 0; r < rows.length; r++){
    var y = top + r * (chh + gapY);
    for (var c = 0; c < rows[r].cells.length; c++){
      var cell = rows[r].cells[c];
      var x = pad + c * (cw + gapX);
      rr(x, y, cw, chh, 8);
      ctx.fillStyle = C.panel; ctx.fill();
      ctx.strokeStyle = c === 0 ? C.line : 'rgba(232,172,80,.35)';
      ctx.lineWidth = 1; ctx.stroke();
      var artS = 28;
      drawHamsterArt(x + cw / 2 - artS * 0.75, y + 8, artS,
                     { line: cell.line, cls: cell.line, tier: cell.tier, name: cell.name });
      drawWeapon(cell.line, cell.tier, x + cw / 2 + 4, y + 32, 32, 1, 0, false);
      txt(cell.name, x + cw / 2, y + 54, 9, C.ink, 'center', true);
      txt(cell.weapon || '—', x + cw / 2, y + 66, 8, C.muted, 'center');
      txt('HP ' + cell.hp + ' · ' + cell.atk, x + cw / 2, y + 80, 8, '#8f86a6', 'center');
    }
    txt(rows[r].label, pad - 2, top + r * (chh + gapY) - 2, 8, '#6a6480', 'left');
  }
  /* 一行加点建议：省得每条线都要自己试 */
  var noteY = top + rows.length * (chh + gapY) + 8;
  txt('加点：肉盾/近战攒零件 · 远程攒零件 · 魔法/增益攒能量',
      pad, noteY, Math.max(9, Math.round(W * 0.026)), '#8f86a6', 'left');
  txt('战斗里：花生→能量 · 饼干→护甲 · 瓜子→零件',
      pad, noteY + 16, Math.max(9, Math.round(W * 0.026)), '#6a6480', 'left');
  shopHit(0, 0, W, H, function(){ SHOP.codex = false; sfx('tap'); });
}

/* ================= 抽奖页（独立页面） ================= */
var GACHA_TAB = 'rat';                 /* 'rat' | 'item' */
var GACHA_FLASH = { t0: 0, text: '', tier: 0 };

function gachaBackBtn(pad){
  var bw = 52, bh = 24, bx = W - pad - bw, by = 12;
  rr(bx, by, bw, bh, 12);
  ctx.fillStyle = C.panel2; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
  txt('返回', bx + bw / 2, by + 16, Math.max(9, Math.round(W * 0.028)), C.ink, 'center', true);
  shopHit(bx, by, bw, bh, function(){ SHOP.page = ''; sfx('tap'); });
}

/* 池子展示条：五条线的成年鼠横排，让玩家一眼看到"能抽到什么" */
function drawPoolStrip(pad, y, h){
  var lines = ['tank', 'blade', 'shot', 'hex', 'care'];
  var n = lines.length;
  var cell = Math.floor((W - pad * 2) / n);
  rr(pad, y, W - pad * 2, h, 12);
  ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.stroke();
  for (var i = 0; i < n; i++){
    var cx = pad + cell * i + cell / 2;
    var rat = { line: lines[i], tier: 3, talents: [] };
    drawRatAt(rat, cx, y + h * 0.52, Math.min(44, h * 0.62), 0.95);
    txt(LINE_NAME[lines[i]] || '', cx, y + h - 6,
        Math.max(8, Math.round(W * 0.022)), C.muted, 'center');
  }
}

/* 保底进度条：0 → 满 */
function drawPityBar(x, y, w, cur, max, color){
  var h = 6;
  rr(x, y, w, h, 3);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
  var k = Math.max(0, Math.min(1, cur / Math.max(1, max)));
  if (k > 0){
    rr(x, y, Math.max(4, w * k), h, 3);
    ctx.fillStyle = color || C.amber; ctx.fill();
  }
}

function drawGachaTabs(pad, y){
  var tabs = [['rat', '仓鼠池'], ['item', '道具池']];
  var bw = 92, bh = 28, gap = 8;
  for (var i = 0; i < tabs.length; i++){
    var x = pad + i * (bw + gap);
    var on = GACHA_TAB === tabs[i][0];
    rr(x, y, bw, bh, 14);
    ctx.fillStyle = on ? C.amber : C.panel2;
    ctx.fill();
    txt(tabs[i][1], x + bw / 2, y + 19, Math.max(10, Math.round(W * 0.031)),
        on ? '#241d2e' : C.ink, 'center', true);
    (function(key){
      shopHit(x, y, bw, bh, function(){ GACHA_TAB = key; sfx('tap'); });
    })(tabs[i][0]);
  }
}

/* ================= 仓鼠详情页（梦幻西游式宠物面板） ================= */
function ratStats(rat){
  var id = ratId(rat);
  var r = ROSTER[id] || ROSTER.worker;
  var tal = rat.talents || [];
  return {
    name: r.name || '工鼠',
    line: rat.line || 'none',
    tier: rat.tier || 1,
    hp: r.hp || 0,
    atkMs: r.atkMs || 0,
    baseDmg: r.baseDmg || 0,
    act: r.act ? r.act.dmg : 0,
    actKind: r.act ? r.act.kind : '',
    need: r.need || 0,
    eats: r.eats || '—',
    talents: tal
  };
}

function talentEffectText(id, lv){
  var def = TALENT_DEF[id];
  if (!def || !def.levels) return '';
  var o = def.levels[Math.max(0, Math.min(def.levels.length, lv) - 1)] || {};
  var names = { dr: '减伤', heal: '击杀回血', atk: '攻速', pierce: '穿甲', crit: '暴击',
                burn: '每秒灼烧', stack: '最大层数', amp: '易伤',
                overflow: '溢出转盾', armor: '盾上限', haste: '攻速增益' };
  var parts = [];
  for (var k in o){
    var v = o[k];
    if (k === 'dr' || k === 'pierce' || k === 'crit' || k === 'atk' || k === 'amp' || k === 'haste'){
      parts.push(names[k] + ' +' + Math.round(v * 100) + '%');
    } else {
      parts.push(names[k] + ' ' + v);
    }
  }
  return parts.join(' · ');
}

/* 四维雷达：生命 / 输出 / 续航 / 辅助（都按 0–1 归一，便于横向比较） */
function ratRadarStats(rat){
  var r = ROSTER[ratId(rat)] || {};
  var hp = r.hp || 1;
  var dmg = (r.baseDmg || 0) + ((r.act && r.act.dmg) || 0) * 1.2;
  var tal = rat.talents || [];
  var hasCare = tal.some(function(t){ return t.id === 'care'; });
  var hasHex = tal.some(function(t){ return t.id === 'hex'; });
  var hasBlade = tal.some(function(t){ return t.id === 'blade'; });
  var clamp01 = function(v){ return Math.max(0.08, Math.min(1, v)); };
  return [
    { k: '生命', v: clamp01(hp / 200) },
    { k: '输出', v: clamp01(dmg / 40) },
    { k: '续航', v: clamp01(0.25 + hp / 500 + (hasBlade ? 0.25 : 0)) },
    { k: '辅助', v: clamp01(0.2 + tal.length * 0.22 + (hasCare ? 0.25 : 0) + (hasHex ? 0.12 : 0)) }
  ];
}

function drawRatRadar(cx, cy, R, rat){
  var st = ratRadarStats(rat);
  var n = st.length;
  ctx.save();
  /* 背景网格：三层 */
  for (var ring = 1; ring <= 3; ring++){
    var rr0 = R * ring / 3;
    ctx.beginPath();
    for (var i = 0; i <= n; i++){
      var a = -Math.PI / 2 + (i % n) * (Math.PI * 2 / n);
      var x = cx + Math.cos(a) * rr0, y = cy + Math.sin(a) * rr0;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = ring === 3 ? 'rgba(232,172,80,.35)' : 'rgba(255,255,255,.09)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (var j = 0; j < n; j++){
    var ang = -Math.PI / 2 + j * (Math.PI * 2 / n);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.stroke();
  }
  /* 数据多边形 */
  ctx.beginPath();
  for (var k = 0; k <= n; k++){
    var idx = k % n;
    var a2 = -Math.PI / 2 + idx * (Math.PI * 2 / n);
    var rv = R * st[idx].v;
    var px = cx + Math.cos(a2) * rv, py = cy + Math.sin(a2) * rv;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(232,172,80,.30)';
  ctx.fill();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  /* 顶点小方块 + 轴标签 */
  for (var m = 0; m < n; m++){
    var a3 = -Math.PI / 2 + m * (Math.PI * 2 / n);
    var vx = cx + Math.cos(a3) * R * st[m].v, vy = cy + Math.sin(a3) * R * st[m].v;
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(Math.round(vx) - 2, Math.round(vy) - 2, 4, 4);
    var lx = cx + Math.cos(a3) * (R + 12), ly = cy + Math.sin(a3) * (R + 10);
    txt(st[m].k, lx, ly + 4, Math.max(8, Math.round(W * 0.023)), C.muted, 'center');
  }
  ctx.restore();
}

/* 详情页的「可用转职证」：能吃的证列出来，点一下就用在这只鼠身上 */
function drawGearBag(x, y, w, rat, idx){
  var opts = gearOptionsFor(rat);
  var rowH = 28;
  var h = 26 + Math.max(1, opts.length) * rowH + 6;
  rr(x, y, w, h, 12);
  ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.stroke();
  txt('可用转职证', x + 12, y + 18, Math.max(9, Math.round(W * 0.026)), C.amber, 'left', true);
  txt('背包共 ' + gearCountAll() + ' 张', x + w - 12, y + 18,
      Math.max(8, Math.round(W * 0.023)), C.muted, 'right');

  if (!opts.length){
    txt(rat.tier >= 4 ? '已经满阶，用不上了' : '没有能用的证 —— 抽奖页道具池 / 补给站可获得',
        x + 12, y + 44, Math.max(9, Math.round(W * 0.024)), C.muted, 'left');
    return;
  }
  for (var i = 0; i < opts.length && i < 3; i++){
    var o = opts[i];
    var by = y + 28 + i * rowH;
    var bw = w - 24, bh = 26;
    rr(x + 12, by, bw, bh, 13);
    ctx.fillStyle = 'rgba(232,172,80,.16)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232,172,80,.6)'; ctx.stroke();
    txt('使用 ' + (LINE_NAME[o.line] || o.line) + (TIER_LABEL[o.tier] || '') + '证 ×' + o.count,
        x + 22, by + 18, Math.max(10, Math.round(W * 0.027)), '#ffd98a', 'left', true);
    txt('→ ' + (LINE_NAME[o.line] || o.line) + ' · ' + (TIER_LABEL[o.tier] || ''),
        x + w - 22, by + 18, Math.max(9, Math.round(W * 0.024)), C.muted, 'right');
    (function(key){
      shopHit(x + 12, by, bw, bh, function(){
        if (gearUse(idx, key)){
          floatText('转职成功', W / 2, Math.round(H * 0.34), '#ffd98a', true);
        } else { sfx('invalid'); }
      });
    })(o.key);
  }
}

/* 详情页「技能」：名称 + 等级 + 类型 + 目标数 + 冷却（S2 只展示） */
function drawSkillBlock(x, y, w, rat){
  var list = rat.skills || [];
  var rows = Math.min(3, Math.max(1, list.length));
  var h = 26 + rows * 26 + 4;
  rr(x, y, w, h, 12);
  ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.stroke();
  txt('技能', x + 12, y + 18, Math.max(9, Math.round(W * 0.026)), C.amber, 'left', true);
  txt(list.length ? ('共 ' + list.length + ' 个' + (list.length > 3 ? '（显示前 3）' : '')) : '暂无',
      x + w - 12, y + 18, Math.max(8, Math.round(W * 0.023)), C.muted, 'right');

  if (!list.length){
    txt('抽卡有机会携带（含魔法/增益），炼妖可以继续堆', x + 12, y + 42,
        Math.max(9, Math.round(W * 0.0235)), C.muted, 'left');
    return;
  }
  var roman = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
  for (var i = 0; i < list.length && i < 3; i++){
    var sk = list[i];
    var def = skillDefs()[sk.id] || {};
    var ry = y + 26 + i * 26;
    var kindCol = def.kind === 'mag' ? '#8fb8ff' : (def.kind === 'buff' ? '#79c98a' : '#ffb37a');
    txt((def.name || sk.id) + ' ' + (roman[(sk.lv || 1) - 1] || ''),
        x + 12, ry + 12, Math.max(10, Math.round(W * 0.027)), kindCol, 'left', true);
    var tgt = (def.targets || [1, 1, 1])[(sk.lv || 1) - 1] || 1;
    var cd = Math.round(((def.cd || [0, 0, 0])[(sk.lv || 1) - 1] || 0) / 1000);
    txt(skillKindLabel(def.kind) + ' · ' + tgt + ' 目标 · ' + cd + 's',
        x + w - 12, ry + 12, Math.max(8, Math.round(W * 0.023)), C.muted, 'right');
  }

}

/* ================= 仓鼠详情（页签式，一屏放得下） =================
   原来把天赋 / 技能 / 转职证 / 能力全堆在一屏，手机上会被裁掉且无法下拉。
   现在拆成四个页签，每页只画一块内容，底部操作固定。 */
function drawRatDetail(){
  HITS = [];
  var pad = L.pad;
  var idx = SHOP.detail | 0;
  var rat = SHOP.rats[idx];
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  txt("仓鼠详情", pad, 40, Math.round(W * 0.045), C.ink, "left", true);
  gachaBackBtn(pad);

  if (!rat){
    txt("这只仓鼠不在了（可能被分解 / 合成了）", W / 2, H * 0.4,
        Math.max(11, Math.round(W * 0.032)), C.muted, "center");
    return;
  }

  var st = ratStats(rat);
  var onSquad = SHOP.squad.indexOf(idx) >= 0;

  /* ---------- 顶部：立绘 + 概要 ---------- */
  var cardY = 56, cardH = 120;
  rr(pad, cardY, W - pad * 2, cardH, 14);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(232,172,80,.35)"; ctx.stroke();

  var art = (typeof artFromMap === "function")
    ? artFromMap(unitArtMap(), [(rat.line || "none") + "-" + (rat.tier || 1)]) : null;
  var box = 92, ax = pad + 12, ay = cardY + 14;
  rr(ax, ay, box, box, 12);
  ctx.fillStyle = "rgba(255,255,255,.03)"; ctx.fill();
  if (art){
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, ax + 4, ay + 4, box - 8, box - 8);
    ctx.restore();
  }

  var tx = ax + box + 14;
  if (rat.line && rat.line !== 'none') drawClassIcon(rat.line, W - pad - 30, cardY + 28, 36);
  txt(st.name, tx, cardY + 30, Math.round(W * 0.045), C.ink, "left", true);
  txt(ratLineLabel(rat) + (onSquad ? " · 上场中" : ""), tx, cardY + 50,
      Math.max(10, Math.round(W * 0.026)), onSquad ? "#79c98a" : C.muted, "left");
  txt("★" + ratScore(rat) + "  ·  天赋 " + (rat.talents || []).length + "/3  ·  技能 " + (rat.skills || []).length,
      tx, cardY + 70, Math.max(9, Math.round(W * 0.024)), "#ffd98a", "left");
  txt("生命 " + st.hp + " · 出手 " + (st.atkMs ? (st.atkMs / 1000).toFixed(1) + "s" : "不攻击") +
      " · 法强 " + (typeof unitMag === "function" ? unitMag(makeUnit(ratId(rat), 0)) : "-"),
      tx, cardY + 90, Math.max(9, Math.round(W * 0.023)), C.muted, "left");

  /* ---------- 页签 ---------- */
  var tabs = ["天赋", "技能", "转职证", "能力"];
  var tabY = cardY + cardH + 8, tabH = 26;
  var tw = Math.floor((W - pad * 2 - 3 * 6) / 4);
  SHOP.detailTab = Math.max(0, Math.min(3, SHOP.detailTab | 0));
  for (var i = 0; i < tabs.length; i++){
    var bx = pad + i * (tw + 6);
    var on = (SHOP.detailTab | 0) === i;
    rr(bx, tabY, tw, tabH, 13);
    ctx.fillStyle = on ? C.amber : C.panel2; ctx.fill();
    txt(tabs[i], bx + tw / 2, tabY + 18, Math.max(10, Math.round(W * 0.026)),
        on ? "#241d2e" : C.ink, "center", true);
    (function(k){
      shopHit(bx, tabY, tw, tabH, function(){ SHOP.detailTab = k; sfx("tap"); });
    })(i);
  }

  var cy0 = tabY + tabH + 10;
  var chAvail = H - 150 - cy0;

  /* ---------- 页签内容 ---------- */
  if ((SHOP.detailTab | 0) === 0){
    var slotH = 52, sy = cy0;
    for (var t = 0; t < 3; t++){
      var tal = (rat.talents || [])[t];
      var y = sy + t * (slotH + 8);
      rr(pad, y, W - pad * 2, slotH, 10);
      ctx.fillStyle = tal ? "rgba(232,172,80,.07)" : "rgba(255,255,255,.02)"; ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = tal ? "rgba(232,172,80,.45)" : C.line; ctx.stroke();
      txt("槽" + (t + 1), pad + 10, y + 17, 9, C.muted, "left", true);
      if (!tal){
        txt(t === 0 ? "本职业天赋（转职后觉醒）" : "未开启（抽卡有概率携带）",
            pad + 44, y + 18, Math.max(9, Math.round(W * 0.024)), "#5b5374", "left");
        continue;
      }
      var def = TALENT_DEF[tal.id] || {};
      var roman = ["Ⅰ", "Ⅱ", "Ⅲ"];
      txt((def.name || tal.id) + " " + (roman[(tal.lv || 1) - 1] || ""),
          pad + 44, y + 20, Math.max(12, Math.round(W * 0.032)), "#ffd98a", "left", true);
      txt(talentEffectText(tal.id, tal.lv || 1), pad + 44, y + 38,
          Math.max(8, Math.round(W * 0.022)), C.ink, "left");
      var rbw = 44, rbh = 20, rbx = W - pad - rbw - 8, rby = y + slotH - 26;
      var armed = REROLL_ARM === (idx + ":" + t);
      var canR = (SHOP.shard | 0) >= REROLL_COST;
      rr(rbx, rby, rbw, rbh, 10);
      ctx.fillStyle = armed ? "rgba(217,109,85,.55)" : (canR ? "rgba(199,182,255,.16)" : "#241d2e"); ctx.fill();
      ctx.strokeStyle = armed ? "#d96d55" : (canR ? "rgba(199,182,255,.7)" : "#332b45");
      ctx.lineWidth = 1; ctx.stroke();
      txt(armed ? "确认?" : ("洗 " + REROLL_COST), rbx + rbw / 2, rby + 14,
          Math.max(8, Math.round(W * 0.022)), armed ? "#fff" : (canR ? "#c7b6ff" : "#5b5374"), "center", true);
      (function(slotIndex){
        shopHit(rbx, rby, rbw, rbh, function(){
          if ((SHOP.shard | 0) < REROLL_COST){ sfx("invalid"); return; }
          var key = idx + ":" + slotIndex;
          if (REROLL_ARM !== key){ REROLL_ARM = key; sfx("tap"); return; }
          REROLL_ARM = "";
          var res = rerollTalent(idx, slotIndex);
          if (res) floatText("洗练 " + ["Ⅰ","Ⅱ","Ⅲ"][res.from - 1] + "→" + ["Ⅰ","Ⅱ","Ⅲ"][res.to - 1],
                              W / 2, Math.round(H * 0.33), res.to > res.from ? "#ffd98a" : "#d96d55", true);
        });
      })(t);
    }
    txt("洗练 " + REROLL_COST + " 碎片 · 概率 Ⅰ62% / Ⅱ30% / Ⅲ8%", pad, sy + 3 * (slotH + 8) + 6,
        Math.max(8, Math.round(W * 0.022)), "#8f86a6", "left");
  } else if ((SHOP.detailTab | 0) === 1){
    var sk = rat.skills || [];
    if (!sk.length){
      txt("还没有技能 —— 抽卡有概率携带（物理 / 魔法 / 增益），炼妖可以继续堆",
          W / 2, cy0 + 40, Math.max(10, Math.round(W * 0.026)), C.muted, "center");
    } else {
      var rowH = 40, roman2 = ["Ⅰ", "Ⅱ", "Ⅲ"];
      for (var k2 = 0; k2 < sk.length && cy0 + k2 * rowH < H - 160; k2++){
        var one = sk[k2];
        var d2 = skillDefs()[one.id] || {};
        var yy = cy0 + k2 * rowH;
        rr(pad, yy, W - pad * 2, rowH - 6, 9);
        ctx.fillStyle = "rgba(255,255,255,.03)"; ctx.fill();
        var col = d2.kind === "mag" ? "#8fb8ff" : (d2.kind === "buff" ? "#79c98a" : "#ffb37a");
        ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
        txt((d2.name || one.id) + " " + (roman2[(one.lv || 1) - 1] || ""),
            pad + 10, yy + 15, Math.max(10, Math.round(W * 0.027)), col, "left", true);
        var tg = (d2.targets || [1,1,1])[(one.lv || 1) - 1] || 1;
        var cd = Math.round(((d2.cd || [0,0,0])[(one.lv || 1) - 1] || 0) / 1000);
        txt(skillKindLabel(d2.kind) + " · " + tg + " 目标 · " + cd + "s",
            pad + 10, yy + 29, Math.max(8, Math.round(W * 0.022)), C.muted, "left");
        txt(d2.desc || "", W - pad - 10, yy + 22, Math.max(8, Math.round(W * 0.021)), "#6a6480", "right");
      }
    }
  } else if ((SHOP.detailTab | 0) === 2){
    var opts = gearOptionsFor(rat);
    txt("背包共 " + gearCountAll() + " 张证", pad, cy0 + 4,
        Math.max(9, Math.round(W * 0.024)), C.muted, "left");
    if (!opts.length){
      txt(rat.tier >= 4 ? "已经满阶，用不上了" : "没有能用的证 —— 抽奖页道具池 / 补给站可获得",
          W / 2, cy0 + 48, Math.max(10, Math.round(W * 0.024)), C.muted, "center");
    } else {
      for (var g2 = 0; g2 < opts.length && g2 < 4; g2++){
        var o2 = opts[g2];
        var by2 = cy0 + 20 + g2 * 34;
        rr(pad, by2, W - pad * 2, 30, 15);
        ctx.fillStyle = "rgba(232,172,80,.16)"; ctx.fill();
        ctx.strokeStyle = "rgba(232,172,80,.6)"; ctx.lineWidth = 1; ctx.stroke();
        txt("使用 " + (LINE_NAME[o2.line] || o2.line) + (TIER_LABEL[o2.tier] || "") + "证 ×" + o2.count,
            pad + 10, by2 + 20, Math.max(10, Math.round(W * 0.026)), "#ffd98a", "left", true);
        txt("→ " + (LINE_NAME[o2.line] || o2.line) + " · " + (TIER_LABEL[o2.tier] || ""),
            W - pad - 10, by2 + 20, Math.max(9, Math.round(W * 0.023)), C.muted, "right");
        (function(key){
          shopHit(pad, by2, W - pad * 2, 30, function(){
            if (gearUse(idx, key)) floatText("转职成功", W / 2, Math.round(H * 0.30), "#ffd98a", true);
            else sfx("invalid");
          });
        })(o2.key);
      }
      txt("转职有 30% 概率随机失去 1 个技能", pad, cy0 + 20 + Math.min(4, opts.length) * 34 + 6,
          Math.max(8, Math.round(W * 0.022)), "#8f86a6", "left");
    }
  } else {
    var rpR = 54;
    drawRatRadar(W / 2, cy0 + 92, rpR, rat);
    txt("生命 " + st.hp + " · 基础 " + st.baseDmg + " · 强化 " + st.act, pad, H - 168,
        Math.max(9, Math.round(W * 0.023)), C.muted, "left");
  }

  /* ---------- 底部操作 ---------- */
  var bh = 40, byy = H - 96;
  var bw = Math.round((W - pad * 2 - 16) / 3);
  function act(i, label, enabled, color, onTap){
    var bx = pad + i * (bw + 8);
    rr(bx, byy, bw, bh, 20);
    ctx.fillStyle = enabled ? color : "#241d2e"; ctx.fill();
    txt(label, bx + bw / 2, byy + 26, Math.max(10, Math.round(W * 0.028)),
        enabled ? "#241d2e" : "#5b5374", "center", true);
    shopHit(bx, byy, bw, bh, onTap);
  }
  act(0, onSquad ? "下场" : "上场", true, onSquad ? "rgba(232,172,80,.75)" : C.amber, function(){
    if (onSquad){
      var kk = SHOP.squad.indexOf(idx);
      if (kk >= 0) SHOP.squad[kk] = -1;
    } else {
      if (squadOnCount() >= squadSlots()){ sfx("invalid"); return; }
      if (squadLineCount(rat.line) >= maxSameLine(rat.line)){ sfx("invalid"); return; }
      var slot = squadFirstEmpty();
      if (slot >= 0) SHOP.squad[slot] = idx;
    }
    rebuildUnitsIfShop(); shopSave(); sfx("tap");
  });
  act(1, "炼妖", true, "rgba(199,182,255,.85)", function(){
    SHOP.page = "fuse"; FUSE.main = idx; FUSE.sub = -1; FUSE.result = null; sfx("tap");
  });
  act(2, "分解", !onSquad && SHOP.rats.length > 1, "rgba(217,109,85,.9)", function(){
    if (onSquad || SHOP.rats.length <= 1){ sfx("invalid"); return; }
    var gain = decompRat(idx);
    if (gain > 0){ SHOP.page = ""; floatText("碎片 +" + gain, W / 2, Math.round(H * 0.4), "#c7b6ff", true); }
  });
  txt("双击仓鼠卡也能进这里 · 四个页签看不同信息", W / 2, H - 44,
      Math.max(8, Math.round(W * 0.021)), "#5b5374", "center");
}

/* 取某只鼠的像素贴图（没有就返回 null） */
/* 职业图标（16×16 头像+武器，Tessera 生成）：用于卡片角标，一眼看出是什么职业 */
function classIconImg(line){
  if (!line || line === 'none') return null;
  return (typeof artFromMap === 'function') ? artFromMap(unitArtMap(), ['class-' + line]) : null;
}
function drawClassIcon(line, cx, cy, size){
  var img = classIconImg(line);
  if (!img) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
  ctx.restore();
  return true;
}

function ratArtImg(rat){
  if (!rat) return null;
  var line = rat.line || 'none';
  var tier = rat.tier || 1;
  var keys = [line + '-' + tier, 'none-1', line + '-2'];
  return (typeof artFromMap === 'function') ? artFromMap(unitArtMap(), keys) : null;
}

/* 在 (cx, cy) 画一只鼠（贴图优先，矢量兜底），size 为边长 */
function drawRatAt(rat, cx, cy, size, alpha){
  var img = ratArtImg(rat);
  ctx.save();
  if (typeof alpha === 'number') ctx.globalAlpha = alpha;
  if (img){
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
  } else if (typeof drawHamsterArt === 'function'){
    drawHamsterArt(cx - size * 0.5, cy - size * 0.42, size * 0.9,
                   { line: rat && rat.line, cls: rat && rat.line, tier: rat && rat.tier });
  }
  ctx.restore();
}

/* 天赋串：硬化Ⅲ 复苏Ⅱ */
function talentText(rat){
  var ts = (rat && rat.talents) || [];
  var roman = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
  return ts.map(function(t){
    return (TALENT_DEF[t.id] ? TALENT_DEF[t.id].name : t.id) + roman[(t.lv || 1) - 1];
  }).join(' ');
}

function drawGacha(){
  HITS = [];
  var pad = L.pad;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  if (revealActive()){ drawGachaReveal(); return; }
  txt('抽奖', pad, 44, Math.round(W * 0.05), C.ink, 'left', true);
  gachaBackBtn(pad);
  txt('金币 ' + SHOP.coins + ' · 碎片 ' + (SHOP.shard | 0), W - pad, 44,
      Math.max(10, Math.round(W * 0.03)), C.amber, 'right');

  drawGachaTabs(pad, 62);

  var cfg = gachaCfg();
  var isRat = GACHA_TAB === 'rat';
  var c = isRat ? cfg.rat : cfg.item;
  var pityMax = isRat ? (c.pityDouble || 20) : (c.pityGear || 10);
  var pityLeft = Math.max(0, pityMax - (SHOP.gachaPity | 0));

  /* 概率面板 */
  var py = 104, ph = 252;
  rr(pad, py, W - pad * 2, ph, 14);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232,172,80,.35)'; ctx.stroke();

  if (isRat){
    txt('仓鼠池 · 单抽 ' + c.cost + ' · 十连 ' + (c.tenCost || c.cost * 9), pad + 14, py + 24,
        Math.round(W * 0.034), C.ink, 'left', true);
    txt('白板 91.5% · 二级 8% · 三级 0.5%', pad + 14, py + 48,
        Math.max(9, Math.round(W * 0.026)), '#ffd98a', 'left');
    txt('技能 0/1/2/3 = 30/42/22/6% · 等级 Ⅰ62/Ⅱ30/Ⅲ8', pad + 14, py + 66,
        Math.max(9, Math.round(W * 0.026)), '#ffd98a', 'left');
    txt('十抽保底一只二级 —— 距保底 ' + pityLeft + ' 抽', pad + 14, py + 84,
        Math.max(9, Math.round(W * 0.026)), C.muted, 'left');
    txt('槽1 必为本职业天赋，槽2/3 可跨职业', pad + 14, py + 102,
        Math.max(9, Math.round(W * 0.025)), C.muted, 'left');
  } else {
    txt('道具池 · 单抽 ' + c.cost + ' · 十连 ' + (c.tenCost || c.cost * 9), pad + 14, py + 24,
        Math.round(W * 0.034), C.ink, 'left', true);
    txt('金币 +30 40% · 碎片 ×1 30%', pad + 14, py + 48,
        Math.max(9, Math.round(W * 0.026)), '#ffd98a', 'left');
    txt('转职证 25%（无鼠可升折 2 碎片）· 大奖 5%', pad + 14, py + 66,
        Math.max(9, Math.round(W * 0.026)), '#ffd98a', 'left');
    txt('十连保底：必出 1 张转职证 —— 距保底 ' + pityLeft + ' 抽', pad + 14, py + 84,
        Math.max(9, Math.round(W * 0.026)), C.muted, 'left');
  }

  /* 最近结果 */
  var listY = py + 124;
  txt(isRat ? '本次结果' : '上次结果', pad + 14, listY, Math.max(9, Math.round(W * 0.026)), C.muted, 'left', true);
  if (isRat){
    var recent = GACHA_LAST.slice(-10);
    for (var i = 0; i < recent.length; i++){
      var r = recent[i];
      var ly = listY + 26 + Math.floor(i / 5) * 32;
      var lx = pad + 14 + (i % 5) * 62;
      rr(lx, ly - 12, 58, 28, 8);
      ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fill();
      var tal = (r.rat.talents || []).map(function(t){ return (TALENT_DEF[t.id] ? TALENT_DEF[t.id].name : t.id).slice(0,1) + t.lv; }).join(' ');
      txt((LINE_NAME[r.rat.line] || '').slice(0, 1), lx + 12, ly + 4, 9, C.muted, 'center');
      txt(tal || '—', lx + 34, ly + 4, 8, '#ffd98a', 'center', true);
      if (r.shard) txt('+' + r.shard + '碎', lx + 29, ly + 13, 7, '#c7b6ff', 'center');
    }
  } else {
    txt(SLOT.last || '还没抽过', pad + 14, listY + 24,
        Math.max(11, Math.round(W * 0.032)), '#ffd98a', 'left', true);
  }

  /* 抽卡按钮 */
  var btnY = py + ph - 54, bw = Math.round((W - pad * 2 - 24) / 2), bh = 40;
  var canOne = SHOP.coins >= (c.cost || 20);
  var canTen = SHOP.coins >= (c.tenCost || (c.cost || 20) * 9);
  function gbtn(x, label, enabled, onTap){
    rr(x, btnY, bw, bh, 20);
    ctx.fillStyle = enabled ? C.amber : '#241d2e';
    ctx.fill();
    txt(label, x + bw / 2, btnY + 26, Math.max(11, Math.round(W * 0.036)),
        enabled ? '#241d2e' : '#5b5374', 'center', true);
    shopHit(x, btnY, bw, bh, onTap);
  }
  gbtn(pad + 8, '单抽 ' + (c.cost || 20), canOne, function(){
    if (SHOP.coins < (c.cost || 20)){ sfx('invalid'); return; }
    if (isRat){
      var r1 = ratGachaRoll();
      if (r1) startReveal([r1]);
    } else {
      slotRoll();
      startReveal([{ rat: { line: 'none', tier: 1, talents: [] }, t3: '', prize: SLOT.last }]);
    }
    GACHA_FLASH = { t0: performance.now(), text: '', tier: 0 };
  });
  gbtn(pad + 16 + bw, '十连 ' + (c.tenCost || (c.cost || 20) * 9), canTen, function(){
    if (isRat){
      if (SHOP.coins < (c.tenCost || c.cost * 9)){ sfx('invalid'); return; }
      var many = ratGachaTen();
      if (many && many.length) startReveal(many);
    } else {
      if (SHOP.coins < (c.tenCost || c.cost * 9)){ sfx('invalid'); return; }
      SHOP.coins -= (c.tenCost || c.cost * 9);
      for (var i = 0; i < 10; i++) slotResolve();
    }
  });

  /* 池子展示 */
  var stripY = py + ph + 10;
  drawPoolStrip(pad, stripY, 76);

  /* 保底进度 */
  var pityCur = pityMax - pityLeft;
  txt(isRat ? '距保底 ' + pityLeft + ' 抽' : '距十连保底 ' + pityLeft + ' 抽',
      pad, stripY + 100, Math.max(9, Math.round(W * 0.026)), C.muted, 'left');
  drawPityBar(pad, stripY + 106, W - pad * 2, pityCur, pityMax,
              isRat ? '#ffd166' : C.amber);

  /* 碎片兑换：真按钮 */
  var exY = stripY + 122, exW = Math.round((W - pad * 2 - 10) / 2), exH = 34;
  function shardExchange(x, label, cost, onTap){
    var can = (SHOP.shard | 0) >= cost;
    rr(x, exY, exW, exH, 16);
    ctx.fillStyle = can ? 'rgba(199,182,255,.18)' : '#241d2e'; ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = can ? 'rgba(199,182,255,.7)' : '#332b45'; ctx.stroke();
    txt(label, x + exW / 2, exY + 14, Math.max(9, Math.round(W * 0.026)),
        can ? '#c7b6ff' : '#5b5374', 'center', true);
    txt(cost + ' 碎片', x + exW / 2, exY + 27, Math.max(8, Math.round(W * 0.022)),
        can ? '#8f86a6' : '#4a4359', 'center');
    shopHit(x, exY, exW, exH, onTap);
  }
  shardExchange(pad, '碎片换道具抽', cfg.item.shardCost, function(){
    if ((SHOP.shard | 0) < cfg.item.shardCost){ sfx('invalid'); return; }
    addShard(-cfg.item.shardCost);
    slotRoll();
    startReveal([{ rat: { line: 'none', tier: 1, talents: [] }, t3: '', prize: SLOT.last }]);
  });
  shardExchange(pad + exW + 10, '碎片换仓鼠抽', cfg.rat.shardCost, function(){
    if ((SHOP.shard | 0) < cfg.rat.shardCost){ sfx('invalid'); return; }
    addShard(-cfg.rat.shardCost);
    var rr2 = ratGachaApply();
    if (rr2) startReveal([rr2]);
  });



  drawLoopTips(pad, exY + exH + 14, W - pad * 2);

  /* Ⅲ 级播报（金色横条 + 分享） */
  var now = performance.now();
  var g3 = null;
  for (var k = GACHA_LAST.length - 1; k >= 0; k--){
    var rr0 = GACHA_LAST[k];
    if (rr0.t3) { g3 = rr0; break; }
  }
  if (g3 && now - (g3.t0 || 0) < 4000){
    var bh2 = 54, by2 = Math.round(H * 0.30);
    rr(pad, by2, W - pad * 2, bh2, 14);
    ctx.fillStyle = 'rgba(232,172,80,.92)'; ctx.fill();
    txt('★NEW★ Ⅲ 级天赋 · ' + g3.t3, W / 2 - 26, by2 + 24, Math.round(W * 0.042), '#241d2e', 'center', true);
    txt('分享', W - pad - 30, by2 + 36, Math.max(10, Math.round(W * 0.03)), '#241d2e', 'center', true);
    shopHit(W - pad - 58, by2 + 16, 48, 24, function(){
      var msg = '我抽到了 Ⅲ 级天赋「' + g3.t3 + '」！';
      try {
        if (typeof wx !== 'undefined' && wx.shareAppMessage) wx.shareAppMessage({ title: msg });
        else if (navigator.clipboard) navigator.clipboard.writeText(msg);
      } catch (e) {}
      sfx('pick');
    });
  }
}

/* ---------- 抽卡揭示动画（纯代码绘制） ----------
   0–420ms 卡背脉动 → 420–720ms 翻牌 → 720–1200ms 结果亮相（Ⅲ 级金色爆光） */
var REVEAL = { t0: 0, results: [], t3: '', pre: 0 };

function revealActive(){ return REVEAL.results.length > 0 && performance.now() - REVEAL.t0 < 2200; }

function startReveal(results){
  if (!results || !results.length) return;
  REVEAL.results = results.slice(0, 10);
  REVEAL.t0 = performance.now();
  REVEAL.pre = 320;                 /* 先播 0.32s 的"机器启动"，再翻牌 */
  REVEAL.t3 = '';
  for (var i = 0; i < REVEAL.results.length; i++){
    if (REVEAL.results[i].t3){ REVEAL.t3 = REVEAL.results[i].t3; break; }
  }
  sfx('gachaFlip');
  if (REVEAL.t3){
    setTimeout(function(){ try { sfx('gachaGold'); } catch (e) {} }, 700);
  } else {
    setTimeout(function(){ try { sfx('pick'); } catch (e) {} }, 620);
  }
}

function drawGachaReveal(){
  var now = performance.now();
  var age0 = now - REVEAL.t0;
  var pre = REVEAL.pre || 0;
  var list = REVEAL.results;

  /* 启动帧：投币 + 扫描线，给抽卡一个"仪式感" */
  if (age0 < pre){
    var k0 = age0 / Math.max(1, pre);
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,16,.92)';
    ctx.fillRect(0, 0, W, H);
    var cx0 = W / 2, cy0 = H * 0.42;
    ctx.strokeStyle = 'rgba(232,172,80,' + (0.35 + 0.45 * Math.abs(Math.sin(now / 90))) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx0, cy0, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx0, cy0, 30, now / 220, now / 220 + Math.PI * 1.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.fillRect(0, H * 0.42 - 2 + Math.sin(now / 120) * 60, W, 3);
    txt('投币…', W / 2, cy0 + 80, Math.max(11, Math.round(W * 0.032)), '#ffd98a', 'center', true);
    ctx.restore();
    shopHit(0, 0, W, H, function(){ REVEAL.t0 = 0; REVEAL.results = []; sfx('tap'); });
    return;
  }
  var age = age0 - pre;
  ctx.save();
  ctx.fillStyle = 'rgba(10,8,16,.88)';
  ctx.fillRect(0, 0, W, H);
  /* 全屏"点一下关闭"先注册，后面的「去编队」按钮才能压在它上面 */
  shopHit(0, 0, W, H, function(){ REVEAL.results = []; sfx('tap'); });

  var cols = list.length > 5 ? 5 : list.length;
  var rows = Math.ceil(list.length / cols);
  var cell = list.length > 1 ? 58 : 108;
  var gapX = 8, gapY = 12;
  var gridW = cols * cell + (cols - 1) * gapX;
  var gridH = rows * cell + (rows - 1) * gapY;
  var x0 = (W - gridW) / 2, y0 = H * 0.34 - gridH / 2 + 40;

  for (var i = 0; i < list.length; i++){
    var r = list[i];
    var t = age - 420 - i * 55;                 /* 每张错开翻牌 */
    var cx = x0 + (i % cols) * (cell + gapX) + cell / 2;
    var cy = y0 + Math.floor(i / cols) * (cell + gapY) + cell / 2;

    if (t < 0){
      /* 卡背 */
      var pulse = 0.9 + 0.1 * Math.sin(now / 180 + i);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      rr(-cell / 2 + 2, -cell / 2 + 2, cell - 4, cell - 4, 10);
      ctx.fillStyle = 'rgba(232,172,80,.14)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,172,80,.55)'; ctx.stroke();
      txt('?', 0, 6, Math.round(cell * 0.42), 'rgba(232,172,80,.75)', 'center', true);
      ctx.restore();
    } else {
      /* 翻牌：横向从 0 展开 */
      var k = Math.min(1, t / 260);
      var sx = Math.abs(Math.cos(k * Math.PI));   /* 0→1→0 的翻页感 */
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.02, sx), 1);
      rr(-cell / 2 + 2, -cell / 2 + 2, cell - 4, cell - 4, 10);
      ctx.fillStyle = r.t3 ? 'rgba(232,172,80,.22)' : 'rgba(255,255,255,.05)'; ctx.fill();
      ctx.lineWidth = r.t3 ? 2.5 : 1;
      ctx.strokeStyle = r.t3 ? '#ffd166' : 'rgba(255,255,255,.18)';
      ctx.stroke();
      ctx.restore();

      if (k >= 1){
        drawRatAt(r.rat, cx, cy - (list.length > 1 ? 6 : 10), cell * (list.length > 1 ? 0.72 : 0.8), 1);
        if (list.length === 1){
          txt((LINE_NAME[r.rat.line] || '') + ' · ' + (TIER_LABEL[r.rat.tier || 1] || ''),
              cx, cy + cell * 0.42, Math.round(W * 0.032), C.ink, 'center', true);
          txt(talentText(r.rat), cx, cy + cell * 0.55, Math.round(W * 0.028), '#ffd98a', 'center');
        }
      }
    }
  }

  /* Ⅲ 级爆光 */
  if (REVEAL.t3 && age > 700){
    var a = Math.min(1, (age - 700) / 300);
    ctx.save();
    ctx.globalAlpha = a * (0.75 + 0.25 * Math.sin(now / 160));
    var g = ctx.createRadialGradient(W / 2, H * 0.34, 10, W / 2, H * 0.34, W * 0.8);
    g.addColorStop(0, 'rgba(255,209,102,.55)');
    g.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    txt('★NEW★ Ⅲ 级天赋 · ' + REVEAL.t3, W / 2, H * 0.16,
        Math.round(W * 0.045), '#ffd166', 'center', true);
  }

  /* 结果去向：加入队伍 / 满员折碎片 */
  var joined = 0, sharded = 0, boxedN = 0;
  for (var qi = 0; qi < list.length; qi++){
    if (list[qi].shard) sharded += list[qi].shard;
    else if (list[qi].boxed) boxedN++;
    else joined++;
  }
  var fy = H * 0.74;
  var msgParts = [];
  if (boxedN) msgParts.push('进仓鼠盒 ' + boxedN + ' 只');
  if (joined) msgParts.push('进仓鼠栏 ' + joined + ' 只');
  if (sharded) msgParts.push('折成 ' + sharded + ' 碎片');
  var msg = msgParts.join(' · ') + '（盒 ' + boxList().length + '/' + boxCap() +
            ' · 栏 ' + SHOP.rats.length + '/' + rosterCap() + '）';
  txt(msg, W / 2, fy, Math.max(10, Math.round(W * 0.028)), joined ? '#79c98a' : '#c7b6ff', 'center', true);

  if (boxedN || joined){
    var gbW = 148, gbH = 34, gbX = W / 2 - gbW / 2, gbY = fy + 14;
    rr(gbX, gbY, gbW, gbH, 17);
    ctx.fillStyle = C.amber; ctx.fill();
    txt('去仓鼠盒挑人 →', W / 2, gbY + 23, Math.max(11, Math.round(W * 0.029)), '#241d2e', 'center', true);
    shopHit(gbX, gbY, gbW, gbH, function(){
      REVEAL.results = [];
      SHOP.page = 'box';
      BOX.sel = -1;
      sfx('tap');
    });
  }

  txt(list.length > 1 ? '十连结果 · 点屏幕继续' : '点屏幕继续', W / 2, H * 0.90,
      Math.max(10, Math.round(W * 0.03)), C.muted, 'center');
  ctx.restore();
}

/* ================= 炼妖页（独立页面） ================= */
var FUSE = { main: -1, sub: -1, result: null, t0: 0 };

/* 炼妖二次确认：写清"技能 8%/条、额外天赋 2.5%/条被吃，槽1 免疫" */
function drawFuseConfirm(){
  var c = FUSE.confirm;
  var pv = fusePreview(c.main, c.sub);
  if (!pv){ FUSE.confirm = null; return; }
  var pad = L.pad;
  ctx.save();
  ctx.fillStyle = 'rgba(10,8,16,.88)';
  ctx.fillRect(0, 0, W, H);
  shopHit(0, 0, W, H, function(){ FUSE.confirm = null; sfx('tap'); });

  var bx = pad, by = Math.round(H * 0.22), bw = W - pad * 2, bh = 300;
  rr(bx, by, bw, bh, 14);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,172,80,.7)'; ctx.stroke();

  txt('确认炼妖', bx + 16, by + 26, Math.round(W * 0.045), C.ink, 'left', true);
  txt('消耗 ' + pv.cost + ' 金币 · 副鼠消失', bx + 16, by + 48,
      Math.max(9, Math.round(W * 0.025)), C.muted, 'left');

  var lines = [
    '槽1 职业天赋：100% 保留（免疫）',
    '技能：每条 ' + Math.round(pv.eatSkill * 100) + '% 被吃 → 未被吃再按 主70% / 副55% 继承',
    '额外天赋：每条 ' + (pv.eatTalent * 100).toFixed(1) + '% 被吃 → 未被吃再按 70% 继承',
    '同名技能/天赋合并升级（Ⅲ 封顶）'
  ];
  for (var i = 0; i < lines.length; i++){
    txt('· ' + lines[i], bx + 16, by + 74 + i * 18,
        Math.max(8, Math.round(W * 0.023)), '#8f86a6', 'left');
  }
  var skN = pv.skillsMain.length + pv.skillsSub.length;
  var talN = pv.extras.length;
  txt('本次参与：技能 ' + skN + ' 条 · 额外天赋 ' + talN + ' 条',
      bx + 16, by + 156, Math.max(9, Math.round(W * 0.025)), '#ffd98a', 'left', true);

  /* 两个按钮 */
  var bw2 = Math.round((bw - 44) / 2), bh2 = 40, by2 = by + bh - 56;
  rr(bx + 16, by2, bw2, bh2, 20);
  ctx.fillStyle = '#241d2e'; ctx.fill();
  ctx.strokeStyle = '#332b45'; ctx.lineWidth = 1; ctx.stroke();
  txt('取消', bx + 16 + bw2 / 2, by2 + 26, Math.max(10, Math.round(W * 0.03)), C.muted, 'center', true);
  shopHit(bx + 16, by2, bw2, bh2, function(){ FUSE.confirm = null; sfx('tap'); });

  rr(bx + 28 + bw2, by2, bw2, bh2, 20);
  ctx.fillStyle = C.amber; ctx.fill();
  txt('确认炼妖', bx + 28 + bw2 + bw2 / 2, by2 + 26, Math.max(10, Math.round(W * 0.03)), '#241d2e', 'center', true);
  shopHit(bx + 28 + bw2, by2, bw2, bh2, function(){
    var mainRat = SHOP.rats[c.main], subRat = SHOP.rats[c.sub];
    FUSE.confirm = null;
    var res = fuseRats(c.main, c.sub);
    if (!res) return;
    FUSE.result = res;
    FUSE.t0 = performance.now();
    FUSE.anim = { t0: performance.now(), main: mainRat, sub: subRat, res: res.fused,
                  gotExtra: res.gotExtra, refunded: res.refunded,
                  lostSkills: res.lostSkills, lostTalents: res.lostTalents };
    sfx('fuseClash');
    setTimeout(function(){ try { sfx('fuseWin'); } catch (e) {} }, 700);
    FUSE.main = -1; FUSE.sub = -1;
  });
  ctx.restore();
}

function drawFuseAnim(){
  var a = FUSE.anim;
  var age = performance.now() - a.t0;
  var cx = W / 2, cy = H * 0.42;
  ctx.save();
  ctx.fillStyle = 'rgba(10,8,16,.90)';
  ctx.fillRect(0, 0, W, H);

  var k = Math.min(1, age / 520);
  var ease = 1 - Math.pow(1 - k, 3);
  var spread = (1 - ease) * (W * 0.34) + 6;

  if (age < 520){
    drawRatAt(a.main, cx - spread, cy, 96, 1);
    drawRatAt(a.sub, cx + spread, cy, 96, 1);
    /* 拖尾 */
    ctx.strokeStyle = 'rgba(232,172,80,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - spread - 40, cy); ctx.lineTo(cx - spread - 8, cy);
    ctx.moveTo(cx + spread + 40, cy); ctx.lineTo(cx + spread + 8, cy);
    ctx.stroke();
  } else if (age < 700){
    var f = (age - 520) / 180;
    ctx.save();
    ctx.globalAlpha = 1 - f * 0.3;
    var g = ctx.createRadialGradient(cx, cy, 4, cx, cy, W * (0.25 + f * 0.5));
    g.addColorStop(0, 'rgba(255,255,255,' + (0.95 - f * 0.5) + ')');
    g.addColorStop(1, 'rgba(232,172,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  } else {
    var p = Math.min(1, (age - 700) / 420);
    var scale = 0.6 + 0.4 * p;
    drawRatAt(a.res, cx, cy, 120 * scale, Math.min(1, p * 1.6));
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 60 + p * 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (p > 0.5){
      txt('炼妖成功', cx, H * 0.62, Math.round(W * 0.045), '#ffd166', 'center', true);
      txt(talentText(a.res), cx, H * 0.68, Math.round(W * 0.032), C.ink, 'center');
      txt(a.gotExtra ? ('继承了 ' + a.gotExtra + ' 条额外天赋') : ('没继承额外天赋，返还 ' + a.refunded + ' 碎片'),
          cx, H * 0.73, Math.max(10, Math.round(W * 0.028)), C.muted, 'center');
    }
  }

  txt('点屏幕跳过', W / 2, H * 0.88, Math.max(9, Math.round(W * 0.026)), '#6a6480', 'center');
  ctx.restore();
  shopHit(0, 0, W, H, function(){ FUSE.anim = null; sfx('tap'); });
}

/* 底部说明卡：把"抽 → 分解 → 洗练 → 炼妖"这条循环讲清楚 */
function drawLoopTips(pad, y, w){
  var h = 92;
  rr(pad, y, w, h, 12);
  ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.stroke();
  txt('碎片的用法', pad + 12, y + 20, Math.max(10, Math.round(W * 0.028)), C.amber, 'left', true);
  var lines = [
    '抽到不想要的鼠 → 详情页「分解」换 2–12 碎片',
    '碎片 → 洗练天赋等级（6 碎片）或再抽一次',
    '两只鼠 → 炼妖（30 金币），主鼠槽1 天赋固定'
  ];
  for (var i = 0; i < lines.length; i++){
    txt('· ' + lines[i], pad + 12, y + 40 + i * 17,
        Math.max(9, Math.round(W * 0.0235)), '#8f86a6', 'left');
  }
}

/* ================= 仓鼠盒（仓库页） ================= */
var BOX = { page: 0, sel: -1 };

function drawBoxPage(){
  HITS = [];
  var pad = L.pad;
  var box = boxList();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  txt('仓鼠盒', pad, 40, Math.round(W * 0.045), C.ink, 'left', true);
  gachaBackBtn(pad);
  txt('盒 ' + box.length + '/' + boxCap() + ' · 仓鼠栏 ' + SHOP.rats.length + '/' + rosterCap() +
      ' · 碎片 ' + (SHOP.shard | 0),
      pad, 58, Math.max(9, Math.round(W * 0.024)), C.muted, 'left');

  if (!box.length){
    txt('盒子是空的 —— 仓鼠栏满了之后抽到的鼠会进这里', W / 2, H * 0.42,
        Math.max(10, Math.round(W * 0.028)), C.muted, 'center');
    return;
  }

  /* 3 列 × 3 行，每页 9 只 */
  var COLS = 3, ROWS = 3, PER = COLS * ROWS;
  var gx = 6, gy = 6;
  var cw = Math.round((W - pad * 2 - gx * (COLS - 1)) / COLS);
  var ch = Math.round(cw * 0.78);
  var top = 72;
  var pages = Math.max(1, Math.ceil(box.length / PER));
  BOX.page = Math.min(Math.max(0, BOX.page | 0), pages - 1);
  var start = BOX.page * PER;

  for (var i = start; i < box.length && i < start + PER; i++){
    var v = i - start;
    var cx = pad + (v % COLS) * (cw + gx);
    var cy = top + Math.floor(v / COLS) * (ch + gy);
    var rat = box[i];
    var sel = BOX.sel === i;
    rr(cx, cy, cw, ch, 10);
    ctx.fillStyle = sel ? 'rgba(232,172,80,.14)' : C.panel; ctx.fill();
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeStyle = sel ? C.amber : C.line; ctx.stroke();
    drawRatAt(rat, cx + cw / 2, cy + ch * 0.38, Math.min(46, ch * 0.52), 1);
    var name = ratLabel(rat); if (name.length > 4) name = name.slice(0, 4);
    txt(name, cx + cw / 2, cy + ch - 20, Math.max(9, Math.round(W * 0.026)), C.ink, 'center', true);
    var ts = rat.talents || [];
    if (ts.length){
      var roman = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
      var t0 = ts[0];
      txt((TALENT_DEF[t0.id] ? TALENT_DEF[t0.id].name : t0.id).slice(0, 2) + roman[(t0.lv || 1) - 1],
          cx + cw / 2, cy + ch - 7, Math.max(8, Math.round(W * 0.022)), '#ffd98a', 'center');
    }
    (function(idx){
      shopHit(cx, cy, cw, ch, function(){ BOX.sel = (BOX.sel === idx) ? -1 : idx; sfx('tap'); });
    })(i);
  }

  /* 翻页 */
  if (pages > 1){
    var pw = 30, phh = 20, pyy = top + ROWS * (ch + gy) + 4;
    function pg(bx, label, dir, on){
      rr(bx, pyy, pw, phh, 10);
      ctx.fillStyle = on ? C.panel2 : '#241d2e'; ctx.fill();
      ctx.strokeStyle = on ? C.line : '#332b45'; ctx.lineWidth = 1; ctx.stroke();
      txt(label, bx + pw / 2, pyy + 14, 11, on ? C.ink : '#5b5374', 'center', true);
      shopHit(bx, pyy, pw, phh, function(){
        if (!on) { sfx('invalid'); return; }
        BOX.page = Math.min(pages - 1, Math.max(0, BOX.page + dir)); BOX.sel = -1; sfx('tap');
      });
    }
    pg(pad, '‹', -1, BOX.page > 0);
    pg(pad + pw + 6, '›', 1, BOX.page < pages - 1);
    txt((BOX.page + 1) + '/' + pages, pad + pw * 2 + 18, pyy + 14,
        Math.max(9, Math.round(W * 0.024)), C.muted, 'left');
  }

  /* 选中操作 */
  var oy = H - 150;
  rr(pad, oy, W - pad * 2, 116, 12);
  ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.stroke();
  if (BOX.sel < 0 || !box[BOX.sel]){
    txt('点一只仓鼠查看操作', W / 2, oy + 44, Math.max(10, Math.round(W * 0.028)), C.muted, 'center');
    return;
  }
  var cur = box[BOX.sel];
  txt(ratLabel(cur) + ' · ' + ratLineLabel(cur), pad + 12, oy + 24,
      Math.max(10, Math.round(W * 0.028)), C.ink, 'left', true);
  var tl = (cur.talents || []).map(function(t){
    return (TALENT_DEF[t.id] ? TALENT_DEF[t.id].name : t.id) + ['Ⅰ','Ⅱ','Ⅲ'][(t.lv || 1) - 1];
  }).join(' ');
  txt(tl || '无天赋', pad + 12, oy + 44, Math.max(9, Math.round(W * 0.024)), '#ffd98a', 'left');

  var fits = SHOP.rats.length < rosterCap();
  var bw = Math.round((W - pad * 2 - 34) / 2), bh = 34;
  function act(i, label, enabled, color, onTap){
    var bx = pad + 12 + i * (bw + 10);
    rr(bx, oy + 58, bw, bh, 16);
    ctx.fillStyle = enabled ? color : '#241d2e'; ctx.fill();
    txt(label, bx + bw / 2, oy + 80, Math.max(10, Math.round(W * 0.028)),
        enabled ? '#241d2e' : '#5b5374', 'center', true);
    shopHit(bx, oy + 58, bw, bh, onTap);
  }
  act(0, fits ? '取出到仓鼠栏' : '仓鼠栏已满', fits, C.amber, function(){
    if (!fits){ sfx('invalid'); return; }
    if (boxTake(BOX.sel)) BOX.sel = -1;
  });
  act(1, '分解 ' + shardValueOf(cur) + ' 碎片', true, 'rgba(217,109,85,.9)', function(){
    var gain = boxDecomp(BOX.sel);
    if (gain > 0){ BOX.sel = -1; floatText('碎片 +' + gain, W / 2, oy - 10, '#c7b6ff', true); }
  });
}

function drawFuse(){
  HITS = [];
  var pad = L.pad;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  txt('炼妖', pad, 44, Math.round(W * 0.05), C.ink, 'left', true);
  gachaBackBtn(pad);
  txt('金币 ' + SHOP.coins + ' · 碎片 ' + (SHOP.shard | 0), W - pad, 44,
      Math.max(10, Math.round(W * 0.03)), C.amber, 'right');

  var top = 64;
  txt('点一只当主鼠（槽1 天赋固定保留）', pad, top, Math.max(9, Math.round(W * 0.026)), C.muted, 'left');
  var cw = Math.round((W - pad * 2 - 12) / 3), chh = 74;
  for (var i = 0; i < SHOP.rats.length && i < 6; i++){
    var r = SHOP.rats[i];
    var cx = pad + (i % 3) * (cw + 6), cy = top + 12 + Math.floor(i / 3) * (chh + 6);
    var isMain = FUSE.main === i, isSub = FUSE.sub === i;
    rr(cx, cy, cw, chh, 10);
    ctx.fillStyle = isMain ? 'rgba(232,172,80,.18)' : (isSub ? 'rgba(159,198,255,.16)' : C.panel);
    ctx.fill();
    ctx.lineWidth = isMain || isSub ? 2 : 1;
    ctx.strokeStyle = isMain ? C.amber : (isSub ? '#9fc6ff' : C.line);
    ctx.stroke();
    txt(isMain ? '主' : (isSub ? '副' : ''), cx + cw - 12, cy + 14,
        9, isMain ? C.amber : '#9fc6ff', 'right', true);
    /* 上场状态 + 价值速览 */
    if (SHOP.squad.indexOf(i) >= 0){
      var obw = 18, obh = 12, obx = cx + 6, oby = cy + 6;
      rr(obx, oby, obw, obh, 6);
      ctx.fillStyle = 'rgba(121,201,138,.22)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(121,201,138,.8)'; ctx.stroke();
      txt('上', obx + obw / 2, oby + 9, 8, '#79c98a', 'center', true);
    }
    txt('★' + ratScore(r), cx + 8, cy + chh - 6, Math.max(8, Math.round(W * 0.022)),
        '#ffd166', 'left', true);
    txt('技' + ((r.skills || []).length), cx + cw - 8, cy + chh - 6,
        Math.max(8, Math.round(W * 0.022)), '#8fb8ff', 'right');
    txt((LINE_NAME[r.line] || '白板'), cx + 8, cy + 20, Math.max(10, Math.round(W * 0.028)), C.ink, 'left', true);
    var tal = (r.talents || []).map(function(t){ return (TALENT_DEF[t.id] ? TALENT_DEF[t.id].name : t.id).slice(0,2) + t.lv; }).join(' ');
    txt(tal || '无天赋', cx + 8, cy + 38, Math.max(8, Math.round(W * 0.023)), '#ffd98a', 'left');
    txt('T' + (r.tier || 1), cx + 8, cy + 54, 8, C.muted, 'left');
    (function(idx){
      shopHit(cx, cy, cw, chh, function(){
        if (FUSE.main === idx) { FUSE.main = -1; }
        else if (FUSE.sub === idx) { FUSE.sub = -1; }
        else if (FUSE.main < 0) { FUSE.main = idx; }
        else if (FUSE.sub < 0) { FUSE.sub = idx; }
        else { FUSE.main = idx; FUSE.sub = -1; }
        FUSE.result = null;
        sfx('tap');
      });
    })(i);
  }

  /* 预览 */
  var pv = (FUSE.main >= 0 && FUSE.sub >= 0) ? fusePreview(FUSE.main, FUSE.sub) : null;
  var py = top + 160;
  rr(pad, py, W - pad * 2, pv ? 340 : 150, 12);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.strokeStyle = 'rgba(232,172,80,.3)'; ctx.lineWidth = 1; ctx.stroke();
  txt('合成预览', pad + 12, py + 20, Math.max(10, Math.round(W * 0.03)), C.amber, 'left', true);
  /* 槽位视觉：主鼠 + 副鼠 → 结果 */
  var slotY = py + 34, slotS = 56;
  var cx1 = pad + 52, cx2 = cx1 + 96, cx3 = cx2 + 96;
  var mainRat2 = FUSE.main >= 0 ? SHOP.rats[FUSE.main] : null;
  var subRat2 = FUSE.sub >= 0 ? SHOP.rats[FUSE.sub] : null;

  function slot(cx, rat, label, col){
    rr(cx - slotS / 2 - 6, slotY, slotS + 12, slotS + 24, 10);
    ctx.fillStyle = rat ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = rat ? col : 'rgba(255,255,255,.12)'; ctx.stroke();
    if (rat) drawRatAt(rat, cx, slotY + slotS / 2 + 2, slotS, 1);
    else txt('?', cx, slotY + slotS / 2 + 8, 22, 'rgba(255,255,255,.2)', 'center', true);
    txt(label, cx, slotY + slotS + 16, Math.max(8, Math.round(W * 0.023)),
        rat ? col : '#5b5374', 'center', true);
  }
  slot(cx1, mainRat2, '主鼠', C.amber);
  slot(cx2, subRat2, '副鼠', '#9fc6ff');
  slot(cx3, pv ? { line: mainRat2 ? mainRat2.line : 'none', tier: mainRat2 ? mainRat2.tier : 1, talents: [] } : null, '结果', '#79c98a');
  txt('+', (cx1 + cx2) / 2, slotY + 34, 18, C.muted, 'center');
  txt('→', (cx2 + cx3) / 2, slotY + 34, 18, C.muted, 'center');

  if (!pv){
    txt('先选主鼠，再选副鼠（主鼠的槽1 天赋会固定保留）', pad + 12, slotY + slotS + 44,
        Math.max(10, Math.round(W * 0.026)), C.muted, 'left');
  } else {
    txt('槽1 ' + (TALENT_DEF[pv.slot1.id] ? TALENT_DEF[pv.slot1.id].name : pv.slot1.id) +
        ' → 100% 保留', pad + 12, py + 132, Math.max(9, Math.round(W * 0.026)), '#ffd98a', 'left');
    for (var e = 0; e < pv.extras.length && e < 4; e++){
      var ex = pv.extras[e];
      txt((ex.who === '主' ? '主' : '副') + ' · ' +
          (TALENT_DEF[ex.id] ? TALENT_DEF[ex.id].name : ex.id) + ' ' + ex.lv + '级' +
          ' → ' + Math.round(ex.chance * 100) + '% 保留',
          pad + 12, py + 148 + e * 16, Math.max(9, Math.round(W * 0.023)), C.muted, 'left');
    }
    /* 双方属性 + 技能（压成两行，避免和下面挤） */
    var aSt = ratStats(pv.main), bSt = ratStats(pv.sub);
    txt('主 ' + aSt.name + ' ' + aSt.hp + '/' + aSt.baseDmg +
        '　副 ' + bSt.name + ' ' + bSt.hp + '/' + bSt.baseDmg,
        pad + 12, py + 198, Math.max(9, Math.round(W * 0.023)), '#8f86a6', 'left');
    var romanS = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
    function skLine(list){
      var arr = list || [];
      var out2 = arr.slice(0, 2).map(function(t){
        return skillName(t.id) + (romanS[(t.lv || 1) - 1] || '');
      }).join(' ');
      if (arr.length > 2) out2 += ' +' + (arr.length - 2);
      return out2 || '无';
    }
    txt('主技 ' + skLine(pv.skillsMain), pad + 12, py + 216,
        Math.max(9, Math.round(W * 0.022)), '#ffb37a', 'left');
    txt('副技 ' + skLine(pv.skillsSub), pad + 12, py + 232,
        Math.max(9, Math.round(W * 0.022)), '#8fb8ff', 'left');

    txt('新鼠随主鼠职业/阶，技能与天赋按概率继承',
        pad + 12, py + 250, Math.max(9, Math.round(W * 0.021)), '#6a6480', 'left');
    txt('消耗 ' + pv.cost + ' 金币 · 副鼠消失 · 没继承额外天赋返 ' + pv.refund + ' 碎片',
        pad + 12, py + 266, Math.max(9, Math.round(W * 0.021)), '#8f86a6', 'left');
    var ok = SHOP.coins >= pv.cost;
    var bw2 = W - pad * 2 - 24, bh2 = 40, bx2 = pad + 12, by2 = py + 282;
    rr(bx2, by2, bw2, bh2, 20);
    ctx.fillStyle = ok ? C.amber : '#241d2e'; ctx.fill();
    txt('炼妖（' + pv.cost + ' 金币）', bx2 + bw2 / 2, by2 + 26,
        Math.max(11, Math.round(W * 0.034)), ok ? '#241d2e' : '#5b5374', 'center', true);
    shopHit(bx2, by2, bw2, bh2, function(){
      /* 二次确认：把"可能被吃"的概率写清楚再让玩家点 */
      FUSE.confirm = { main: FUSE.main, sub: FUSE.sub, t0: performance.now() };
      sfx('tap');
    });
  }

  if (FUSE.confirm){ drawFuseConfirm(); return; }

  /* 撞合动画：0–520ms 相向冲撞 → 520–700ms 白光 → 700–1400ms 新鼠亮相 */
  if (FUSE.anim && performance.now() - FUSE.anim.t0 < 1500){
    drawFuseAnim();
    return;
  }

  /* 规则卡 */
  var rlY = py + (pv ? 350 : 162);
  rr(pad, rlY, W - pad * 2, 96, 12);
  ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.stroke();
  txt('炼妖规则', pad + 12, rlY + 20, Math.max(10, Math.round(W * 0.028)), C.amber, 'left', true);
  var rl = [
    '主鼠槽1 天赋 100% 保留（等级取两者较高）',
    '主鼠其它天赋各 55% 保留，副鼠所有天赋各 45% 保留',
    '最多 3 槽 · 一条额外天赋都没继承则返 3 碎片'
  ];
  for (var ri = 0; ri < rl.length; ri++){
    txt('· ' + rl[ri], pad + 12, rlY + 40 + ri * 17,
        Math.max(8, Math.round(W * 0.0225)), '#8f86a6', 'left');
  }

  /* 结果 */
  if (FUSE.result && performance.now() - FUSE.t0 < 6000){
    var ry = H - 130;
    rr(pad, ry, W - pad * 2, 108, 12);
    ctx.fillStyle = 'rgba(232,172,80,.12)'; ctx.fill();
    ctx.strokeStyle = C.amber; ctx.lineWidth = 2; ctx.stroke();
    txt('炼妖结果', pad + 12, ry + 22, Math.max(10, Math.round(W * 0.03)), C.amber, 'left', true);
    var kt = FUSE.result.kept.map(function(t){
      return (TALENT_DEF[t.id] ? TALENT_DEF[t.id].name : t.id) + t.lv;
    }).join(' · ');
    txt(kt, pad + 12, ry + 46, Math.max(10, Math.round(W * 0.028)), '#ffd98a', 'left', true);
    txt(FUSE.result.gotExtra ? ('继承了 ' + FUSE.result.gotExtra + ' 条（技能+天赋）')
        : ('什么都没继承，返还 ' + FUSE.result.refunded + ' 碎片'),
        pad + 12, ry + 68, Math.max(9, Math.round(W * 0.024)), C.muted, 'left');
    var lostTxt = [];
    (FUSE.result.lostSkills || []).forEach(function(t){ lostTxt.push('技能 ' + skillName(t.id)); });
    (FUSE.result.lostTalents || []).forEach(function(t){ lostTxt.push('天赋 ' + (TALENT_DEF[t.id] ? TALENT_DEF[t.id].name : t.id)); });
    if (lostTxt.length){
      txt('失去：' + lostTxt.join(' / '), pad + 12, ry + 86,
          Math.max(8, Math.round(W * 0.023)), '#d96d55', 'left');
    }
  }
}

function drawShop(){
  HITS = [];
  var pad = L.pad;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  /* 顶栏 */
  var hY = Math.round(H * 0.072);
  txt('第 ' + SHOP.level + ' 关 补给站', pad, hY, Math.round(W * 0.043), C.ink, 'left', true);
  txt('金币 ' + SHOP.coins, W - pad, hY, Math.round(W * 0.04), C.amber, 'right', true);
  /* 第二行：左边小字信息，右边三枚入口（图鉴 / 抽奖 / 炼妖） */
  if (window.BUILD_TAG){
    txt(window.BUILD_TAG, pad, hY + 34, Math.max(8, Math.round(W * 0.021)), '#6a6480', 'left');
  }
  txt('碎片 ' + (SHOP.shard | 0) + ' · 最高第 ' + SHOP.best + ' 关', pad, hY + 20,
      Math.max(9, Math.round(W * 0.026)), '#c7b6ff', 'left', true);

  /* 图鉴入口：五职业 × 四阶，看看每条线升到四级长什么样、拿什么武器 */
  var cbw = 50, cbh = 22;
  var cbx = W - pad - cbw, cby = hY + 8;
  rr(cbx, cby, cbw, cbh, 12);
  ctx.fillStyle = C.panel2; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232,172,80,.45)'; ctx.stroke();
  txt('图鉴', cbx + cbw / 2, cby + 15, Math.max(9, Math.round(W * 0.026)), C.amber, 'center', true);
  shopHit(cbx, cby, cbw, cbh, function(){ SHOP.codex = true; sfx('tap'); });

  /* 抽奖 / 炼妖 两个独立页面入口 */
  var ebw = 50, ebh = 22;
  var e1x = cbx - ebw - 6, e2x = e1x - ebw - 6, e3x = e2x - ebw - 6;
  function entryBtn(ex, label, onTap, hot){
    rr(ex, cby, ebw, ebh, 12);
    ctx.fillStyle = hot ? 'rgba(199,182,255,.22)' : C.panel2; ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = hot ? 'rgba(199,182,255,.85)' : 'rgba(199,182,255,.5)';
    ctx.stroke();
    txt(label, ex + ebw / 2, cby + 15, Math.max(9, Math.round(W * 0.026)),
        hot ? '#e4dcff' : '#c7b6ff', 'center', true);
    shopHit(ex, cby, ebw, ebh, onTap);
  }
  entryBtn(e1x, '炼妖', function(){ SHOP.page = 'fuse'; FUSE.result = null; FUSE.main = -1; FUSE.sub = -1; sfx('tap'); });
  entryBtn(e2x, '抽奖', function(){ SHOP.page = 'gacha'; sfx('tap'); });
  /* 仓鼠盒：盒里有东西就高亮，数字直接写在按钮上 */
  var boxN = boxList().length;
  entryBtn(e3x, boxN ? ('盒' + boxN) : '仓鼠盒', function(){ SHOP.page = 'box'; sfx('tap'); }, boxN > 0);
  var gearN = gearCountAll();
  entryBtn(e3x - ebw - 6, gearN ? ('证' + gearN) : '证', function(){
    sfx('tap');
    /* 没有专门的背包页：跳到选中鼠的详情页，那里能用证 */
    if (SHOP.rats.length){ SHOP.detail = SHOP.sel >= 0 ? SHOP.sel : 0; SHOP.page = 'rat'; }
  }, gearN > 0);

  /* 货架：三个固定类目，各占一格 */
  var cardX = pad, cardW = W - pad * 2, cardH = Math.round(H * 0.083), gap = Math.round(H * 0.012);
  var y = Math.round(H * 0.116);
  for (var i = 0; i < SHOP.offers.length; i++){
    var sec = SHOP_SECTIONS[i] || { label: '' };
    txt(sec.label, pad, y + i * (cardH + gap + 15) - 5,
        Math.max(10, Math.round(W * 0.029)), '#8f86a6', 'left', true);
    drawOfferCard(cardX, y + i * (cardH + gap + 15), cardW, cardH, SHOP.offers[i], i);
  }

  /* 我的仓鼠：3 列 × 2 行，最多 6 只全看得到（原来只画 4 只，第 5 只永远点不到） */
  var ratsY = y + 3 * (cardH + gap + 15) + Math.round(H * 0.012);
  var onCount = squadOnCount();
  txt('我的仓鼠 ' + SHOP.rats.length + '/' + rosterCap() + ' · 上场 ' + onCount + '/' + fieldCap(),
      pad, ratsY - 6, Math.max(9, Math.round(W * 0.025)), C.muted, 'left');
  /* 每页 6 只（3×2）；超过 6 只时用 ‹ › 翻页，保证每只都点得到 */
  var COLS = 3, PER_PAGE = 6;
  var gx = 6;
  var slotW = Math.round((cardW - gx * (COLS - 1)) / COLS);
  var slotH = Math.round(H * 0.098);
  var gy = 6;
  var pageCount = Math.max(1, Math.ceil(SHOP.rats.length / PER_PAGE));
  SHOP.ratPage = Math.min(Math.max(0, SHOP.ratPage | 0), pageCount - 1);
  var pageStart = SHOP.ratPage * PER_PAGE;
  for (var s = pageStart; s < SHOP.rats.length && s < pageStart + PER_PAGE; s++){
    var vi = s - pageStart;
    var col = vi % COLS, row = Math.floor(vi / COLS);
    drawRatCard(cardX + col * (slotW + gx), ratsY + row * (slotH + gy), slotW, slotH, s);
  }
  /* 翻页按钮 */
  if (pageCount > 1){
    var pbw = 30, pbh = 20;
    var py2 = ratsY - 24;
    function pageBtn(bx, label, dir, enabled){
      rr(bx, py2, pbw, pbh, 10);
      ctx.fillStyle = enabled ? C.panel2 : '#241d2e'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = enabled ? C.line : '#332b45'; ctx.stroke();
      txt(label, bx + pbw / 2, py2 + 14, 11, enabled ? C.ink : '#5b5374', 'center', true);
      shopHit(bx, py2, pbw, pbh, function(){
        if (!enabled) { sfx('invalid'); return; }
        SHOP.ratPage = Math.min(pageCount - 1, Math.max(0, (SHOP.ratPage | 0) + dir));
        sfx('tap');
      });
    }
    pageBtn(cardX + cardW - pbw * 2 - 4, '›', 1, (SHOP.ratPage | 0) < pageCount - 1);
    pageBtn(cardX + cardW - pbw * 2 - 4 - pbw - 4, '‹', -1, (SHOP.ratPage | 0) > 0);
    txt((SHOP.ratPage + 1) + '/' + pageCount, cardX + cardW - pbw * 2 - 4 - pbw - 4 - 26, py2 + 14,
        9, C.muted, 'right');
  }
  /* 本页实际占的行数；未满页时补一个"招募"空位 */
  var shown = Math.min(SHOP.rats.length - pageStart, PER_PAGE);
  var rows = Math.max(1, Math.ceil(Math.max(1, shown) / COLS));
  var canRecruit = SHOP.rats.length < rosterCap() && shown < PER_PAGE;
  if (canRecruit){
    var eCol = shown % COLS, eRow = Math.floor(shown / COLS);
    var ex = cardX + eCol * (slotW + gx), ey = ratsY + eRow * (slotH + gy);
    rr(ex, ey, slotW, slotH, 10);
    ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(90,80,110,.5)'; ctx.stroke();
    txt('招募', ex + slotW / 2, ey + slotH / 2 + 4, Math.max(9, Math.round(W * 0.028)), '#5b5374', 'center');
  }

  /* 选中鼠的数值面板：把"买完到底强了多少"摊开给玩家看 */
  drawRatStats(cardX, ratsY + rows * (slotH + 8) + 10, cardW);

  /* 底部按钮 */
  var btnH = Math.round(Math.min(46, H * 0.055));
  var by = H - btnH - Math.round(H * 0.045);
  var b1w = Math.round(cardW * 0.30), b3w = Math.round(cardW * 0.34);
  var b2w = cardW - b1w - b3w - 20;
  var bx1 = cardX, bx2 = bx1 + b1w + 10, bx3 = bx2 + b2w + 10;

  rr(bx1, by, b1w, btnH, btnH / 2);
  ctx.fillStyle = SHOP.coins >= 8 && SHOP.refreshLeft > 0 ? C.panel2 : '#241d2e';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = SHOP.coins >= 8 && SHOP.refreshLeft > 0 ? C.line : '#332b45';
  ctx.stroke();
  txt('刷新 8 · 剩' + SHOP.refreshLeft, bx1 + b1w / 2, by + btnH * 0.64,
      Math.max(10, Math.round(W * 0.032)), SHOP.refreshLeft > 0 ? C.muted : '#5b5374', 'center', true);
  shopHit(bx1, by, b1w, btnH, function(){
    if (SHOP.refreshLeft <= 0 || SHOP.coins < 8) return;
    SHOP.coins -= 8; SHOP.refreshLeft--; rollOffers(); shopSave(); sfx('tap');
  });

  /* 摇奖机 */
  var canSlot = SHOP.coins >= SLOT.price;
  if (SLOT.rolling && performance.now() - SLOT.t0 > 820) slotResolve();
  rr(bx2, by, b2w, btnH, btnH / 2);
  ctx.fillStyle = canSlot || SLOT.rolling ? 'rgba(232,172,80,.18)' : '#241d2e';
  ctx.fill();
  ctx.lineWidth = SLOT.rolling ? 2 : 1;
  ctx.strokeStyle = SLOT.rolling ? C.amber : (canSlot ? 'rgba(232,172,80,.6)' : '#332b45');
  ctx.stroke();
  var slotLabel = SLOT.rolling
    ? '…摇…'
    : ('摇一次 ' + SLOT.price + '💰');
  txt(slotLabel, bx2 + b2w / 2, by + btnH * 0.64,
      Math.max(10, Math.round(W * 0.031)), canSlot || SLOT.rolling ? C.amber : '#5b5374', 'center', true);
  shopHit(bx2, by, b2w, btnH, function(){ slotRoll(); });

  /* 出货率 + 上次结果（明示概率，五连保底） */
  var oddsY = by - 10;
  var lastTxt = SLOT.last ? ('上次：' + SLOT.last + ' ｜ ') : '';
  txt(lastTxt + SLOT_ODDS, pad, oddsY, Math.max(8, Math.round(W * 0.023)), '#8f86a6', 'left');

  /* 下一关 */
  rr(bx3, by, b3w, btnH, btnH / 2);
  ctx.fillStyle = SHOP.advance === false ? C.panel2 : C.amber;
  ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.amber; ctx.stroke();
  txt(SHOP.advance === false ? '重打 ▶' : '下一关 ▶', bx3 + b3w / 2, by + btnH * 0.64,
      Math.round(W * 0.038), SHOP.advance === false ? C.amber : '#241d2e', 'center', true);
  shopHit(bx3, by, b3w, btnH, function(){ sfx('pick'); startNextLevel(); });
}

/* 碎片兑换条：贴在摇奖机上面一行，两个按钮（道具池 / 仓鼠池） */
function drawShardStrip(x, y, w){
  var cfg = (RULES && RULES.gacha) || {};
  var itemCost = (cfg.item && cfg.item.shardCost) || 5;
  var ratCost = (cfg.rat && cfg.rat.shardCost) || 12;
  var bw = Math.round((w - 8) / 2), bh = 26;
  var fs = Math.max(9, Math.round(W * 0.026));

  function btn(bx, label, cost, enabled, onTap){
    rr(bx, y, bw, bh, 13);
    ctx.fillStyle = enabled ? 'rgba(199,182,255,.16)' : '#241d2e';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = enabled ? 'rgba(199,182,255,.7)' : '#332b45';
    ctx.stroke();
    txt(label + ' ' + cost + '碎', bx + bw / 2, y + 17, fs, enabled ? '#c7b6ff' : '#5b5374', 'center', true);
    shopHit(bx, y, bw, bh, onTap);
  }

  var canItem = (SHOP.shard | 0) >= itemCost;
  btn(x, '道具抽', itemCost, canItem, function(){
    if ((SHOP.shard | 0) < itemCost) { sfx('invalid'); return; }
    addShard(-itemCost);
    slotRoll();
  });

  var canRat = (SHOP.shard | 0) >= ratCost && (typeof ratGachaRoll === 'function');
  btn(x + bw + 8, '仓鼠抽', ratCost, canRat, function(){
    if (typeof ratGachaRoll !== 'function') return;
    if ((SHOP.shard | 0) < ratCost) { sfx('invalid'); return; }
    addShard(-ratCost);
    ratGachaRoll();
  });
}

function drawOfferCard(x, y, w, h, o, idx){
  var affordable = SHOP.coins >= o.price && !o.sold;
  /* 推荐角标：这张证正好是"选中鼠的下一阶同线"就标出来，省得玩家对着图鉴找 */
  var rec = false;
  if (o.kind === 'gear' && !o.sold){
    var selRat = SHOP.rats[SHOP.sel];
    if (selRat){
      var curT = selRat.tier || 1;
      if (o.tier === curT + 1 && (curT === 1 || selRat.line === o.line)) rec = true;
    }
  }
  rr(x, y, w, h, 10);
  ctx.fillStyle = o.sold ? 'rgba(255,255,255,.02)' : C.panel;
  ctx.fill();
  ctx.lineWidth = rec ? 2 : 1;
  ctx.strokeStyle = o.sold ? '#332b45'
    : (rec ? 'rgba(232,172,80,.9)' : (affordable ? 'rgba(232,172,80,.5)' : C.line));
  ctx.stroke();
  if (rec){
    var bw2 = 40, bh2 = 16, bx2 = x + w - bw2 - 8, by2 = y + 6;
    rr(bx2, by2, bw2, bh2, 8);
    ctx.fillStyle = 'rgba(232,172,80,.9)'; ctx.fill();
    txt('推荐', bx2 + bw2 / 2, by2 + 12, 9, '#241d2e', 'center', true);
  }

  /* 图标：转职证用线徽章、配件用物件图标（没有就用文字顶上） */
  var icId = (o.kind === 'gear') ? ('gear-' + o.line)
           : (o.kind === 'shard' ? 'buff-parts' : (o.kind === 'mod' ? ('mod-' + o.mod) : null));
  var ic = (typeof iconImg === 'function') ? iconImg(icId) : null;
  var textX = x + 12;
  if (ic){
    var isz = Math.min(34, Math.round(h * 0.62));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = o.sold ? 0.35 : 1;
    ctx.drawImage(ic, x + 10, y + (h - isz) / 2, isz, isz);
    ctx.restore();
    textX = x + 10 + isz + 8;
  }

  var nameSize = Math.max(11, Math.round(W * 0.036));
  txt(offerTitle(o), textX, y + Math.round(h * 0.34), nameSize, o.sold ? '#5b5374' : C.ink, 'left', true);
  txt(offerDesc(o), textX, y + Math.round(h * 0.64), Math.max(9, Math.round(W * 0.027)),
      o.sold ? '#4a4160' : C.muted, 'left');

  var price = o.sold ? '已买' : ('💰 ' + o.price);
  txt(price, x + w - 12, y + Math.round(h * 0.5), Math.max(11, Math.round(W * 0.034)),
      o.sold ? '#5b5374' : (affordable ? C.amber : C.bad), 'right', true);

  if (!o.sold){
    shopHit(x, y, w, h, function(){ buyOffer(idx); });
  }
}

/* 选中鼠的数值面板（改动前/后的实际效果都在这） */
function drawRatStats(x, y, w){
  var ratIconOwner = SHOP.rats[SHOP.sel];
  if (ratIconOwner && ratIconOwner.line && ratIconOwner.line !== 'none'){
    drawClassIcon(ratIconOwner.line, x + 14, y + 20, 32);
  }
  var rat = SHOP.rats[SHOP.sel];
  if (!rat) return;
  var u = makeUnit(ratId(rat), 0);
  applyMod(u, rat.mod);
  var h = 92;
  rr(x, y, w, h, 10);
  ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.stroke();

  var fs = Math.max(9, Math.round(W * 0.027));
  txt('选中：' + u.name + '（' + ratLineLabel(rat) + '）', x + 12, y + 20,
      Math.max(10, Math.round(W * 0.031)), C.ink, 'left', true);

  var c1 = u.eats === 'parts' ? '零件' : (u.eats === 'energy' ? '能量' : null);
  var left = [
    ['出手间隔', u.atkMs ? (u.atkMs / 1000).toFixed(1) + ' s' : '不攻击'],
    ['基础伤害', u.atkMs ? String(u.baseDmg) : '—'],
    ['强化伤害', u.act ? String(u.act.dmg) + (u.act.kind === 'heal' ? '（修复）' : '') : '—']
  ];
  var right = [
    ['强化阈值', c1 ? (u.need + ' ' + c1) : '不吃资源'],
    ['生命', String(u.hpMax)],
    ['天赋', (function(){
      var ts = rat.talents || [];
      if (!ts.length) return '无';
      var roman = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
      return ts.map(function(t){ return (TALENT_DEF[t.id] ? TALENT_DEF[t.id].name : t.id) + roman[(t.lv || 1) - 1]; }).join(' ');
    })()]
  ];
  /* 详情入口：打开梦幻西游式的数据面板 */
  var dtbw = 52, dtbh = 20, dtbx = x + w - dtbw - 10, dtby = y + 8;
  rr(dtbx, dtby, dtbw, dtbh, 10);
  ctx.fillStyle = 'rgba(199,182,255,.16)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(199,182,255,.6)'; ctx.stroke();
  txt('详情', dtbx + dtbw / 2, dtby + 14, Math.max(8, Math.round(W * 0.024)), '#c7b6ff', 'center', true);
  shopHit(dtbx, dtby, dtbw, dtbh, function(){
    SHOP.detail = SHOP.sel;
    clearFresh(SHOP.sel);
    SHOP.page = 'rat';
    sfx('tap');
  });

  /* 分解按钮：选中鼠且不在场上时可用（点两次确认） */
  var dShard = (typeof shardValueOf === 'function') ? shardValueOf(rat) : 0;
  var onField = SHOP.squad.indexOf(SHOP.sel) >= 0;
  var dbw = 62, dbh = 20, dbx = x + w - dbw - 68, dby = y + 8;
  var armed = SHOP.decompArm === (rat.line + rat.tier + SHOP.sel);
  var canDec = !onField && SHOP.rats.length > 1;
  rr(dbx, dby, dbw, dbh, 11);
  ctx.fillStyle = canDec ? (armed ? 'rgba(217,109,85,.35)' : 'rgba(217,109,85,.14)') : '#241d2e';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = canDec ? 'rgba(217,109,85,.8)' : '#332b45';
  ctx.stroke();
  txt(armed ? '确认分解' : ('分 ' + dShard + '碎'), dbx + dbw / 2, dby + 15,
      Math.max(8, Math.round(W * 0.024)), canDec ? '#ff9d8a' : '#5b5374', 'center', true);
  shopHit(dbx, dby, dbw, dbh, function(){
    if (!canDec){ sfx('invalid'); return; }
    var key = rat.line + rat.tier + SHOP.sel;
    if (SHOP.decompArm !== key){
      SHOP.decompArm = key;
      sfx('tap');
      return;
    }
    SHOP.decompArm = '';
    var gain = decompRat(SHOP.sel);
    if (gain > 0) floatText('碎片 +' + gain, W / 2, Math.round(H * 0.42), '#c7b6ff', true);
  });

  var colW = Math.round((w - 34) / 2);
  for (var i = 0; i < left.length; i++){
    var ly = y + 42 + i * 17;
    txt(left[i][0], x + 12, ly, fs, C.muted, 'left');
    txt(left[i][1], x + 12 + colW - 10, ly, fs, C.ink, 'right', true);
    txt(right[i][0], x + 22 + colW, ly, fs, C.muted, 'left');
    txt(right[i][1], x + w - 12, ly, fs, C.ink, 'right', true);
  }
}

/* 仓鼠"价值"速览：天赋等级和 + 技能等级和，右上角显示成 ★N */
function ratScore(rat){
  if (!rat) return 0;
  var n = 0;
  var ts = rat.talents || [];
  for (var i = 0; i < ts.length; i++) n += (ts[i].lv || 1);
  var sk = rat.skills || [];
  for (var j = 0; j < sk.length; j++) n += (sk[j].lv || 1);
  return n;
}
/* 技能类型色点（物理橙 / 魔法蓝 / 增益绿），最多画 4 个 */
function drawSkillDots(rat, x, y){
  var sk = rat && rat.skills ? rat.skills : [];
  if (!sk.length) return;
  var defs = skillDefs();
  for (var i = 0; i < sk.length && i < 4; i++){
    var d = defs[sk[i].id] || {};
    var col = d.kind === 'mag' ? '#8fb8ff' : (d.kind === 'buff' ? '#79c98a' : '#ffb37a');
    ctx.fillStyle = col;
    ctx.fillRect(x + i * 6, y, 4, 4);
  }
}

function drawRatCard(x, y, w, h, idx){
  var rat = SHOP.rats[idx];
  if (!rat) return;
  var onSquad = SHOP.squad.indexOf(idx) >= 0;
  var selected = SHOP.sel === idx;
  rr(x, y, w, h, 10);
  ctx.fillStyle = selected ? 'rgba(232,172,80,.12)' : C.panel;
  ctx.fill();
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeStyle = selected ? C.amber : (onSquad ? 'rgba(121,201,138,.55)' : C.line);
  ctx.stroke();

  var artS = Math.round(Math.min(h * 0.62, w * 0.34));
  var id = ratId(rat);
  var artKey = (rat.line || 'none') + '-' + (rat.tier || 1);
  var artImg = (typeof iconImg === 'function') ? artFromMap(unitArtMap(), [artKey]) : null;
  if (artImg){
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    var a2 = Math.round(Math.min(artS, h - 12));
    ctx.drawImage(artImg, Math.round(x + 8), Math.round(y + (h - a2) / 2), a2, a2);
    ctx.restore();
  } else {
    drawHamsterArt(x + 8, y + Math.round((h - artS) / 2), artS, { line: rat.line, name: ratLabel(rat) });
  }

  var tx = x + artS + 12;
  var nameFs = Math.max(10, Math.round(W * 0.031));
  var subFs = Math.max(8, Math.round(W * 0.023));
  /* 卡片只有 ~110px 宽：名字最多 4 个字，天赋只显示第一条 + "+n" */
  var name = ratLabel(rat);
  if (name.length > 4) name = name.slice(0, 4);
  txt(name, tx, y + Math.round(h * 0.30), nameFs, C.ink, 'left', true);
  txt(ratLineLabel(rat), tx, y + Math.round(h * 0.52), subFs, C.muted, 'left');

  var ts = rat.talents || [];
  var roman = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
  var talText;
  if (!ts.length) talText = '未觉醒';
  else {
    var t0 = ts[0];
    talText = (TALENT_DEF[t0.id] ? TALENT_DEF[t0.id].name : t0.id).slice(0, 2) + roman[(t0.lv || 1) - 1];
    if (ts.length > 1) talText += '+' + (ts.length - 1);
  }
  txt(talText, tx, y + Math.round(h * 0.74), subFs + 1, '#ffd98a', 'left', true);

  /* 价值速览：右上角 ★评分 + 技能类型色点 */
  var score = ratScore(rat);
  txt('★' + score, x + w - 8, y + h - 8, Math.max(9, Math.round(W * 0.024)),
      score >= 8 ? '#ffd166' : (score >= 5 ? '#e8ac50' : '#8f86a6'), 'right', true);
  drawSkillDots(rat, x + 8, y + h - 11);

  /* NEW 角标：刚抽到、还没看过 */
  if (isFresh(idx)){
    var nw = 26, nh = 12, nx = x + 6, ny = y + 6;
    rr(nx, ny, nw, nh, 6);
    ctx.fillStyle = 'rgba(255,209,102,.9)'; ctx.fill();
    txt('NEW', nx + nw / 2, ny + 9, 8, '#241d2e', 'center', true);
  }

  /* 状态改成右上角小徽章，避免和名字撞 */
  if (onSquad){
    var bw = 16, bh = 12;
    var bxx = x + w - bw - 6, byy = y + 6;
    rr(bxx, byy, bw, bh, 6);
    ctx.fillStyle = 'rgba(121,201,138,.22)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(121,201,138,.8)'; ctx.stroke();
    txt('上', bxx + bw / 2, byy + 9, 8, '#79c98a', 'center', true);
  }

  shopHit(x, y, w, h, function(){
    /* 双击（350ms 内点同一张）→ 直接进详情；单击仍是"选中 / 上下场" */
    var tapNow = performance.now();
    if (SHOP.lastTapIdx === idx && tapNow - (SHOP.lastTapAt || 0) < 350){
      SHOP.lastTapIdx = -1; SHOP.lastTapAt = 0;
      SHOP.detail = idx; SHOP.detailScroll = 0; clearFresh(idx);
      SHOP.page = 'rat'; sfx('tap');
      return;
    }
    SHOP.lastTapIdx = idx; SHOP.lastTapAt = tapNow;

    // 第一次点 = 选中（只选人，不动编队）；再点已选中的那只 = 上下场
    if (SHOP.sel !== idx){
      SHOP.sel = idx;
      sfx('tap');
      shopSave();
      return;
    }
    var at = squadIndexOf(idx);
    if (at >= 0){
      if (squadOnCount() > 1){ SHOP.squad[at] = -1; sfx('tap'); }
      else sfx('invalid');                       // 至少留一只，不然开局直接判负
    } else if (squadOnCount() >= squadSlots()){
      sfx('invalid');                            // 5 个位满了
    } else if (squadLineCount(rat.line || 'none') >= maxSameLine(rat.line || 'none')){
      sfx('invalid');                            // 同一条线超过上限
    } else {
      var slot = squadFirstEmpty();
      SHOP.squad[slot >= 0 ? slot : squadSlots() - 1] = idx;
      sfx('tap');
    }
    shopSave();
  });
}

/* ---------- 9. 购买 ---------- */
/* 统一的金币入口（摇奖 / 押注 / 关卡结算都走这里，保证会落盘） */
function addCoins(n){
  SHOP.coins = Math.max(0, Math.round(SHOP.coins + n));
  shopSave();
  return SHOP.coins;
}

/* ---------- 天赋（P0）：每只鼠的槽1 跟着职业线走 ----------
   白板鼠（line === 'none'）没有天赋，转职定线之后补上槽1。 */
function talentSlot1(line){
  return (line && line !== 'none') ? [{ id: line, lv: 1 }] : [];
}
function ensureTalentSlot1(rat){
  if (!rat) return;
  rat.talents = rat.talents || [];
  if (rat.line && rat.line !== 'none' && !rat.talents.length) rat.talents.push({ id: rat.line, lv: 1 });
  /* 槽1 必须等于当前职业线 */
  if (rat.line && rat.line !== 'none'){
    if (!rat.talents[0] || rat.talents[0].id !== rat.line) rat.talents.unshift({ id: rat.line, lv: 1 });
    rat.talents = rat.talents.slice(0, 3);
  }
}

/* ---------- 转职证背包：抽到的证先存起来，由玩家决定给谁用 ---------- */
function gearList(){
  if (!SHOP.gears || typeof SHOP.gears !== 'object') SHOP.gears = {};
  return SHOP.gears;
}
function gearAdd(line, tier, n){
  var g = gearList();
  var key = line + '-' + tier;
  g[key] = (g[key] | 0) + (n || 1);
  shopSave();
  return key;
}
function gearCountAll(){
  var g = gearList(), n = 0;
  for (var k in g) n += g[k] | 0;
  return n;
}
/* 某只鼠现在能吃哪些证：白板吃任意线的二级证；已定线只吃同线下一阶 */
function gearOptionsFor(rat){
  var g = gearList();
  var out = [];
  if (!rat) return out;
  var tier = rat.tier || 1;
  var line = rat.line || 'none';
  for (var k in g){
    if (!(g[k] > 0)) continue;
    var parts = k.split('-');
    var gl = parts[0], gt = parseInt(parts[1], 10);
    if (!(gt > 0)) continue;
    var ok = (line === 'none' && tier === 1)
      ? (gt === 2)                       /* 白板：任意线的二级证 */
      : (gl === line && gt === tier + 1); /* 已定线：同线下一阶 */
    if (ok) out.push({ key: k, line: gl, tier: gt, count: g[k] | 0 });
  }
  return out;
}
/* 转职/升阶：拿到职业天赋，同时按概率吃掉一个已携带技能 */
function promoteRat(rat){
  if (!rat) return null;
  var chance = (RULES.promote && typeof RULES.promote.eatSkillChance === 'number')
    ? RULES.promote.eatSkillChance : 0.30;
  var sk = rat.skills || [];
  if (!sk.length) return null;
  if (Math.random() >= chance) return null;
  var k = Math.floor(Math.random() * sk.length);
  var lost = sk.splice(k, 1)[0];
  return lost;
}

/* 用一张证把这只鼠转职/升阶 */
function gearUse(ratIdx, key){
  var rat = SHOP.rats[ratIdx];
  var g = gearList();
  if (!rat || !(g[key] > 0)) return false;
  var parts = key.split('-');
  var gl = parts[0], gt = parseInt(parts[1], 10);
  var tier = rat.tier || 1;
  if (gt !== tier + 1) return false;
  if (rat.line && rat.line !== 'none' && rat.line !== gl) return false;
  rat.line = gl;
  rat.tier = gt;
  ensureTalentSlot1(rat);
  var lostSk = promoteRat(rat);
  if (lostSk && typeof floatText === 'function'){
    floatText('失去 ' + skillName(lostSk.id), W / 2, Math.round(H * 0.30), '#d96d55', true);
  }
  g[key] = (g[key] | 0) - 1;
  if (!g[key]) delete g[key];
  rebuildUnitsIfShop();
  shopSave();
  sfx('pick');
  return true;
}

function buyOffer(idx){
  var o = SHOP.offers[idx];
  if (!o || o.sold) return;
  if (SHOP.coins < o.price){ sfx('invalid'); return; }
  var rat = SHOP.rats[SHOP.sel];
  if (!rat){ sfx('invalid'); return; }

  if (o.kind === 'gear'){
    /* 只能一阶一阶转：白板 → 二级 → 三级 → 四级；白板可以转任意一条线 */
    var curTier = rat.tier || 1;
    if (o.tier !== curTier + 1){ sfx('invalid'); return; }
    if (curTier > 1 && rat.line !== o.line){ sfx('invalid'); return; }   /* 定了线就不能串线 */
    rat.line = o.line;
    rat.tier = o.tier;
    ensureTalentSlot1(rat);
    var lostSk2 = promoteRat(rat);
    if (lostSk2) pushLog('转职失去 ' + skillName(lostSk2.id));
  } else if (o.kind === 'shard'){
    addShard(o.amount || 2);
  } else {
    if (SHOP.rats.length >= 6){ sfx('invalid'); return; }
    SHOP.rats.push({ line: 'none', tier: 1, mod: '', talents: [] });
    // 买了白板鼠：编队有空位就直接补上，省得玩家以为没买到
    var newIdx = SHOP.rats.length - 1;
    if (squadOnCount() < squadSlots() && squadLineCount('none') < maxSameLine('none')){
      var slot = squadFirstEmpty();
      if (slot >= 0) SHOP.squad[slot] = newIdx;
    }
    SHOP.sel = newIdx;
  }
  SHOP.coins -= o.price;
  o.sold = true;
  rebuildUnitsIfShop();
  shopSave();
  sfx('pick');
}

/* ---------- 摇奖机：花 20 金币摇一次，出货率明示 + 五连保底 ----------
   45% 配件（随机给选中鼠）
   30% 金币 +30
   22% 转职证（选中鼠能升就升一阶，不能升折成 +40 金币）
    3% 大奖（+90 金币 + 随机配件）
   每第 5 次必出"转职证档"（能升就升，不能升给 +40 金币）。 */
var SLOT = { price: 20, rolling: false, t0: 0, count: 0, last: '', flash: 0 };
var SLOT_ODDS = '金币 40% · 碎片×1 30% · 转职证 25%（进背包） · 大奖 5% · 十连保底出证';

function slotReady(rat){
  if (!rat) return false;
  var t = rat.tier || 1;
  return t < 4;
}

function slotGiveMod(){
  var rat = SHOP.rats[SHOP.sel];
  var keys = Object.keys(MODS);
  if (!rat) return null;
  var mod = keys[Math.floor(Math.random() * keys.length)];
  rat.mod = mod;
  return MODS[mod].name;
}

function slotGiveGear(){
  /* 抽到的证不自动用掉：放进背包，由玩家在详情页决定给谁 */
  var lines = ['tank', 'blade', 'shot', 'hex', 'care'];
  /* 优先掉"当前队伍真的能吃到"的那一档：有白板就掉二级证，全定线就掉下一阶 */
  var wantTier = 2;
  var allMax = true;
  for (var i = 0; i < SHOP.rats.length; i++){
    var rt = SHOP.rats[i];
    if (!rt) continue;
    if ((rt.tier || 1) < 4) allMax = false;
  }
  var highest = 1;
  for (var j = 0; j < SHOP.rats.length; j++){
    var r2 = SHOP.rats[j];
    if (r2 && (r2.tier || 1) > highest) highest = r2.tier || 1;
  }
  wantTier = Math.min(4, highest + 1);
  if (wantTier < 2) wantTier = 2;
  var line = lines[Math.floor(Math.random() * lines.length)];
  gearAdd(line, wantTier, 1);
  return (LINE_NAME[line] || line) + (TIER_LABEL[wantTier] || '') + '证';
}



function slotRoll(){
  if (SLOT.rolling) return false;
  if (SHOP.coins < SLOT.price){ sfx('invalid'); return false; }
  SHOP.coins -= SLOT.price;
  SLOT.rolling = true;
  SLOT.t0 = performance.now();
  sfx('tap');
  shopSave();
  return true;
}

function slotResolve(){
  SLOT.rolling = false;
  SLOT.count++;
  var r = Math.random();
  var name = '', delta = 0, shards = 0;

  var forceGear = (SLOT.count % ((SLOT.pityGear) || 10) === 0);   /* 十连保底出证 */
  if (forceGear || r < 0.25){
    name = slotGiveGear();
    if (!name){ shards = 2; name = '碎片 +2'; }
  } else if (r < 0.55){
    shards = 1;
    name = '碎片 +1';
  } else if (r < 0.95){
    delta = 30;
    name = '金币 +30';
  } else {
    delta = 90; shards = 3;
    name = '大奖：+90 金币 +3 碎片';
  }

  if (delta) SHOP.coins += delta;
  if (shards && typeof addShard === 'function') addShard(shards);
  SLOT.last = name;
  SLOT.flash = performance.now() + 900;
  rebuildUnitsIfShop();
  shopSave();
  sfx('pick');
  return name;
}

/* 调试口：直接摇一次并返回结果 */
window.__slot = function(){
  var before = SHOP.coins;
  if (!slotRoll()) return { ok: false, coins: SHOP.coins };
  var name = slotResolve();
  return { ok: true, before: before, after: SHOP.coins, prize: name, shard: SHOP.shard | 0 };
};

/* 商店里换完阵容，不重开战斗，但要保证下一关用新阵容 */
function rebuildUnitsIfShop(){
  buildSquad();
  applyPassives();
}

/* ---------- 10. 商店输入（捕获阶段，先于棋盘） ---------- */
canvas.addEventListener('pointerdown', function(e){
  if (S.phase !== 'shop') return;
  try {
    var rect = canvas.getBoundingClientRect();
    var pt = [e.clientX - rect.left, e.clientY - rect.top - SAFE_TOP];
    if (hitShop(pt)){
      if (e.preventDefault) e.preventDefault();
      e.stopImmediatePropagation();
    }
  } catch (err) {}
}, true);

window.addEventListener('keydown', function(e){
  if (S.phase !== 'shop') return;
  if (e.key === 'Enter' || e.key === ' ') startNextLevel();
  if (e.key === 'r' || e.key === 'R'){
    if (SHOP.refreshLeft > 0 && SHOP.coins >= 8){ SHOP.coins -= 8; SHOP.refreshLeft--; rollOffers(); shopSave(); }
  }
}, false);

/* ---------- 11. 开局 / 顶栏关卡号：与商店状态同步 ---------- */
var _shopStartLevel = startLevel;
startLevel = function(lv){
  // 从失败结算卡上点「重新开工」→ 先带去补给站（花掉攒的钱再打）
  if (S.phase === 'lose'){ openShop(false); return; }
  window.__counters.startLevel++;
  SHOP.level = Math.max(1, lv || SHOP.level || 1);
  var res = _shopStartLevel.apply(null, arguments);
  shopSave();
  return res;
};

/* 标题页的队伍预览条：5 只小立绘 + 名字 + 阶数，让玩家一眼看到自己养出来的阵容 */
function drawTeamStrip(){
  var n = squadSlots(), w = 56, gap = 6;
  var totalW = n * w + (n - 1) * gap;
  var x0 = Math.round((W - totalW) / 2), y0 = Math.round(H * 0.485);
  txt('我的队伍 ' + squadOnCount() + '/' + n, W / 2, y0 - 8,
      Math.max(10, Math.round(W * 0.029)), C.muted, 'center');
  for (var i = 0; i < n; i++){
    var idx = SHOP.squad[i];
    var rat = (idx >= 0 && SHOP.rats[idx]) ? SHOP.rats[idx] : null;
    var x = x0 + i * (w + gap);
    rr(x, y0, w, 64, 8);
    ctx.fillStyle = rat ? 'rgba(232,172,80,.09)' : 'rgba(255,255,255,.02)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rat ? 'rgba(232,172,80,.42)' : 'rgba(90,80,110,.5)';
    ctx.stroke();
    if (!rat){
      txt('空位', x + w / 2, y0 + 36, 9, '#5b5374', 'center', true);
      continue;
    }
    var stripKey = (rat.line || 'none') + '-' + (rat.tier || 1);
    var stripImg = (typeof artFromMap === 'function') ? artFromMap(unitArtMap(), [stripKey]) : null;
    if (stripImg){
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(stripImg, x + 6, y0 + 2, 28, 28);
      ctx.restore();
    } else {
      drawHamsterArt(x + 8, y0 + 6, 26, { line: rat.line, cls: rat.line, tier: rat.tier, name: ratLabel(rat) });
    }
    drawWeapon(rat.line, rat.tier, x + 34, y0 + 26, 24, 1, 0, false);
    txt(ratLabel(rat), x + w / 2, y0 + 50, 8, C.ink, 'center', true);
    txt((TIER_LABEL[rat.tier || 1] || '白板') + ((rat.talents && rat.talents[0]) ? '·' + (TALENT_DEF[rat.talents[0].id] ? TALENT_DEF[rat.talents[0].id].name : '') : ''),
        x + w / 2, y0 + 59, 7, C.muted, 'center');
  }
}
/* 标题页显示最高关 */
/* 调试口：抽卡 / 炼妖 的分布模拟（不写存档、不动金币） */
/* 调试口：抽一只（不写存档、不动金币），用于校验三档分布与技能携带 */
window.__rollRatDebug = function(){
  var savedPity = SHOP.tier2Pity | 0;
  var r = rollRat();
  SHOP.tier2Pity = savedPity;
  return r;
};

/* 调试口：用当前 rats[0]/rats[1] 炼一次（不扣钱、不写存档），返回结算明细 */
window.__fuseDebug = function(){
  var savedCoins = SHOP.coins, savedShard = SHOP.shard | 0, savedRats = SHOP.rats, savedSquad = SHOP.squad.slice();
  SHOP.coins = 1e9; SHOP.shard = 0;
  var res = fuseRats(0, 1);
  if (!res){ SHOP.coins = savedCoins; SHOP.shard = savedShard; SHOP.rats = savedRats; return null; }
  var out = {
    kept: res.kept.map(function(t){ return { id: t.id, lv: t.lv }; }),
    lostSkills: res.lostSkills.map(function(t){ return { id: t.id, lv: t.lv }; }),
    lostTalents: res.lostTalents.map(function(t){ return { id: t.id, lv: t.lv }; }),
    gotExtra: res.gotExtra
  };
  SHOP.coins = savedCoins; SHOP.shard = savedShard; SHOP.rats = savedRats; SHOP.squad = savedSquad;
  return out;
};

window.__gachaSim = function(n){
  n = Math.max(1, Math.min(50000, n | 0));
  var slotHist = { 1: 0, 2: 0, 3: 0 };
  var gradeHist = { 1: 0, 2: 0, 3: 0 };
  var pityHit = 0;
  var savedPity = SHOP.gachaPity | 0;
  SHOP.gachaPity = 0;
  for (var i = 0; i < n; i++){
    var before = SHOP.gachaPity | 0;
    var r = rollRat();
    var n_slots = (r.talents || []).length;
    slotHist[n_slots] = (slotHist[n_slots] || 0) + 1;
    for (var k = 0; k < r.talents.length; k++) gradeHist[r.talents[k].lv]++;
    if (before + 1 >= (gachaCfg().rat.pityDouble || 20)) pityHit++;
  }
  SHOP.gachaPity = savedPity;
  return { n: n, slots: slotHist, grades: gradeHist, pityHit: pityHit };
};

window.__fuseSim = function(n){
  n = Math.max(1, Math.min(20000, n | 0));
  var extraHist = { 0: 0, 1: 0, 2: 0 };
  var slot1Lost = 0;
  var savedRats = SHOP.rats.slice();
  var savedSel = SHOP.sel;
  var savedCoins = SHOP.coins;
  var savedShard = SHOP.shard | 0;
  SHOP.coins = 1e9;
  SHOP.shard = 0;
  for (var i = 0; i < n; i++){
    SHOP.rats = [
      { line: 'tank', tier: 3, mod: '', talents: [{ id: 'tank', lv: 3 }, { id: 'care', lv: 2 }] },
      { line: 'shot', tier: 3, mod: '', talents: [{ id: 'shot', lv: 2 }, { id: 'hex', lv: 3 }] }
    ];
    SHOP.squad = [0, 1, -1, -1, -1];
    SHOP.sel = 0;
    var res = fuseRats(0, 1);
    if (!res) continue;
    var extras = Math.max(0, (res.kept || []).length - 1);
    extraHist[Math.min(2, extras)]++;
    if (!res.kept || !res.kept[0] || res.kept[0].id !== 'tank') slot1Lost++;
  }
  SHOP.rats = savedRats;
  SHOP.sel = savedSel;
  SHOP.coins = savedCoins;
  SHOP.shard = savedShard;
  return { n: n, extras: extraHist, slot1Lost: slot1Lost };
};

window.__openShop = function(win){
  openShop(win !== false);
  return S.phase;
};

/* 标题页背景：拿 assets/stage_bg.png 当画布底色。
   做法是临时把 C.bg 换成一个 CanvasPattern —— 原版 drawTitle 里那一句
   "ctx.fillStyle = C.bg; fillRect(0,0,W,H)" 就会直接铺出工厂地板，game.orig.js 一行不动。 */
var TITLE_BG = { img: null, pat: null, tried: false };

/* 把工厂地板做成"压暗 + 放大"的贴图块，再当画布底色用：
   直接拿原图铺会重复得很明显，也会抢文字的对比度。 */
function titleBgPattern(){
  if (TITLE_BG.pat) return TITLE_BG.pat;
  if (TITLE_BG.tried) return null;
  TITLE_BG.tried = true;
  try {
    var src = (window.GAME && window.GAME.assets && window.GAME.assets.stage_bg) || null;
    if (!src) return null;
    var img = new Image();
    img.onload = function(){
      try {
        var tile = document.createElement('canvas');
        var tw = Math.round(W * 1.6), th = Math.round(tw * (img.height / img.width));
        tile.width = tw; tile.height = th;
        var tctx = tile.getContext('2d');
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(img, 0, 0, tw, th);
        /* 压暗两次：一层整体，一层从中间往外的暗角 */
        tctx.fillStyle = 'rgba(18,14,26,.80)';
        tctx.fillRect(0, 0, tw, th);
        var g = tctx.createRadialGradient(tw / 2, th / 2, tw * 0.12, tw / 2, th / 2, tw * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,.55)');
        tctx.fillStyle = g;
        tctx.fillRect(0, 0, tw, th);
        TITLE_BG.pat = ctx.createPattern(tile, 'repeat');
      } catch (e) {}
    };
    img.src = src;
    TITLE_BG.img = img;
  } catch (e) {}
  return null;
}

var _shopDrawTitle = drawTitle;
drawTitle = function(){
  /* 先把工厂地板铺成底色；没有背景图就照旧用纯色 */
  var _bgSave = C.bg;
  var _pat = titleBgPattern();
  if (_pat) C.bg = _pat;
  _shopDrawTitle.apply(null, arguments);
  C.bg = _bgSave;

  /* 暗角：只压四角，文字在中间不受影响 */
  try {
    var g = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.28, W / 2, H * 0.42, W * 0.95);
    g.addColorStop(0, 'rgba(16,12,24,0)');
    g.addColorStop(1, 'rgba(16,12,24,.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } catch (e) {}
  drawTeamStrip();
  /* 原标题页那行写的是"五关订单"；关卡表改成 6 关一轮 + 无尽轮次之后这行就不准了，
     底图是纯色，直接盖一层底色再重写，比改原逻辑安全（game.orig.js 一行不动）。 */
  var bh = Math.round(Math.min(52, H * 0.07));
  var y = Math.round(H * 0.68) + bh + 34;
  var fs = Math.max(10, Math.round(W * 0.031));
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, y - fs, W, fs * 2);
  txt('6 关一轮 · 三选一强化 · 通关后无尽轮次', W / 2, y, fs, C.muted, 'center');
  if (window.BUILD_TAG){
    txt(window.BUILD_TAG, W - 10, H - 10, Math.max(8, Math.round(W * 0.021)), '#4a4359', 'right');
  }
  txt('最高第 ' + SHOP.best + ' 关 · 金币 ' + SHOP.coins, W / 2, Math.round(H * 0.68) + bh + 80,
      Math.max(10, Math.round(W * 0.03)), C.amber, 'center', true);
};

/* 调参/测试口 */
window.__shop = function(){ return SHOP; };
window.__shopOpen = openShop;
window.__shopNext = startNextLevel;
window.__shopBuy = buyOffer;
window.__shopHits = function(){ return { hit: HIT, shop: HITS }; };
window.__rollInfo = function(){
  return { level: SHOP.level, sel: SHOP.sel, lines: unlockedLines(SHOP.level || 1), tier3: allowTier3(SHOP.level || 1) };
};
/* 测试口：直接摇一次货架（不受 phase 幂等限制），返回这次出的证 */
window.__shopRoll = function(){
  rollOffers();
  var o = SHOP.offers[0];
  return { line: o.line, tier: o.tier, mod: SHOP.offers[1].mod, price: o.price };
};
