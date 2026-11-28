/* ============================================================
   RPG 战斗层（M2：三资源 → 我方仓鼠小队 / 敌方鼠群）
   ------------------------------------------------------------
   设计依据：docs/GDD-v4-shop-routing.md
   · 护甲 = 全队共享护盾（不分配给具体单位）
   · 零件 / 能量 = 私有槽（断点轮转）+ 余量进公共池
   · 步数即时间轴：走一步 = 敌人充能 +1
   · 美术全部代码矢量图，尺寸集中在 SZ 里，改一处全动
   ============================================================ */

/* ---------- 1. 尺寸规范（逻辑像素，竖屏 390×844 基准） ----------
   按"最挤的情况"定：我方 3 + 敌方 3 = 6 张卡同时在场。
   舞台可用宽 = W - 2*pad - 12 ≈ 344 → 6*48 + 5*6 = 318，留 26 余量。 */
var SZ = {
  card: 48,        // 单位卡宽（5v5 两排制：一排 5 张 = 264px，竖屏放得下）
  cardH: 66,       // 单位卡高：两排制要同时塞下敌排+我排+战况，压到 66
  art: 40,         // 卡内矢量角色边长
  gap: 6,          // 卡片间距
  hpBar: 4,        // 卡内血条高
  slotBar: 3,      // 卡内充能条高（我方私有槽 / 敌方出手倒计时）
  name: 8,         // 卡下名字字号
  queue: 20,       // 排队小卡边长
  queueGap: 4,
  stripH: 7,       // 底部资源条高
  ult: 44,         // 大招按钮直径
  title: 11,       // 舞台标题字号
  float: 11,       // 伤害飘字字号（13 太大，会盖住相邻精灵）
  log: 9           // 战斗日志字号
};

/* ---------- 2. 配置：game.json 的 rules.rpg 覆盖默认值 ---------- */
var RPGR = RULES.rpg || {};

var CFG = {
  hp: 100, armorMax: 60, partsMax: 30, energyMax: 100,
  // 每格产出（花生→能量 / 饼干→护甲 / 瓜子→零件）
  yieldPer: { energy: 4, armor: 2, parts: 1 },
  cascade: [1, 1.5, 2, 3],
  turret: { cost: 10, dmg: 6 },       // 公共炮台：余量零件自动开火
  ult: { cost: 100, dmg: 25 },        // 大招：消耗全部能量，全体伤害
  slots: 5,                            // 上场位（rules.rpg.slots；M6-3 起 5 个）
  squad: ['tin', 'cannon'],
  realtime: true,                      // 敌方按真实时间出手（不再是"走一步充一格"）
  tankRedirect: 0.2,                   // 承伤单位吸引走的伤害比例
  tankReduce: 0.3                      // 承伤单位自身减伤
};
(function(){
  for (var k in RPGR){ if (RPGR[k] !== undefined && CFG[k] !== undefined) CFG[k] = RPGR[k]; }
})();

var CFG_YIELD = CFG.yieldPer || { energy: 4, armor: 2, parts: 1 };

/* ---------- 3. 仓鼠品种（职责全程不漂移：一行一条线） ----------
   自动战斗：每个单位有自己的出手间隔 atkMs 与基础伤害 baseDmg。
   资源不再是"能不能动"的门票，而是"强化弹"——私有槽满了，下一次出手就用 act 的强化值。 */
var ROSTER = {
  worker:   { name: '工鼠',     line: 'none', eats: null,     hp: 60,  eff: 1.1, atkMs: 3200, baseDmg: 3, act: { kind: 'hit', dmg: 8 } },
  tin:      { name: '铁皮鼠',   line: 'wrench', eats: null,   hp: 90,  tank: 1, atkMs: 0, baseDmg: 0 },
  hydra:    { name: '液压鼠',   line: 'wrench', eats: null,   hp: 120, tank: 1, thorns: 4, atkMs: 0, baseDmg: 0 },
  cannon:   { name: '炮筒鼠',   line: 'driver', eats: 'parts',  hp: 55, need: 6, atkMs: 2600, baseDmg: 4, act: { kind: 'hit', dmg: 12 } },
  sniper:   { name: '瓜子狙击鼠', line: 'driver', eats: 'parts', hp: 55, need: 9, atkMs: 3200, baseDmg: 5, act: { kind: 'hit', dmg: 14, pierce: true } },
  spring:   { name: '速滑鼠',   line: 'spring', eats: 'energy', hp: 50, need: 25, atkMs: 2400, baseDmg: 5, act: { kind: 'hit', dmg: 15 } },
  boom:     { name: '爆产鼠',   line: 'spring', eats: 'energy', hp: 50, need: 30, atkMs: 3000, baseDmg: 6, act: { kind: 'aoe', dmg: 20 } },
  medic:    { name: '扳钳鼠',   line: 'medic',  eats: 'energy', hp: 45, need: 30, atkMs: 5000, baseDmg: 4, act: { kind: 'heal', dmg: 12 } },
  nurse:    { name: '医护鼠',   line: 'medic',  eats: 'energy', hp: 55, need: 35, atkMs: 5000, baseDmg: 4, act: { kind: 'heal', dmg: 10, armor: 8 } },
  collect:  { name: '收集鼠',   line: 'sack',   eats: null,   hp: 40, cascade: 0.5, atkMs: 0, baseDmg: 0 },
  store:    { name: '仓库鼠',   line: 'sack',   eats: null,   hp: 40, cascade: 0.5, cap: 10, atkMs: 0, baseDmg: 0 }
};
/* M6-2：五职业 × 四阶形态表（tier 1 = 白板鼠 worker；2–4 如下）
   数值口径见 docs/GDD-v6-squad5.md §8：同一线上每阶血 ×1.35、伤害 ×1.45 左右，
   靠 tools/levelsim.mjs / __rpgSimAt 再调。 */
(function(){
  var add = {
    /* 肉盾：血厚、慢、带减伤（tank 标记让 hurtTeam 把单体伤害吸过去） */
    'tank-2':  { name: '铁皮鼠', cls: 'tank', hp: 150, tank: 1, atkMs: 2800, baseDmg: 6,  act: { kind: 'hit', dmg: 8 } },
    'tank-3':  { name: '铆甲鼠', cls: 'tank', hp: 205, tank: 1, thorns: 4, atkMs: 2700, baseDmg: 8,  act: { kind: 'hit', dmg: 11 } },
    'tank-4':  { name: '堡垒鼠', cls: 'tank', hp: 275, tank: 1, thorns: 7, atkMs: 2600, baseDmg: 11, act: { kind: 'hit', dmg: 15 } },
    /* 近战：突进贴身、单体高伤，吃零件 */
    'blade-2': { name: '扳钳鼠', cls: 'blade', eats: 'parts',  need: 5, hp: 120, atkMs: 1600, baseDmg: 8,  act: { kind: 'hit', dmg: 18 } },
    'blade-3': { name: '尖牙鼠', cls: 'blade', eats: 'parts',  need: 7, hp: 160, atkMs: 1500, baseDmg: 11, act: { kind: 'hit', dmg: 26 } },
    'blade-4': { name: '破城鼠', cls: 'blade', eats: 'parts',  need: 9, hp: 210, atkMs: 1400, baseDmg: 15, act: { kind: 'hit', dmg: 36, pierce: true } },
    /* 远程：站后排、抛射，吃零件 */
    'shot-2':  { name: '炮筒鼠', cls: 'shot',  eats: 'parts',  need: 6,  hp: 95,  atkMs: 2400, baseDmg: 7,  act: { kind: 'hit', dmg: 15 } },
    'shot-3':  { name: '连发鼠', cls: 'shot',  eats: 'parts',  need: 8,  hp: 130, atkMs: 2200, baseDmg: 10, act: { kind: 'hit', dmg: 22 } },
    'shot-4':  { name: '狙炮鼠', cls: 'shot',  eats: 'parts',  need: 10, hp: 170, atkMs: 2100, baseDmg: 13, act: { kind: 'hit', dmg: 30, pierce: true } },
    /* 魔法：中距、蓄力范围伤害，吃能量 */
    'hex-2':   { name: '火种鼠', cls: 'hex',   eats: 'energy', need: 25, hp: 90,  atkMs: 3200, baseDmg: 9,  act: { kind: 'aoe', dmg: 20 } },
    'hex-3':   { name: '咒炉鼠', cls: 'hex',   eats: 'energy', need: 28, hp: 120, atkMs: 3100, baseDmg: 12, act: { kind: 'aoe', dmg: 29 } },
    'hex-4':   { name: '熔炉鼠', cls: 'hex',   eats: 'energy', need: 30, hp: 160, atkMs: 3000, baseDmg: 16, act: { kind: 'aoe', dmg: 40 } },
    /* 增益：治疗/补盾，站后排，吃能量 */
    'care-2':  { name: '医务鼠', cls: 'care',  eats: 'energy', need: 30, hp: 110, atkMs: 3000, baseDmg: 3, act: { kind: 'heal', dmg: 12 } },
    'care-3':  { name: '药剂鼠', cls: 'care',  eats: 'energy', need: 32, hp: 145, atkMs: 2900, baseDmg: 4, act: { kind: 'heal', dmg: 18, armor: 6 } },
    'care-4':  { name: '大医师鼠', cls: 'care', eats: 'energy', need: 35, hp: 185, atkMs: 2800, baseDmg: 5, act: { kind: 'heal', dmg: 26, armor: 10 } }
  };
  for (var k in add){
    var d = add[k];
    ROSTER[k] = {
      name: d.name, line: d.cls, cls: d.cls, tier: parseInt(k.split('-')[1], 10),
      eats: d.eats || null, need: d.need || 0,
      hp: d.hp, tank: d.tank || 0, thorns: d.thorns || 0,
      atkMs: d.atkMs || 0, baseDmg: d.baseDmg || 0, act: d.act || null
    };
  }
})();

(function(){
  var src = RPGR.roster || {};
  for (var k in src){
    ROSTER[k] = ROSTER[k] || {};
    for (var f in src[k]) ROSTER[k][f] = src[k][f];
  }
})();

/* rules.classes：职业数值覆盖（舞台编辑器里改的"职业数值"写在这里，不用动代码）
   形如 { "tank-2": { hp: 150, atkMs: 2800, baseDmg: 6, need: 0, dmg: 8 } } */
(function(){
  var ov = (RULES && RULES.classes) ? RULES.classes : null;
  if (!ov) return;
  for (var key in ov){
    var r = ROSTER[key], o = ov[key];
    if (!r || !o) continue;
    if (typeof o.hp === 'number') r.hp = o.hp;
    if (typeof o.atkMs === 'number') r.atkMs = o.atkMs;
    if (typeof o.baseDmg === 'number') r.baseDmg = o.baseDmg;
    if (typeof o.need === 'number') r.need = o.need;
    if (typeof o.dmg === 'number' && r.act) r.act.dmg = o.dmg;
  }
})();

/* ---------- 4. 敌方（尖牙帮） ---------- */
/* 基础血量：玩家侧现在有"5 鼠 + 倍率 + 天赋"三重增幅，所以基数抬到这里的量级，
   关卡表里的 hpMul 就能回到 1.x（P4）。改这里 = 改全游戏敌人血量基准。 */
var FOES = {
  crate: { name: '纸箱鼠', hp: 46,  charge: 3, atk: 15,  box: 1, cls: 'tank',  tier: 2, range: 'melee' },
  shell: { name: '抛壳鼠', hp: 56,  charge: 3, atk: 19, pierce: 1, cls: 'blade', tier: 2, range: 'melee' },
  thief: { name: '拾荒鼠', hp: 60,  charge: 4, atk: 0, cls: 'shot',  tier: 2, range: 'far' },
  boss:  { name: '质检机', hp: 210, charge: 4, atk: 34, boss: 1, cls: 'hex', tier: 2, range: 'mid' },
  glue:  { name: '喷胶鼠', hp: 70,  charge: 4, atk: 8,  cls: 'care',  tier: 2, range: 'far' },
  blast: { name: '引信鼠', hp: 44,  charge: 4, atk: 9,  blast: 1, cls: 'blade', tier: 2, range: 'melee' },
};
(function(){
  var src = RPGR.foes || {};
  for (var k in src){
    FOES[k] = FOES[k] || {};
    for (var f in src[k]) FOES[k][f] = src[k][f];
  }
})();

/* ---------- 5. 关卡表：每关可以有自己的一套波次与修饰符 ----------
   rules.rpg.levels 是数组；关卡号超出长度后进入无尽：按轮次整体放大，并循环使用关卡表。 */
var WAVES_DEFAULT = [
  [{ type: 'crate' }],
  [{ type: 'crate' }, { type: 'shell' }],
  [{ type: 'crate' }, { type: 'crate' }, { type: 'shell' }]
];
var CHAPTER = RPGR.chapter || { name: '工厂开张', steps: 14, waves: WAVES_DEFAULT, tools: [1, 2, 1], onField: 2 };

var LEVELS_TABLE = (RPGR.levels && RPGR.levels.length) ? RPGR.levels : [CHAPTER];
var ROUND_SCALE = RPGR.roundScale || 1.15;   // 关卡表循环一圈后，整体强度 ×这个数

/* 当前关的配置：名字 / 波次 / 同屏上限 / 修饰符 / 工具次数 */
function levelCfgFor(level){
  var lv = Math.max(1, level || 1);
  var idx = (lv - 1) % LEVELS_TABLE.length;
  var base = LEVELS_TABLE[idx] || CHAPTER;
  var round = Math.floor((lv - 1) / LEVELS_TABLE.length);
  var scale = Math.pow(ROUND_SCALE, round);
  var mod = base.mod || {};
  function mul(a, b){ return (a === undefined ? 1 : a) * b; }
  return {
    name: base.name || '工厂开张',
    level: lv,
    waves: base.waves || WAVES_DEFAULT,
    onField: base.onField || 2,
    enemyTier: base.enemyTier || 1,
    /* 本关开场提示（教学用），显示成横幅 + 记一条战况 */
    tip: base.tip || '',
    /* 开场简报：本关会遇到什么困难（开战前整屏显示，点一下才开打） */
    brief: base.brief || '',
    tut: !!base.tut,
    /* 本关我方最多能上几只：第一轮 2→3→4→5 循序渐进；第二轮起一律 5 只（玩家已经熟了） */
    slots: round > 0 ? (CFG.slots || 5) : (base.slots || (CFG.slots || 5)),
    tools: base.tools || [1, 1, 1],
    round: round,
    mod: {
      hpMul: mul(mod.hpMul, scale),
      atkMul: mul(mod.atkMul, scale),
      chargeMul: mod.chargeMul === undefined ? 1 : mod.chargeMul,
      armorMaxDelta: mod.armorMaxDelta || 0,
      yieldMul: mod.yieldMul || {},
      noUlt: !!mod.noUlt,
      stealBonus: mod.stealBonus || 0,
      note: mod.note || ''
    }
  };
}

/* 把配置写进 CHAPTER（其余代码都读它）与 R.mod（战斗内生效的修饰符） */
function applyLevelCfg(level){
  var cfg = levelCfgFor(level);
  CHAPTER.name = cfg.name;
  CHAPTER.waves = cfg.waves;
  CHAPTER.onField = cfg.onField;
  CHAPTER.enemyTier = cfg.enemyTier;
  CHAPTER.tip = cfg.tip;
  CHAPTER.brief = cfg.brief;
  CHAPTER.tut = !!cfg.tut;
  CHAPTER.slots = cfg.slots;
  CHAPTER.tools = cfg.tools;
  R.cfg = cfg;
  R.mod = cfg.mod;
  return cfg;
}

/* ---------- 6. 战斗状态 ---------- */
var R = {
  hp: 100, hpMax: 100,
  armor: 0, armorMax: 60,
  parts: 0, partsMax: 30,
  energy: 0, energyMax: 100,
  units: [], enemies: [], queue: [],
  shots: [], fx: [],
  hitstopUntil: 0, shakeUntil: 0, shakeMag: 0,
  wave: 0, waveTotal: 0,
  dmgDealt: 0, kills: 0,
  floats: [], ultFlash: 0, banner: null,
  pending: { energy: 0, armor: 0, parts: 0 },
  cursor: { parts: 0, energy: 0 },
  stepThisTurn: false,
  log: []
};

function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }

/* 打击感：音效 + 顿帧 + 震屏。纯表现层，不改任何数值。 */
function juice(kind, power){
  var now = performance.now();
  if (kind === 'hit' || kind === 'hitBig'){
    R.hitstopUntil = Math.max(R.hitstopUntil || 0, now + (kind === 'hitBig' ? 70 : 40));
    R.shakeUntil = now + 150;
    R.shakeMag = Math.max(R.shakeMag || 0, kind === 'hitBig' ? 4 : 2);
  }
  sfx(kind);
}

/* 震屏偏移：按剩余时间衰减，取正弦抖动 */
function shakeOffset(now){
  if (!R.shakeUntil || now > R.shakeUntil) return { x: 0, y: 0 };
  var left = (R.shakeUntil - now) / 150;
  var m = (R.shakeMag || 2) * left;
  return { x: Math.sin(now / 22) * m, y: Math.cos(now / 31) * m * 0.7 };
}

function pushLog(text){ R.log.push(text); if (R.log.length > 40) R.log.shift(); }

/* 技能飘字：图标 + 名字（图标由 drawStage 渲染，这里是数据） */
function skillFloat(id, name, x, y, col){
  R.floats.push({ text: name, icon: id, x: x, y: y, t0: performance.now(),
                  max: 820, col: col || '#ffd166', big: false, kind: 'skill' });
  if (R.floats.length > 24) R.floats.shift();
}

function floatText(text, x, y, col, big, kind){
  R.floats.push({ text: text, x: x, y: y, t0: performance.now(), max: 760, col: col || C.ink, big: !!big, kind: kind || '' });
  if (R.floats.length > 24) R.floats.shift();
}

/* 伤害飘字：按类型分色 + 同一目标短时间内的多次伤害合并成一个数
   —— 5v5 打起来一堆数字会糊成一片，合并后只看得到"这一下打了多少"。 */
var FLOAT_COLOR = { hit: '#ff9d8a', crit: '#ffd166', pierce: '#c7b6ff' , mag: '#8fb8ff', magBig: '#b7d3ff' };
function damageFloat(n, x, y, kind, big){
  var now = performance.now();
  var col = FLOAT_COLOR[kind] || FLOAT_COLOR.hit;
  for (var i = R.floats.length - 1; i >= Math.max(0, R.floats.length - 5); i--){
    var f = R.floats[i];
    if (f.kind !== kind) continue;
    if (Math.abs(f.x - x) > 26 || Math.abs(f.y - y) > 16) continue;
    if (now - f.t0 > 220) continue;
    var m = /(\d+)/.exec(f.text);
    if (!m || f.text.charAt(0) !== '-') continue;
    var total = parseInt(m[1], 10) + n;
    f.text = '-' + total;
    f.t0 = now;
    if (big) f.big = true;
    return;
  }
  floatText('-' + n, x, y, col, big, kind);
}

/* ---------- 5.6 位置化舞台（M6-1 第一步 → M6-3 两排制） ----------
   · 每个单位有自己的前压量 dx：近战/肉盾顶向对面（两排制里是"竖着顶"），远程留在后排
   · 出手拆成"抬手 → 释放"；远程在释放时发射投射物，命中才结算伤害
   · 走位只做一次（进场时），所以不改变长期 DPS 节奏
   数值口径：一轮 = atkMs（抬手时间从下一轮里扣回来），出手频率与改造前一致。 */
var STAGE = {
  gapMelee: 10,     // 近战往对面顶的像素（竖着顶，不占横向空间，不会盖住邻卡）
  gapMid: 5,        // 中距离单位顶一半
  speed: 170,       // 走位速度 px/s
  windupMs: 240,    // 抬手时长
  shotMs: 300       // 投射物飞行时长
};

/* 远程出手：先飞 300ms 再结算，伤害数值与原来一致（只是晚到） */
function spawnShot(actor, target, dmg, pierce, hostile){
  var toFoe = !hostile;
  R.shots.push({
    x0: stageXOf(actor, hostile) + (hostile ? -16 : 16),
    y0: stageYOf(actor, hostile) - 8,
    x1: stageXOf(target, toFoe),
    y1: stageYOf(target, toFoe),
    t0: performance.now(), dur: STAGE.shotMs,
    dmg: dmg, pierce: !!pierce, target: target, hostile: !!hostile
  });
}

function updateShots(dtMs){
  var now = performance.now();
  for (var i = R.shots.length - 1; i >= 0; i--){
    var s = R.shots[i];
    if (now - s.t0 < s.dur) continue;
    R.shots.splice(i, 1);
    R.fx.push({ x: s.x1, y: s.y1, t0: now, dur: 220 });
    if (R.fx.length > 16) R.fx.shift();
    var tgt = s.target;
    if (!tgt) continue;
    if (s.hostile){
      /* 法术型敌人（质检机/粘胶/自爆）走魔法，其余物理 */
  function foeMagicKind(type){ return (type === 'boss' || type === 'glue' || type === 'blast') ? 'mag' : 'phys'; }
  s.kind = s.kind || foeMagicKind(o && o.type);
  if (o && o.type === 'glue'){
    tgt.slowAtkPct = 0.15;
    tgt.slowAtkUntil = performance.now() + 3000;
  }
  if (tgt.alive) applyUnitDamage(tgt, s.dmg, s.pierce, s.kind || 'phys');
  if (typeof thiefSteal === 'function') thiefSteal(o);
    } else if (tgt.alive){
      hurtFoe(tgt, s.dmg, s.pierce);
    }
  }
  for (var j = R.fx.length - 1; j >= 0; j--){
    if (now - R.fx[j].t0 > R.fx[j].dur) R.fx.splice(j, 1);
  }
}

/* 抬手结束：远程发弹，其余照旧直接结算 */
function releaseUnit(u){
  if (!u || !u.alive) return;
  var wasEmpowered = u.empowered;
  if (wasEmpowered){ u.empowered = false; u.charge = 0; }
  var act = u.act || null;
  if (u.range === 'far' && act && act.kind === 'hit'){
    var foe = weakestEnemy();
    if (!foe){ u.timerMs = STAGE.windupMs; return; }
    var dmg = wasEmpowered ? act.dmg : (u.baseDmg || 0);
    if (dmg > 0){
      spawnShot(u, foe, dmg, !!act.pierce, false);
      if (wasEmpowered) floatText('强化', stageXOf(u, false), stageYOf(u, false) - 14, C.amber);
      sfx(wasEmpowered ? 'combo' : 'pop', { round: 1 });
    }
    u.actFlash = performance.now() + 220;
    u.timerMs = STAGE.windupMs;
    return;
  }
  unitStrike(u, wasEmpowered);
  u.timerMs = STAGE.windupMs;
}


/* ---------- 7. 组队 ---------- */
function makeUnit(id, slot){
  var def = ROSTER[id] || ROSTER.worker;
  var hpBonus = 0, need = def.need || 0;
  /* 射程按职业定：肉盾/近战贴身，魔法中距，远程/增益后排（不再靠 atkMs 猜） */
  var range = def.range || (def.cls === 'tank' || def.cls === 'blade' ? 'melee'
                          : def.cls === 'hex' ? 'mid'
                          : (def.cls === 'shot' || def.cls === 'care') ? 'far'
                          : (def.atkMs ? 'far' : 'melee'));
  return {
    id: id, name: def.name, line: def.line || 'none',
    eats: def.eats || null, need: need,
    hp: def.hp + hpBonus, hpMax: def.hp + hpBonus,
    charge: 0, ready: false, alive: true, slot: slot,
    act: def.act || null, tank: !!def.tank, thorns: def.thorns || 0,
    atkMs: def.atkMs || 0, baseDmg: def.baseDmg || 0,
    timerMs: 0, empowered: false,
    /* 位置化战斗：dx = 相对站位卡中心的横移；range 决定走多远、要不要发弹。
       近战/肉盾一建出来就站在贴身位（只是站位，不走位动画）。 */
    dx: range === 'melee' ? STAGE.gapMelee : 0, windup: 0, range: range,
    /* x / y 由 ensurePos() 在入场时按地面矩形算（2D 站位，不再只有一条地面线） */
    /* 职业与阶：决定手里那把武器（WEAPON_NAME / drawWeapon） */
    cls: def.cls || def.line || 'none', tier: def.tier || 1,
    cascade: def.cascade || 0, cap: def.cap || 0,
    flash: 0, actFlash: 0
  };
}

function buildSquad(){
  var squad = CFG.squad || ['worker'];
  R.units = [];
  for (var i = 0; i < squad.length && i < CFG.slots; i++) R.units.push(makeUnit(squad[i], i));
  // 补满空槽（视觉上画虚线框）
  while (R.units.length < CFG.slots) R.units.push(null);
  for (var j = 0; j < R.units.length; j++) if (R.units[j]) R.units[j].slot = j;
}

/* 被动单位（收集鼠/仓库鼠）改上限与连击 */
function applyPassives(){
  var capBonus = 0, cascadeBonus = 0;
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (!u || !u.alive) continue;
    if (u.cap) capBonus += u.cap;
    if (u.cascade) cascadeBonus += u.cascade;
  }
  R.capBonus = capBonus;
  R.cascadeBonus = cascadeBonus;
  var delta = (R.mod && R.mod.armorMaxDelta) || 0;
  R.armorMax = Math.max(10, CFG.armorMax + capBonus + delta + (R.buffArmorMax || 0));
  R.partsMax = CFG.partsMax + capBonus;
  R.energyMax = CFG.energyMax + capBonus;
}

/* ---------- 8. 开局 / 重开 / 波次 ---------- */
function rpgResetBattle(){
  R.hpMax = 0; R.hp = 0;   // 核心血池已取消：胜负只看全队是否阵亡
  R.armor = 0; R.parts = 0; R.energy = 0;
  R.enemies = []; R.queue = []; R.wave = 0;
  R.shots = []; R.fx = [];
  R.hitstopUntil = 0; R.shakeUntil = 0; R.shakeMag = 0;
  R.dmgDealt = 0; R.kills = 0; R.floats = []; R.pending = { energy: 0, armor: 0, parts: 0 };
  R.cursor = { parts: 0, energy: 0 };
  R.ultFlash = 0; R.banner = null; R.log = [];
  R.outOfStock = false; R.graceUntil = 0;
  // 波间补给只在本关有效：开新关时清空
  R.buffArmorMax = 0; R.buffDmgMul = 1; R.buffAtkMul = 1; R.pick = null;
  buildSquad();
  applyPassives();
  R.waveTotal = (CHAPTER.waves || []).length || 1;
  spawnWave(0);
}

/* ---------- 5.7 敌方四阶进化（M6-4） ----------
   尖牙帮也走"白板 → 二级 → 三级 → 四级"，每阶换名换装备（废料），数值按阶乘。
   名字、乘数都走表：想改强度只动 game.json 的 foeTier / foeScale，不改逻辑。 */
var FOE_NAMES = {
  crate: ['纸箱鼠', '铁箱鼠', '保险柜鼠', '金库鼠'],
  shell: ['抛壳鼠', '铰钳鼠', '断牙鼠', '血牙鼠'],
  thief: ['拾荒鼠', '弹弓鼠', '痰盂炮手', '废料迫击炮'],
  boss:  ['质检机', '电检机', '高压检测塔', '报废熔炉'],
  glue:  ['喷胶鼠', '补丁鼠', '焊接鼠', '焊炉母鼠']
};

/* 阶数乘数（tier 1..4 → 下标 0..3），可在 game.json 的 rules.rpg.foeTier 覆盖 */
var FOE_TIER = (RPGR.foeTier && RPGR.foeTier.length === 4) ? RPGR.foeTier : [
  { hp: 1.0, atk: 1.0, charge: 1.00 },   /* T1 */
  { hp: 2.0, atk: 1.15, charge: 0.97 },  /* T2 */
  { hp: 3.4, atk: 1.40, charge: 0.94 },  /* T3 */
  { hp: 5.4, atk: 1.70, charge: 0.90 }   /* T4 */
];
/* 全局微调：调难度先动这里，不动阶表 */
var FOE_SCALE = RPGR.foeScale || { hp: 1, atk: 1 };

function foeTierOf(tier){
  return FOE_TIER[Math.max(0, Math.min(3, (tier || 1) - 1))];
}
function foeNameOf(type, tier){
  var list = FOE_NAMES[type];
  if (!list) return (FOES[type] && FOES[type].name) || type;
  return list[Math.max(0, Math.min(3, (tier || 1) - 1))];
}

/* 本关敌人应该是什么阶：关卡表 enemyTier + 动态追赶（我方阵容领先太多就升一档，只升不降） */
function enemyTierForLevel(){
  var base = CHAPTER.enemyTier || 1;
  if (R.cfg && R.cfg.round > 0) base = Math.max(base, 4);
  var cfg = (RULES.rpg || {}).catchUp || {};
  if (cfg.enable !== false){
    var gap = cfg.gap === undefined ? 3 : cfg.gap;
    var maxAllyTier = 1;
    for (var i = 0; i < R.units.length; i++){
      var u = R.units[i];
      if (u && u.alive && (u.tier || 1) > maxAllyTier) maxAllyTier = u.tier || 1;
    }
    if (maxAllyTier - base >= gap) base = Math.min(4, base + 1);
    /* 天赋追赶：队里出现"三天赋"的鼠，敌人整体升一阶（只在开关打开时） */
    if (cfg.talentTier !== false){
      var maxTalentCount = 0;
      for (var ti = 0; ti < R.units.length; ti++){
        var tu = R.units[ti];
        if (tu && tu.alive && tu.talents && tu.talents.length > maxTalentCount) maxTalentCount = tu.talents.length;
      }
      if (maxTalentCount >= 3) base = Math.min(4, base + 1);
    }
  }
  return Math.max(1, Math.min(4, base));
}

/* 天赋追赶（P4c）：按全队最多天赋条数给敌人一个连续倍率 ——
   0 条时敌人弱一点（0.85），1 条持平，2 条 ×1.15，3 条 ×1.32。不整阶跳，避免超调。 */
function talentCatchUpScale(){
  var cfg = (RULES.rpg && RULES.rpg.catchUp) || {};
  var table = cfg.talentScale;
  if (!table) return 1;
  var maxTal = 0;
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (!u || !u.alive || !u.talents) continue;
    if (u.talents.length > maxTal) maxTal = u.talents.length;
  }
  var v = table[String(Math.min(4, maxTal))];
  return (typeof v === 'number' && v > 0) ? v : 1;
}

function foeMake(type, tier, elite){
  var def = FOES[type] || FOES.crate;
  var t = Math.max(1, Math.min(4, tier || enemyTierForLevel()));
  var tm = foeTierOf(t);
  var chargeMs = def.chargeMs || ((def.charge || 3) * 1500);
  var mod = R.mod || {};
  var tScale = talentCatchUpScale();
  var hpMul = (mod.hpMul || 1) * tm.hp * (FOE_SCALE.hp || 1) * tScale;
  /* 精英：血 ×1.6、攻 ×1.25、赏金 ×2（给高天赋玩家的目标） */
  if (elite){
    hpMul *= 1.6;
    atkMul *= 1.25;
  }
  var atkMul = (mod.atkMul || 1) * tm.atk * (FOE_SCALE.atk || 1) * (1 + (tScale - 1) * 0.6);
  var chargeMul = (mod.chargeMul || 1) * tm.charge;
  return {
    type: type, elite: elite ? 1 : 0, name: foeNameOf(type, t), baseName: def.name,
    hp: Math.round(def.hp * hpMul), hpMax: Math.round(def.hp * hpMul),
    charge: 0, chargeMax: def.charge || 3, atk: Math.round((def.atk || 8) * atkMul * 10) / 10,
    chargeMs: Math.round(chargeMs * chargeMul), timerMs: 0,
    pierce: !!def.pierce, box: def.box || 0, boss: !!def.boss,
    steal: (def.steal || 0) + (mod.stealBonus || 0),
    range: def.range || 'melee',
    cls: def.cls || 'tank', tier: t,
    dx: 0, windup: 0,
    flash: 0, alive: true, slot: 0
  };
}

function spawnWave(idx){
  R.wave = idx;
  R.mult = R.multLocked ? Math.max(1, R.multLocked) : 1;   /* 波间锁过就沿用，否则重来 */
  R.multLocked = 0;
  var list = (CHAPTER.waves || [])[idx] || [];
  var onField = CHAPTER.onField || 2;
  R.enemies = [];
  R.queue = [];
  /* 每波最多一个精英；第 1 关第 1 波不刷，先让新手熟悉 */
  var eliteCfg = (RULES.rpg && RULES.rpg.eliteChance);
  var eliteP = (typeof eliteCfg === 'number') ? eliteCfg : 0.12;
  var eliteWave = !(S.level <= 1 && idx === 0) && Math.random() < eliteP;
  var eliteTaken = false;

  for (var i = 0; i < list.length; i++){
    var wantElite = eliteWave && !eliteTaken && i === list.length - 1;
    if (wantElite) eliteTaken = true;
    var foe = foeMake(list[i].type, undefined, wantElite);
    if (wantElite && foe){
      foe.elite = 1;
      pushLog('精英 ' + foe.name + ' 登场');
      R.banner = { text: '精英 ' + foe.name + ' 登场', t0: performance.now(), holdMs: 2000 };
      sfx('elite');
    }
    if (R.enemies.length < onField) R.enemies.push(foe);
    else R.queue.push(foe);
  }
  for (var j = 0; j < R.enemies.length; j++){
    R.enemies[j].slot = j;
    ensurePos(R.enemies[j], j, true, R.enemies.length);
  }
  warmUnitArt(R.enemies, true);
  warmUnitArt(R.queue, true);
  R.banner = { text: '第 ' + (idx + 1) + ' / ' + R.waveTotal + ' 波', t0: performance.now() };
  pushLog('第 ' + (idx + 1) + ' 波进场');
}

/* ---------- 9. 资源产出：包装 commitClear 采集每格类型 ---------- */
var _rpgCommitClear = commitClear;
commitClear = function(cells, round, log, rec, label){
  var i, k, t;
  var cnt = { energy: 0, armor: 0, parts: 0 };
  for (i = 0; i < cells.length; i++){
    k = cells[i].split(',');
    t = S.board[+k[0]][+k[1]];
    if (t === 0) cnt.energy++;
    else if (t === 1) cnt.armor++;
    else if (t === 2) cnt.parts++;
  }
  var gain = _rpgCommitClear.apply(null, arguments);
  var inTool = R.inTool !== null && R.inTool !== undefined;
  if (gain > 0 && !inTool && (cnt.energy + cnt.armor + cnt.parts) > 0){
    var r = Math.max(1, round || 1);
    var mult = ((CFG.cascade[r - 1] !== undefined ? CFG.cascade[r - 1] : CFG.cascade[CFG.cascade.length - 1])
             + (R.cascadeBonus || 0)) * multYield();
    addYield(cnt, mult);
    multBump(r);
  }
  return gain;
};

function addYield(cnt, mult){
  var ym = (R.mod && R.mod.yieldMul) || {};
  var ye = ym.energy === undefined ? 1 : ym.energy;
  var ya = ym.armor === undefined ? 1 : ym.armor;
  var yp = ym.parts === undefined ? 1 : ym.parts;
  R.pending.energy += cnt.energy * CFG_YIELD.energy * mult * ye;
  R.pending.armor  += cnt.armor  * CFG_YIELD.armor  * mult * ya;
  R.pending.parts  += cnt.parts  * CFG_YIELD.parts  * mult * yp;
  R.cellsThisTurn = (R.cellsThisTurn || 0) + cnt.energy + cnt.armor + cnt.parts;
  R.lastYield = { energy: cnt.energy, armor: cnt.armor, parts: cnt.parts, mult: mult };
}

/* ---------- 10. 分配：护甲进公共盾；零件/能量按"线权重 + 进度"灌私有槽 ----------
   5 人版：原来是"2 人轮转"，人一多就会有人永远轮不到。
   现在每步按 (已充能比例 / 线权重) 升序排，先灌进度最低的；
   权重照 GDD §7：肉盾 1.0 / 近战 0.8 / 远程 1.0 / 魔法 1.2 / 增益 1.0。 */
var EAT_WEIGHT = { tank: 1.0, blade: 0.8, shot: 1.0, hex: 1.2, care: 1.0 };
function eatersOf(res){
  var out = [];
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (u && u.alive && u.eats === res) out.push(u);
  }
  out.sort(function(a, b){
    var wa = EAT_WEIGHT[a.cls] || 1, wb = EAT_WEIGHT[b.cls] || 1;
    var ra = (a.charge || 0) / Math.max(1, a.need || 1) / wa;
    var rb = (b.charge || 0) / Math.max(1, b.need || 1) / wb;
    if (ra !== rb) return ra - rb;
    return (a.slot || 0) - (b.slot || 0);
  });
  return out;
}

function distributeResource(res, amount){
  if (amount <= 0) return;
  var eaters = eatersOf(res);
  var bank = res === 'parts' ? 'parts' : 'energy';
  if (!eaters.length){
    R[bank] = clamp(R[bank] + amount, 0, res === 'parts' ? R.partsMax : R.energyMax);
    return;
  }
  /* 按优先级依次灌满，剩下的进公共池 */
  for (var i = 0; i < eaters.length && amount > 0.01; i++){
    var u = eaters[i];
    var need = u.need - u.charge;
    if (need <= 0) continue;
    var give = Math.min(need, amount);
    u.charge += give;
    amount -= give;
    if (u.charge >= u.need - 0.001){ u.charge = u.need; u.ready = true; }
  }
  R.cursor[res] = (R.cursor[res] || 0) + 1;
  if (amount > 0.01) R[bank] = clamp(R[bank] + amount, 0, res === 'parts' ? R.partsMax : R.energyMax);
}

/* ---------- 11. 我方行动 ---------- */
function aliveEnemies(){
  var out = [];
  for (var i = 0; i < R.enemies.length; i++) if (R.enemies[i].alive) out.push(R.enemies[i]);
  return out;
}

function weakestEnemy(){
  var list = aliveEnemies(), best = null;
  for (var i = 0; i < list.length; i++) if (!best || list[i].hp < best.hp) best = list[i];
  return best;
}

/* ---------- 倍率滚雪球（B） ----------
   · 每打出一段连锁就涨：+0.10 × 连锁层数（上限 ×4）
   · 敌人打穿护甲、真的掉血 → 衰减 25%（不清零，避免一崩到底）
   · 每波开始归 1（波间可以花钱锁一半带进下一波）
   倍率作用于伤害 100%，作用于资源产出只有 50%（免得棋盘被喂爆）。 */
var MULT_CAP = 3.2;
var MULT_DECAY = 0.75;
var MULT_PER_CHAIN = 0.08;
var MULT_RES_RATIO = 0.5;

function multNow(){ return (R.mult === undefined || R.mult === null) ? 1 : R.mult; }

function multBump(chainLevel){
  var before = multNow();
  var add = MULT_PER_CHAIN * Math.max(1, chainLevel || 1);
  R.mult = Math.min(MULT_CAP, before + add);
  if (R.mult > before) R.multPop = performance.now() + 260;
  return R.mult;
}

function multBreak(){
  var before = multNow();
  if (before <= 1) return;
  R.mult = Math.max(1, before * MULT_DECAY);
  R.multHurt = performance.now() + 420;
  if (before - R.mult > 0.15) floatText('倍率 −', W / 2, floorRect().top + 52, C.bad);
}

function multYield(){ return 1 + (multNow() - 1) * MULT_RES_RATIO; }

/* ---------- 天赋（P0） ----------
   一只仓鼠最多 3 条天赋，每条 1–3 级；数值全部来自 game.json 的 rules.talents。
   设计约束：不参与乘区叠加（减伤加法、穿甲按比例无视护甲）。 */
var TALENT_DEF = (RULES && RULES.talents) ? RULES.talents : {};

function talentOf(u, id){
  if (!u || !u.talents) return 0;
  for (var i = 0; i < u.talents.length; i++){
    if (u.talents[i] && u.talents[i].id === id) return u.talents[i].lv || 1;
  }
  return 0;
}

/* 取某条天赋在当前等级的数值对象 */
function talentData(u, id){
  var lv = talentOf(u, id);
  if (!lv) return null;
  var def = TALENT_DEF[id];
  if (!def || !def.levels) return null;
  return def.levels[Math.min(def.levels.length, lv) - 1];
}

/* 该单位自己对某类效果的取值（供 combat 各点调用） */
function talentSum(u, id, field){
  var d = talentData(u, id);
  return (d && typeof d[field] === 'number') ? d[field] : 0;
}

/* ---------- 属性层（S1）：物攻 / 法强 / 物抗 / 魔抗 ----------
   物理：先扣护甲（我方）或先破箱（敌方），再按物抗减伤
   魔法：绕过护甲与箱子，按魔抗减伤 */
function statCfg(line){
  var t = (RULES && RULES.ratStats) || {};
  return t[line] || t.none || { magMul: 0.8, resP: 0, resM: 0 };
}

/* 我方单位：法强 = 基础伤害 × 职业法强倍率 */
function unitMag(u){
  if (!u) return 0;
  var line = (u.line || (u.rat && u.rat.line) || 'none');
  return Math.max(1, Math.round((u.baseDmg || 0) * statCfg(line).magMul));
}

/* 我方抗性（物理 / 魔法） */
function unitRes(u, kind){
  var cfg = statCfg((u && u.line) || 'none');
  return kind === 'mag' ? (cfg.resM || 0) : (cfg.resP || 0);
}

/* 敌方抗性 */
function foeRes(foe, kind){
  var tbl = (RULES && RULES.foeRes) || {};
  var r = tbl[(foe && foe.type) || 'crate'] || {};
  var base = kind === 'mag' ? (r.resM || 0) : (r.resP || 0);
  if (foe && foe.resPDelta && kind !== 'mag') base += foe.resPDelta;
  return Math.max(-0.5, Math.min(0.9, base));
}

function hurtFoe(foe, dmg, pierce, attacker, kind){
  if (!foe || !foe.alive) return;
  kind = kind || 'phys';
  /* 穿甲：按比例无视护甲；Ⅱ级起附带暴击 */
  if (attacker){
    var pi = talentSum(attacker, 'shot', 'pierce');
    if (pi > 0) pierce = pierce || (Math.random() < pi);
    var cr = talentSum(attacker, 'shot', 'crit')
           + ((attacker.critUntil && performance.now() < attacker.critUntil) ? (attacker.critPct || 0) : 0);
    if (cr > 0 && Math.random() < cr){
      dmg = dmg * 1.6;
      floatText('暴击!', stageXOf(foe, true), stageYOf(foe, true) - 16, C.amber, true);
    }
  }
  var left = Math.round(dmg * (R.buffDmgMul || 1) * multNow());   // 波间补给 + 倍率（B）
  if (foe.box > 0 && !pierce && kind !== 'mag'){   // 纸箱：只挡物理；魔法直接穿过
    foe.box--;
    /* 破箱即「急躁」：出手间隔 −13% */
    foe.chargeMs = Math.round(foe.chargeMs * 0.87);
    foe.rage = 1;
    floatText('破箱', stageXOf(foe, true), stageYOf(foe, true), C.amber);
    juice('break');
    return;
  }
  /* 抗性减伤 */
  left = Math.max(1, Math.round(left * (1 - foeRes(foe, kind))));
  foe.hp -= left;
  R.dmgDealt += left;
  R.kindSeen = kind;
  applyEmber(attacker, foe, performance.now());
  foe.flash = performance.now() + 180;
  damageFloat(Math.round(left), stageXOf(foe, true), stageYOf(foe, true),
              kind === 'mag' ? 'mag' : (left >= 20 ? 'crit' : (pierce ? 'pierce' : 'hit')), left >= 10);
  juice(left >= 20 ? 'crit' : (left >= 10 ? 'hitBig' : 'hit'));
  if (foe.hp <= 0){
    foe.alive = false;
    R.kills++;
    pushLog(foe.name + ' 被击退');
    /* 稀有掉落（C）：boss 必掉，其它 10% */
    var dropChance = foe.boss ? 1 : 0.10;
    if (Math.random() < dropChance && typeof addCoins === 'function'){
      var gain = (foe.boss ? 40 : 25) * (foe.elite ? 2 : 1);
      addCoins(gain);
      floatText('掉落 +' + gain, stageXOf(foe, true), stageYOf(foe, true) - 12, C.amber, true);
      sfx('pick');
    }
    /* 嗜血：击杀回血（溢出转护盾，避免浪费） */
    if (attacker){
      var leech = talentSum(attacker, 'blade', 'heal');
      if (leech > 0 && attacker.alive){
        var healed2 = Math.min(attacker.hpMax - attacker.hp, leech);
        if (healed2 > 0){
          attacker.hp += healed2;
          floatText('+' + Math.round(healed2), stageXOf(attacker, false), stageYOf(attacker, false), '#8ee0a8');
        }
        var spill2 = leech - healed2;
        if (spill2 > 0) R.armor = clamp(R.armor + spill2, 0, R.armorMax);
      }
    }
    sfx('down');
    promoteFromQueue();
  }
}

function promoteFromQueue(){
  if (!R.queue.length) return;
  for (var i = 0; i < R.enemies.length; i++){
    if (!R.enemies[i].alive){
      var next = R.queue.shift();
      next.slot = i;
      R.enemies[i] = next;
      pushLog(next.name + ' 补位进场');
      return;
    }
  }
  if (R.enemies.length < (CHAPTER.onField || 2)){
    var extra = R.queue.shift();
    extra.slot = R.enemies.length;
    R.enemies.push(extra);
  }
}

function weakestAlly(){
  var best = null;
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (u && u.alive && (!best || u.hp < best.hp)) best = u;
  }
  return best;
}

/* 一次出手：有强化弹（资源灌满过）就用 act 的强化值，否则用 baseDmg 的基础值。
   也就是说"没资源也能打，只是打得弱"——消除是加强，不是开关。 */
function unitStrike(u, empowered){
  if (!u || !u.alive) return;
  var now = performance.now();
  u.actFlash = now + 22
  u.animStrike = now;
  var act = u.act || null;
  var dmg = empowered && act ? act.dmg : (u.baseDmg || 0);
  if (dmg <= 0) return;
  if (act && act.kind === 'heal'){
    var ally = weakestAlly();
    if (ally){
      var before = ally.hp;
      var overflowRate = talentSum(u, 'care', 'overflow');
      ally.hp = Math.min(ally.hpMax, ally.hp + dmg);
      var healed = ally.hp - before;
      if (healed > 0) floatText('+' + Math.round(healed), stageXOf(ally, false), stageYOf(ally, false), '#8ee0a8');
      /* 复苏：治疗溢出按比例转护盾 */
      if (overflowRate > 0){
        var spill = (dmg - healed) * overflowRate;
        if (spill > 0.5){
          R.armor = clamp(R.armor + spill, 0, R.armorMax);
          floatText('盾 +' + Math.round(spill), stageXOf(ally, false), stageYOf(ally, false) - 12, '#9fc6ff');
        }
      }
    }
    if (empowered && act.armor) R.armor = clamp(R.armor + act.armor, 0, R.armorMax);
  } else if (act && act.kind === 'aoe' && empowered){
    var list = aliveEnemies();
    var aoeKind = (u && u.line === 'hex') ? 'mag' : 'phys';
    var aoeDmg = (aoeKind === 'mag') ? Math.round(unitMag(u) * (dmg / Math.max(1, u.baseDmg || 1))) : dmg;
    for (var i = 0; i < list.length; i++) hurtFoe(list[i], aoeDmg, false, u, aoeKind);
  } else {
    var foe = weakestEnemy();
    /* 魔法系（hex）用强化弹时按魔法结算，伤害走"法强"换算；其余按物理 */
    var atkKind = (u && u.line === 'hex' && empowered) ? 'mag' : 'phys';
    var finalDmg = dmg;
    if (atkKind === 'mag'){
      finalDmg = Math.round(unitMag(u) * (dmg / Math.max(1, u.baseDmg || 1)));
    }
    if (foe) hurtFoe(foe, finalDmg, !!(act && act.pierce), u, atkKind);
  }
  if (empowered) floatText('强化', stageXOf(u, false), stageYOf(u, false) - 14, C.amber);
  /* 治疗走专用音，攻击还是走消除/连击音（打得响就等于打中了） */
  if (act && act.kind === 'heal') sfx('heal');
  else sfx(empowered ? 'combo' : 'pop', { round: 1 });
}

/* 兼容旧调用点：按资源"行动"改成"点燃强化弹" */
function unitAct(u){
  if (!u || !u.alive) return;
  u.empowered = true;
}

/* 我方自动战斗：每个单位按自己的 atkMs 出手，与玩家消不消无关 */
/* ---------- 技能（S4：物理系先落地） ----------
   每只鼠的技能各自冷却；到点从"就绪列表"里挑一个（伤害优先、等级高优先）。
   一次只放一个；技能与普攻是两套独立计时。 */
function skillTable(){
  return (RULES.skills && RULES.skills.list) || {};
}
function skillsEnabled(){
  return !!(RULES.skills && RULES.skills.enable);
}
function unitSkills(u){
  if (!u) return [];
  if (!u.skills){
    var src = (u.rat && u.rat.skills) || [];
    u.skills = src.map(function(t){ return { id: t.id, lv: t.lv || 1, readyAt: 0 }; });
  }
  return u.skills;
}
function skillCfg(id){ return skillTable()[id] || null; }
function skillLvVal(arr, lv){ return arr ? (arr[Math.min(arr.length, Math.max(1, lv)) - 1] || arr[0]) : 0; }

/* 物理技能的目标挑选 */
/* 增益技能的目标：先自己，再按血量从低到高（范围随等级 1 / 2 / 5） */
function pickBuffTargets(u, n){
  var list = [];
  for (var i = 0; i < R.units.length; i++){
    var a = R.units[i];
    if (a && a.alive) list.push(a);
  }
  list.sort(function(a, b){
    if (a === u) return -1;
    if (b === u) return 1;
    return (a.hp / Math.max(1, a.hpMax)) - (b.hp / Math.max(1, b.hpMax));
  });
  return list.slice(0, Math.max(1, n));
}

/* 放增益技能 */
function castBuffSkill(u, sk, def, lv){
  var n = skillLvVal(def.targets, lv);
  var pct = skillLvVal(def.mul, lv);
  var now = performance.now();
  var targets = pickBuffTargets(u, n);
  if (!targets.length) return false;

  for (var i = 0; i < targets.length; i++){
    var t = targets[i];
    if (sk.id === 'huangyou'){
      /* 护甲：立刻补护甲池 + 4 秒内上限提升 */
      var add = Math.round(R.armorMax * pct);
      R.armor = clamp(R.armor + add, 0, R.armorMax * (1 + pct));
      t.armorUntil = now + 4000;
      t.armorPct = pct;
    } else if (sk.id === 'jiaban'){
      t.asUntil = now + 5000;
      t.asPct = pct;
    } else if (sk.id === 'xingyun'){
      t.critUntil = now + 5000;
      t.critPct = pct;
    } else if (sk.id === 'tangfen'){
      var heal = Math.round(t.hpMax * pct);
      var before = t.hp;
      t.hp = Math.min(t.hpMax, t.hp + heal);
      if (t.hp > before){
        floatText('+' + Math.round(t.hp - before), stageXOf(t, false), stageYOf(t, false), '#8ee0a8');
      }
      t.ember = null;
    }
  }

  floatText((def.name || sk.id) + '!', stageXOf(u, false), stageYOf(u, false) - 18, '#79c98a', true);
  var cx = stageXOf(u, false), cy = stageYOf(u, false);
  R.skillFx = R.skillFx || [];
  R.skillFx.push({ t0: now, x: cx, y: cy, dur: 420, col: '#79c98a' });
  sfx('heal');
  return true;
}

function pickSkillTargets(u, sk, n){
  var foes = aliveEnemies();
  if (!foes.length) return [];
  var me = { x: unitX(u), y: unitY(u) };
  var scored = foes.map(function(f){
    var dx = unitX(f) - me.x, dy = unitY(f) - me.y;
    return { f: f, d: Math.sqrt(dx * dx + dy * dy), dy: Math.abs(dy), hp: f.hp };
  });
  if (sk === 'duantou'){
    scored.sort(function(a, b){ return a.hp - b.hp; });        /* 打血最少的 */
  } else if (sk === 'chuanjia'){
    scored.sort(function(a, b){ return a.dy - b.dy || a.d - b.d; }); /* 一条线：纵向最接近 */
  } else {
    scored.sort(function(a, b){ return a.d - b.d; });          /* 最近的 */
  }
  return scored.slice(0, Math.max(1, n)).map(function(o){ return o.f; });
}

/* 放技能 */
function castSkill(u, sk){
  var def = skillCfg(sk.id);
  if (!def) return false;
  var lv0 = Math.max(1, Math.min(3, sk.lv || 1));
  if (def.kind === 'buff') return castBuffSkill(u, sk, def, lv0);
  var lv = Math.max(1, Math.min(3, sk.lv || 1));
  var mul = skillLvVal(def.mul, lv);
  var tgtN = skillLvVal(def.targets, lv);
  var targets = pickSkillTargets(u, sk.id, tgtN);
  if (!targets.length) return false;

  var kind = def.kind || 'phys';
  /* 物理走物攻，魔法走法强（魔法职业法强高，物理职业放魔法就很弱） */
  var power = kind === 'mag' ? unitMag(u) : (u.baseDmg || 1);
  var base = Math.round(power * mul);
  var pierce = (sk.id === 'chuanjia');
  var now2 = performance.now();
  var jumpMul = 1;
  for (var i = 0; i < targets.length; i++){
    var foe = targets[i];
    var dmg = Math.round(base * jumpMul);
    if (sk.id === 'duantou' && foe.hp / Math.max(1, foe.hpMax) < 0.30) dmg = Math.round(dmg * 1.5);
    hurtFoe(foe, dmg, pierce, u, kind);

    /* 魔法附加效果 */
    if (sk.id === 'huoqiu'){
      applySkillBurn(foe, 2 + (lv - 1), 3000, now2);            /* 灼烧 2/3/4 每秒 */
    } else if (sk.id === 'bingshuang'){
      foe.slowPct = 0.05 + (lv - 1) * 0.035;                     /* −5% / −8.5% / −12% */
      foe.slowUntil = now2 + 3000;
    } else if (sk.id === 'shandian'){
      jumpMul *= 0.85;                                           /* 每跳 −15% */
    }
    /* 冲击钻：击退 8px */
    if (sk.id === 'chongya'){
      var dir = unitX(foe) >= unitX(u) ? 1 : -1;
      foe.x = clamp(foe.x + dir * 8, floorRect().left + 12, floorRect().right - 12);
    }
  }

  /* 表现：技能名 + 一圈冲击环 */
  var name = def.name || sk.id;
  floatText(name, stageXOf(u, false), stageYOf(u, false) - 12, '#ffd166', false);
  var cx = stageXOf(u, false), cy = stageYOf(u, false);
  R.skillFx = R.skillFx || [];
  R.skillFx.push({ t0: performance.now(), x: cx, y: cy, dur: 320, col: def.kind === 'mag' ? '#8fb8ff' : '#ffd166' });
  juice('crit');
  return true;
}

/* 每帧推进技能冷却 */
function skillTick(dtMs, now){
  if (!skillsEnabled()) return;
  var cdMul = (RULES.skills && typeof RULES.skills.cdMul === 'number') ? RULES.skills.cdMul : 1;
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (!u || !u.alive) continue;
    var list = unitSkills(u);
    for (var k = 0; k < list.length; k++){
      var sk = list[k];
      var def = skillCfg(sk.id);
      if (!def) continue;
      if (sk.readyAt === 0 || sk.readyAt === undefined) sk.readyAt = now + 900;   /* 开场稍等 */
      if (now < sk.readyAt) continue;
      if (castSkill(u, sk)){
        var cd = skillLvVal(def.cd, Math.max(1, Math.min(3, sk.lv || 1))) * cdMul;
        sk.readyAt = now + cd;
        break;                                  /* 一次只放一个 */
      }
    }
  }
}

function unitTick(dtMs){
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (!u || !u.alive || !u.atkMs) continue;
    ensurePos(u, i, false);
    /* 抬手/冷却的算法不变，但近战必须先走到够得着；够不着时时间照样走，
       只是不进入抬手 —— 走位由 walkTick 负责，所以不会白等太久。 */
    var asMul = (u.asUntil && performance.now() < u.asUntil) ? (1 - (u.asPct || 0)) : 1;
    if (u.slowAtkUntil && performance.now() < u.slowAtkUntil) asMul *= (1 + (u.slowAtkPct || 0));
    var budget = dtMs * (R.buffAtkMul || 1) / Math.max(0.4, asMul);
    var guard = 0;
    while (budget > 0 && u.alive && guard++ < 6){
      if (u.windup > 0){
        if (budget < u.windup){ u.windup -= budget; break; }
        budget -= u.windup; u.windup = 0;
        releaseUnit(u);
        continue;
      }
      var rest = u.atkMs - u.timerMs;
      if (budget < rest){ u.timerMs += budget; budget = 0; break; }
      budget -= rest; u.timerMs = 0;
      if (!reachable(u, false)){ u.timerMs = Math.min(u.atkMs - 1, u.timerMs); break; }
      u.windup = STAGE.windupMs;
    }
    if (S.phase !== 'play') return;
  }
}

/* 公共炮台：余量零件自动开火 */
function turretTick(){
  var guard = 0;
  while (R.parts >= CFG.turret.cost && guard++ < 6){
    R.parts -= CFG.turret.cost;
    var foe = weakestEnemy();
    if (!foe) break;
    hurtFoe(foe, CFG.turret.dmg, false);
  }
}

/* ---------- 12. 敌方行动 ----------
   伤害只落在仓鼠身上：没有核心血池。全队阵亡就是输。 */
function hurtTeam(dmg, pierce){
  var alive = [];
  var tank = null, front = null;
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (!u || !u.alive) continue;
    alive.push(u);
    if (!tank && u.tank) tank = u;
    if (!front && !u.tank) front = u;
  }
  if (!alive.length){ loseTeam(); return; }

  var rest = dmg;
  if (tank){
    var pull = dmg * CFG.tankRedirect;
    applyUnitDamage(tank, Math.round(pull * (1 - CFG.tankReduce)), pierce);
    if (tank.thorns){ var foe = weakestEnemy(); if (foe) hurtFoe(foe, tank.thorns, true); }
    rest = dmg - Math.round(pull * (1 - CFG.tankReduce));
  }
  var target = front || tank;
  if (target && target.alive) applyUnitDamage(target, rest, pierce);
  if (!aliveUnits().length) loseTeam();
}

function aliveUnits(){
  var out = [];
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (u && u.alive) out.push(u);
  }
  return out;
}

function loseTeam(){
  if (S.phase !== 'play') return;
  S.phase = 'lose';
  pushLog('全队阵亡，工厂失守');
  sfx('lose');
}

function applyUnitDamage(u, dmg, pierce, kind){
  kind = kind || 'phys';
  var left = dmg;
  /* 硬化：直接减伤（加法，不进乘区） */
  var harden = talentSum(u, 'tank', 'dr');
  if (harden > 0) left = left * (1 - Math.min(0.6, harden));
  /* 抗性：物理走物抗、魔法走魔抗 */
  var res = unitRes(u, kind);
  if (res > 0) left = left * (1 - Math.min(0.6, res));
  var pierceAmt = (typeof pierce === 'number') ? pierce : (pierce ? 1 : 0);
  if (pierceAmt < 1 && kind !== 'mag' && R.armor > 0){
    var absorb = Math.min(R.armor, left * (1 - pierceAmt));
    R.armor -= absorb;
    left -= absorb;
    if (absorb > 0){
      floatText('盾 -' + Math.round(absorb), stageXOf(u, false), stageYOf(u, false) - 10, '#9fc6ff');
      sfx('shield');
    }
  }
  if (left <= 0) return;
  u.hp -= left;
  multBreak();                        /* 真掉血才衰减：护盾吃掉不算 */
  u.flash = performance.now() + 220;
  damageFloat(Math.round(left), stageXOf(u, false), stageYOf(u, false),
              left >= 12 ? 'crit' : 'hit', left >= 10);
  juice(left >= 12 ? 'hitBig' : 'hit');
  if (u.hp <= 0){
    u.hp = 0; u.alive = false; u.ready = false;
    pushLog(u.name + ' 累趴下场');
    floatText('累趴', stageXOf(u, false), stageYOf(u, false) - 14, C.bad);
    sfx('down');
  }
}

function foeAct(foe){
  foe.charge = 0;
  foe.timerMs = 0;
  foe.actFlash = performance.now() + 260;
  foe.animStrike = performance.now();   /* 出手帧 */
  if (foe.atk > 0) hurtTeam(foe.atk, foe.pierce);
  if (foe.steal > 0) stealCells(foe.steal, foe);
  sfx(foe.atk > 0 ? 'invalid' : 'reshuffle');
}

/* 拾荒鼠：把盘上几格换成别的零食 —— 直接打乱你的颜色计划，不造成伤害 */
function stealCells(n, foe){
  if (S.anim) return;
  var cells = [];
  for (var r = 0; r < N; r++){
    for (var c = 0; c < N; c++){
      if (S.board[r][c] !== null) cells.push([r, c]);
    }
  }
  if (!cells.length) return;
  var took = 0;
  for (var i = 0; i < n && cells.length; i++){
    var pick = Math.floor(Math.random() * cells.length);
    var cell = cells.splice(pick, 1)[0];
    var old = S.board[cell[0]][cell[1]];
    var t = Math.floor(Math.random() * 3);
    if (t === old) t = (t + 1) % 3;
    S.board[cell[0]][cell[1]] = t;
    took++;
  }
  if (took > 0){
    floatText('偷走 ' + took + ' 格', stageXOf(foe, true), stageYOf(foe, true) - 16, '#ffb26b', true);
    pushLog(foe ? foe.name + ' 改写了 ' + took + ' 格' : '盘面被改写');
    sfx('reshuffle');
    // 改写后可能出现现成的三连，交给下一手结算，不在这里触发连锁
  }
}

/* 步数制（旧）：走一步 +1 充能。CFG.realtime 打开时不走这条。 */
function enemyTick(){
  for (var i = 0; i < R.enemies.length; i++){
    var foe = R.enemies[i];
    if (!foe.alive) continue;
    foe.charge++;
    if (foe.charge >= foe.chargeMax){ foeAct(foe); }
  }
}

/* 实时制：敌方按毫秒充能，与玩家消不消无关 —— 你磨蹭，它就多打。
   只在"关卡进行中"走表；结算、切后台、标题页都停表。 */
/* 走位：双方都真的往对面挪。近战/肉盾贴上去，中距离压一半，远程守原位。
   走位只影响"够不够得着"，不额外吃出手时间；够不着时出手会先攒着（见 unitTick）。 */
function targetOf(o, isFoe){
  var list = isFoe ? R.units : R.enemies;
  var best = null, bestD = 1e9;
  for (var i = 0; i < list.length; i++){
    var t = list[i];
    if (!t || !t.alive) continue;
    var d = Math.abs(unitX(t) - unitX(o));
    if (d < bestD){ bestD = d; best = t; }
  }
  return best;
}

/* 单位之间不要叠在一起：最小间距 = 精灵尺寸 × rules.minSep（默认 0.72，即最多重叠 28%）。
   做 3 轮松弛，每轮只推一半缺口，避免抖动；推完再夹回地板与守卫带。 */
function separateUnits(f){
  var groups = [];
  var allies = [], foes = [];
  for (var i0 = 0; i0 < R.units.length; i0++){ if (R.units[i0] && R.units[i0].alive) allies.push(R.units[i0]); }
  for (var j0 = 0; j0 < R.enemies.length; j0++){ if (R.enemies[j0] && R.enemies[j0].alive) foes.push(R.enemies[j0]); }
  groups.push(allies);
  groups.push(foes);

  var factor = (RULES && typeof RULES.minSep === 'number') ? RULES.minSep : 0.82;
  var minSep = STAGE2.sprite * Math.max(0.5, Math.min(0.95, factor));
  var guard = Math.round(STAGE2.sprite * 0.45);
  var minX = f.left + guard, maxX = f.right - guard;

  var i, j;
  for (var gi = 0; gi < groups.length; gi++){
  var all = groups[gi];
  if (all.length < 2) continue;
  for (var iter = 0; iter < 3; iter++){
    var moved = false;
    for (i = 0; i < all.length; i++){
      for (j = i + 1; j < all.length; j++){
        var a = all[i], b = all[j];
        var dx = (b.x - a.x), dy = (b.y - a.y);
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d >= minSep) continue;
        if (d < 0.001){ dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d = Math.sqrt(dx * dx + dy * dy) || 1; }
        var push = (minSep - d) * 0.5;
        var ux = dx / d, uy = dy / d;
        a.x = clamp(a.x - ux * push, minX, maxX);
        a.y = clamp(a.y - uy * push, f.top + 6, f.bottom - 2);
        b.x = clamp(b.x + ux * push, minX, maxX);
        b.y = clamp(b.y + uy * push, f.top + 6, f.bottom - 2);
        moved = true;
      }
    }
    if (!moved) break;
  }
  }
}

/* ---------- 走位（规整版） ----------
   目标：两队各自保持横排阵型推进，不交叉、不绕后、不挤成一团。
   规则：
   1) 每只鼠有自己的车道：槽位 0/1 第 1 排，2/3 第 2 排，4/5 第 3 排；
   2) 车道 y 取阵型表里的固定值，不再追着敌人上下跑；
   3) 横向只朝"自己该到的 x"移动：近战贴到敌人前沿前一个身位，远程留在本方半场；
   4) 同一车道内不许超车：x 不能越过同车道排在自己前面的那只；
   5) 双方只在本方半场 + 中线缓冲区活动，不会绕到对方背后。
   把 rules.orderedMove 置为 false 可退回旧的"追最近敌人"逻辑。 */
function laneRowOf(o){
  var slot = (o && typeof o.slot === "number") ? o.slot : 0;
  return Math.floor(slot / 2);
}
function laneYOf(o, isFoe, f){
  var row = laneRowOf(o);
  var rows = [0.40, 0.66, 0.92];
  var frac = rows[Math.min(rows.length - 1, row)];
  return clamp(f.top + (f.bottom - f.top) * frac, f.top + 8, f.bottom - 2);
}
function frontXOf(isFoe){
  var best = null;
  var list = isFoe ? R.units : R.enemies;
  for (var i = 0; i < list.length; i++){
    var u = list[i];
    if (!u || !u.alive) continue;
    var x = unitX(u);
    if (best === null) best = x;
    else best = isFoe ? Math.max(best, x) : Math.min(best, x);
  }
  return best;
}

function walkTick(dtMs){
  var step = STAGE.speed * dtMs / 1000;
  var f = floorRect();
  var ordered = !(RULES && RULES.orderedMove === false);
  var guard = Math.round(STAGE2.sprite * 0.45);
  var minX = f.left + guard, maxX = f.right - guard;
  var midX = (f.left + f.right) / 2;

  function move(o, isFoe, idx, total){
    if (!o || !o.alive) return;
    var _px = o.x, _py = o.y;
    ensurePos(o, idx, isFoe, total);
    ensurePosClamped(o, f);

    if (!ordered){
      var t0 = targetOf(o, isFoe);
      if (!t0){
        o.x = clamp(o.x + (isFoe ? -step : step) * 0.5, f.left, f.right);
        return;
      }
      var wantOld = o.range === "far" ? STAGE2.reach * 1.8
                   : (o.range === "mid" ? STAGE2.reach * 1.25 : STAGE2.reach * 0.82);
      wantOld = Math.min(wantOld, (f.right - f.left) * 0.38);
      var laneOld = ((o.slot || 0) - 2) * 12 * (isFoe ? -1 : 1);
      var laneYO = clamp(unitY(t0) + laneOld, f.top, f.bottom);
      var dxO = unitX(t0) - o.x, dyO = laneYO - o.y;
      var dO = Math.sqrt(dxO * dxO + dyO * dyO) || 1;
      var errO = dO - wantOld;
      if (Math.abs(errO) < 3) return;
      var dirO = errO > 0 ? 1 : -1;
      o.x = clamp(o.x + (dxO / dO) * step * dirO, minX, maxX);
      o.y = clamp(o.y + (dyO / dO) * step * dirO, f.top + 6, f.bottom - 2);
      if (Math.abs(o.x - _px) + Math.abs(o.y - _py) > 0.35) o.movedAt = performance.now();
      return;
    }

    var front = frontXOf(isFoe);
    var targetX;
    if (front === null){
      targetX = isFoe ? midX + 40 : midX - 40;
    } else {
      var reach = STAGE2.reach;
      if (o.range === "far"){
        targetX = isFoe ? Math.max(front + reach * 1.5, midX + 20)
                        : Math.min(front - reach * 1.5, midX - 20);
      } else if (o.range === "mid"){
        targetX = isFoe ? Math.max(front + reach * 0.95, midX + 10)
                        : Math.min(front - reach * 0.95, midX - 10);
      } else {
        targetX = isFoe ? front + reach * 0.78 : front - reach * 0.78;
      }
    }
    if (isFoe) targetX = Math.max(targetX, midX + 6);
    else targetX = Math.min(targetX, midX - 6);

    var gap = Math.round(STAGE2.sprite * 0.82);
    var list = isFoe ? R.enemies : R.units;
    /* 同车道里"更靠敌方"的那只当排头；自己不是排头就被它压住，不许超车 */
    var aheadX = null, selfIsAhead = true;
    for (var i = 0; i < list.length; i++){
      var mate = list[i];
      if (!mate || !mate.alive || mate === o) continue;
      if (laneRowOf(mate) !== laneRowOf(o)) continue;
      var mx = unitX(mate);
      if (isFoe){
        if (mx < unitX(o) - 0.5){ selfIsAhead = false; if (aheadX === null || mx < aheadX) aheadX = mx; }
      } else {
        if (mx > unitX(o) + 0.5){ selfIsAhead = false; if (aheadX === null || mx > aheadX) aheadX = mx; }
      }
    }
    if (!selfIsAhead && aheadX !== null){
      if (isFoe) targetX = Math.max(targetX, aheadX + gap);
      else targetX = Math.min(targetX, aheadX - gap);
    }

    var laneY = laneYOf(o, isFoe, f);
    var dx = targetX - o.x;
    var dy = laneY - o.y;
    var movedX = Math.abs(dx) > 1.5 ? clamp(dx, -step, step) : 0;
    var movedY = Math.abs(dy) > 1.5 ? clamp(dy, -step * 0.6, step * 0.6) : 0;
    o.x = clamp(o.x + movedX, minX, maxX);
    o.y = clamp(o.y + movedY, f.top + 6, f.bottom - 2);
    if (Math.abs(o.x - _px) + Math.abs(o.y - _py) > 0.35) o.movedAt = performance.now();
  }

  for (var i = 0; i < R.units.length; i++) move(R.units[i], false, i, CFG.slots || 5);
  for (var j = 0; j < R.enemies.length; j++) move(R.enemies[j], true, j, R.enemies.length);
  separateUnits(f);
}

/* ---------- 余烬：给目标挂灼烧，由 talentTick 每秒结算 ---------- */
function applyEmber(attacker, foe, now){
  if (!attacker || !foe || !foe.alive) return;
  var per = talentSum(attacker, 'hex', 'burn');
  if (per <= 0) return;
  var maxStack = talentSum(attacker, 'hex', 'stack') || 1;
  var amp = talentSum(attacker, 'hex', 'amp');
  foe.ember = foe.ember || { per: 0, until: 0, next: 0, amp: 0, stacks: 0 };
  foe.ember.stacks = Math.min(maxStack, (foe.ember.stacks || 0) + 1);
  foe.ember.per = per;
  foe.ember.amp = amp;
  foe.ember.until = now + 3000;
  if (!foe.ember.next) foe.ember.next = now + 1000;
}

/* 技能点燃：写入同一套 ember 计时（和余烬天赋共用结算） */
function applySkillBurn(foe, per, ms, now){
  if (!foe || !foe.alive) return;
  foe.ember = foe.ember || { per: 0, until: 0, next: 0, amp: 0, stacks: 1 };
  foe.ember.per = Math.max(foe.ember.per || 0, per);
  foe.ember.until = Math.max(foe.ember.until || 0, now + ms);
  foe.ember.stacks = Math.max(1, foe.ember.stacks || 1);
  if (!foe.ember.next) foe.ember.next = now + 1000;
}

/* 拾荒鼠：命中偷钱（记在 foe.stolen），到场 15 秒撤离带走赃款 */
function thiefTick(now){
  for (var i = 0; i < R.enemies.length; i++){
    var f = R.enemies[i];
    if (!f || !f.alive || f.type !== 'thief') continue;
    if (!f.fleeAt) f.fleeAt = now + 15000;
    if (now >= f.fleeAt){
      f.alive = false;
      f.hp = 0;
      pushLog('拾荒鼠撤离，带走 ' + (f.stolen || 0) + ' 金币');
      floatText('撤离 −' + (f.stolen || 0), stageXOf(f, true), stageYOf(f, true), '#d96d55', true);
      checkBattleEnd();
    }
  }
}

/* 命中偷钱（调用点在 foeAct 之后统一处理） */
function thiefSteal(foe){
  if (!foe || foe.type !== 'thief' || !foe.alive) return;
  var cap = (RULES.enemy && RULES.enemy.thief && RULES.enemy.thief.stealCap) || 25;
  if ((foe.stolen || 0) >= cap) return;
  var n = 2 + Math.floor(Math.random() * 4);          /* 2–5 */
  n = Math.min(n, cap - (foe.stolen || 0));
  if (typeof addCoins === 'function') addCoins(-n);
  foe.stolen = (foe.stolen || 0) + n;
  floatText('−' + n + '金币', stageXOf(foe, true), stageYOf(foe, true) - 10, '#ffd166', true);
}

/* 质检机：血量 ≤50% 进入"超载"（出手更快，但物抗掉 10%） */
function bossOverload(){
  for (var i = 0; i < R.enemies.length; i++){
    var f = R.enemies[i];
    if (!f || !f.alive || f.type !== 'boss' || f.overload) continue;
    if (f.hp / Math.max(1, f.hpMax) <= 0.5){
      f.overload = 1;
      f.chargeMs = Math.round(f.chargeMs * 0.77);
      f.resPDelta = -0.10;
      pushLog('质检机 超载！');
      R.banner = { text: '质检机 超载！', t0: performance.now(), holdMs: 1600 };
      sfx('elite');
    }
  }
}

/* 喷胶鼠：命中让我方出手变慢 15%（3 秒）；每 12 秒给血最少的同伴回 10% */
function glueTick(now){
  for (var i = 0; i < R.enemies.length; i++){
    var g = R.enemies[i];
    if (!g || !g.alive || g.type !== 'glue') continue;
    if (!g.healAt) g.healAt = now + 12000;
    if (now < g.healAt) continue;
    g.healAt = now + 12000;
    var best = null;
    for (var j = 0; j < R.enemies.length; j++){
      var f = R.enemies[j];
      if (!f || !f.alive) continue;
      if (!best || f.hp / Math.max(1, f.hpMax) < best.hp / Math.max(1, best.hpMax)) best = f;
    }
    if (best){
      var heal = Math.round(best.hpMax * 0.10);
      best.hp = Math.min(best.hpMax, best.hp + heal);
      floatText('+' + heal, stageXOf(best, true), stageYOf(best, true), '#8ee0a8');
    }
  }
}

/* 引信鼠：血量 ≤35% 开始点引信（脚下红圈 1.2 秒），到点炸掉自己并对附近我方造成伤害 */
function blastTick(now){
  for (var i = 0; i < R.enemies.length; i++){
    var f = R.enemies[i];
    if (!f || !f.alive || f.type !== 'blast') continue;
    var lowHp = f.hp / Math.max(1, f.hpMax) <= 0.35;
    if (lowHp && !f.fuseAt){
      f.fuseAt = now + 1200;
      pushLog('引信鼠开始自爆');
      R.banner = { text: '引信鼠开始自爆！', t0: now, holdMs: 1400 };
      sfx('elite');
    }
    if (f.fuseAt && now >= f.fuseAt){
      var dmg = Math.round(f.hpMax * 0.40);
      f.fuseAt = 0;
      f.alive = false;
      f.hp = 0;
      /* 范围伤害：离它近的我方单位吃满，远的减半 */
      var cx = unitX(f), cy = unitY(f);
      for (var u = 0; u < R.units.length; u++){
        var a = R.units[u];
        if (!a || !a.alive) continue;
        var d = Math.sqrt(Math.pow(unitX(a) - cx, 2) + Math.pow(unitY(a) - cy, 2));
        if (d > 95) continue;
        applyUnitDamage(a, d < 55 ? dmg : Math.round(dmg * 0.5), false, 'phys');
      }
      R.blastFx = R.blastFx || [];
      R.blastFx.push({ t0: now, x: cx, y: cy });
      floatText('自爆!', cx, cy - 20, '#ff8a5c', true);
      juice('crit');
      checkBattleEnd();
    }
  }
}

function talentTick(now){
  for (var i = 0; i < R.enemies.length; i++){
    var f = R.enemies[i];
    if (!f || !f.alive || !f.ember) continue;
    if (now > f.ember.until){ f.ember = null; continue; }
    while (now >= f.ember.next && now <= f.ember.until){
      var dmg = f.ember.per * Math.max(1, f.ember.stacks);
      f.hp -= dmg;
      R.dmgDealt += dmg;
      floatText('−' + Math.round(dmg), stageXOf(f, true), stageYOf(f, true) + 6, '#ff9d8a');
      f.ember.next += 1000;
      if (f.hp <= 0) break;
    }
    if (f.hp <= 0 && f.alive){
      f.alive = false;
      f.hp = 0;
      sfx('down');
      checkBattleEnd();
    }
  }
}

function realtimeTick(dtMs){
  skillTick(dtMs, performance.now());
  if (S.phase !== 'play') return;
  try { if (typeof document !== 'undefined' && document.hidden) return; } catch (e) {}
  /* 开场暂停：教学关等玩家第一次成功三消；讲资源时也停住，等玩家点完三页 */
  if (R.tut && (!R.tutSwap || (R.tutRes < 3 && !R.tutUlt))){ updateShots(dtMs); return; }
  if (R.intro){
    if (performance.now() < R.intro.t0 + R.intro.dur){ updateShots(dtMs); return; }
    R.intro = null;
  }
  /* 顿帧：重击的那 40–70ms 全场停一下，打击感全在这一下里 */
  if (R.hitstopUntil && performance.now() < R.hitstopUntil){
    updateShots(dtMs);
    return;
  }
  walkTick(dtMs);
  talentTick(performance.now());
  thiefTick(performance.now());
  bossOverload();
  glueTick(performance.now());
  blastTick(performance.now());
  /* 我方被胶住的减速在这里过期 */
  if (CFG.realtime){
    for (var i = 0; i < R.enemies.length; i++){
      var foe = R.enemies[i];
      if (!foe || !foe.alive) continue;
      if (foe.windup > 0){
        /* 抬手可以被肉盾盾击打断（后续接），现在先把阶段留出来 */
        foe.windup -= dtMs;
        if (foe.windup > 0) continue;
        foe.windup = 0;
        foeAct(foe);
        foe.timerMs = STAGE.windupMs;
        if (S.phase !== 'play') return;
        continue;
      }
      /* 够不着就先攒着，够到了才抬手 */
      var tgt = foe.range === 'far' ? true : reachable(foe, true);
      if (!tgt) continue;
      /* 冰霜减速：出手计时变慢（只刷新不叠加） */
      var slowMul = (foe.slowUntil && performance.now() < foe.slowUntil) ? (1 - (foe.slowPct || 0)) : 1;
      foe.timerMs += dtMs * Math.max(0.5, slowMul);
      if (foe.timerMs >= foe.chargeMs && foe.alive){
        foe.timerMs = 0;
        foe.windup = STAGE.windupMs;
      }
    }
  }
  updateShots(dtMs);
  // 我方也按秒自动出手（双方自动战斗）。没有步数限制，也就不需要回充。
  unitTick(dtMs);
  checkBattleEnd();
}

/* 够不够得着：远程永远够，其余看距离 */
function reachable(o, isFoe){
  var t = targetOf(o, isFoe);
  if (!t) return false;
  if (o.range === 'far') return true;
  var need = STAGE2.reach * (o.range === 'mid' ? 1.7 : 1.4);
  var dx = unitX(t) - unitX(o), dy = unitY(t) - unitY(o);
  return Math.sqrt(dx * dx + dy * dy) <= need;
}

/* 接管渲染帧：dt 由时间戳差算，避免切后台回来一次性补一堆伤害 */
var _rpgFrame = frame;
var _rpgLastTs = 0;
frame = function(ts){
  var now = (ts === undefined || ts === null) ? performance.now() : ts;
  var scale = CFG.timeScale || 1;
  var dt = _rpgLastTs ? Math.min(120, now - _rpgLastTs) : 16;
  _rpgLastTs = now;
  _rpgFrame(ts);
  // 时间缩放只给批量模拟用：dt 乘 scale，clamp 同倍放宽，避免高倍速下一帧被截断
  realtimeTick(Math.min(120 * scale, dt * scale));
};

/* ---------- 13. 一步结束：产出 → 分配 → 行动 → 敌方 ---------- */
function rpgTurn(wasStep){
  if (S.phase !== 'play') return;
  var dmgBefore = R.dmgDealt;
  R.dbg = {
    cells: R.cellsThisTurn || 0,
    pending: { energy: Math.round(R.pending.energy), armor: Math.round(R.pending.armor), parts: Math.round(R.pending.parts) },
    eaters: { parts: eatersOf('parts').length, energy: eatersOf('energy').length },
    units: R.units.map(function(u){ return u ? (u.id + '|' + u.eats + '|' + u.need + '|' + u.alive) : 'null'; })
  };
  R.cellsThisTurn = 0;
  // ① 资源结算（护甲每步有软顶：大消除不该一步把盾补满，否则实时制下永远打不穿）
  var p = R.pending;
  if (p.armor > 0){
    var armorGain = Math.min(p.armor, CFG.armorStepCap || 999);
    R.armor = clamp(R.armor + armorGain, 0, R.armorMax);
    floatText('盾 +' + Math.round(armorGain), stageXOf(null, false), L.giftY + L.giftH - 46, '#9fc6ff');
  }
  distributeResource('parts', p.parts);
  distributeResource('energy', p.energy);
  R.pending = { energy: 0, armor: 0, parts: 0 };

  // ② 我方行动（槽位顺序，每步每单位最多 1 次）
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (!u || !u.alive || !u.ready) continue;
    u.charge -= u.need;
    if (u.charge < 0) u.charge = 0;
    u.ready = false;
    unitAct(u);
  }
  // ③ 公共炮台
  turretTick();

  // ④ 敌方充能：实时制由 frame 的秒表驱动；只在关掉 realtime 时才按步数推进
  if (wasStep && !CFG.realtime) enemyTick();

  // ⑤ 胜负
  checkBattleEnd();
}

/* ---------- 押注：波间可以押一笔金币赌"本波全员无伤" ----------
   押 N → 成功返 2N（净赚 N），任何一只掉血就没收。 */
function betSnapshot(){
  var hp = [];
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    hp.push(u && u.alive ? u.hp : -1);
  }
  return hp;
}

function settleBet(){
  var b = R.bet;
  if (!b || !b.amount) return;
  R.bet = null;
  var hurt = false;
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i], h0 = b.hp[i];
    if (u && u.alive && typeof h0 === 'number' && h0 >= 0){
      if (u.hp < h0 - 0.01) hurt = true;
    } else if (typeof h0 === 'number' && h0 >= 0 && (!u || !u.alive)){
      hurt = true;                       /* 押注期间有人倒下 */
    }
  }
  var y = floorRect().top + 34;
  if (hurt){
    pushLog('押注失手：' + b.amount + ' 金币没收');
    floatText('押注失手 −' + b.amount, W / 2, y, C.bad, true);
    sfx('invalid');
  } else {
    if (typeof addCoins === 'function') addCoins(b.amount * 2);
    pushLog('押注成功：+' + b.amount + ' 金币');
    floatText('押注成功 +' + b.amount, W / 2, y, C.amber, true);
    sfx('pick');
  }
}

function checkBattleEnd(){
  // 唯一的失败条件：我方仓鼠全部阵亡
  if (!aliveUnits().length){ loseTeam(); return; }
  var foes = aliveEnemies().length + R.queue.length;
  if (foes === 0){
    if (typeof settleBet === 'function') settleBet();
    if (R.wave + 1 < R.waveTotal){
      if (shouldPick()) openPick();          // 波间三选一：按 pickEveryN 的间隔给
      else spawnWave(R.wave + 1);            // 不给卡就直接进下一波
    } else if (S.phase === 'play'){
      S.phase = 'win';
      if (R.eventCoin && typeof addCoins === 'function'){
        addCoins(R.eventCoin);
        pushLog('事件奖励：+' + R.eventCoin + ' 金币');
      }
      pushLog('本厂守住了');
      sfx('win');
    }
    return;
  }
  // 没有步数限制：不存在"用尽"这个状态
}

/* 三选一的频次：每 N 波给一次（默认 2 → 5 波里给 2 次：第 2 波后、第 4 波后）。
   pickEveryN = 1 是"每波都给"，0 表示关掉。 */
function shouldPick(){
  var n = CFG.pickEveryN;
  if (n === undefined) n = 2;
  if (!n || n <= 0) return false;
  return ((R.wave + 1) % n) === 0;
}

/* ---------- 13.5 波间三选一（临时增益，只在本关有效） ---------- */
var BUFF_DECK = [
  { id: 'armorCap', name: '加固车间', desc: '本关护甲上限 +20', apply: function(){ R.buffArmorMax = (R.buffArmorMax || 0) + 20; refreshCaps(); } },
  { id: 'armorFill', name: '整箱饼干', desc: '护甲立刻补满', apply: function(){ R.armor = R.armorMax; } },
  { id: 'dmgUp', name: '磨快牙口', desc: '本关我方伤害 +25%', apply: function(){ R.buffDmgMul = (R.buffDmgMul || 1) * 1.25; } },
  { id: 'atkSpeed', name: '上足发条', desc: '本关我方出手快 15%', apply: function(){ R.buffAtkMul = (R.buffAtkMul || 1) * 1.15; } },
  { id: 'energy', name: '备用电瓶', desc: '能量 +50', apply: function(){ R.energy = clamp(R.energy + 50, 0, R.energyMax); } },
  { id: 'parts', name: '零件补给', desc: '零件补满', apply: function(){ R.parts = R.partsMax; } },
  { id: 'repair', name: '紧急修理', desc: '全队恢复 25 点生命', apply: function(){
      for (var i = 0; i < R.units.length; i++){
        var u = R.units[i];
        if (u && u.alive) u.hp = Math.min(u.hpMax, u.hp + 25);
      }
    } }
];

function refreshCaps(){
  var capBonus = R.capBonus || 0;
  R.armorMax = CFG.armorMax + capBonus + (R.buffArmorMax || 0);
}

function openPick(){
  var pool = BUFF_DECK.slice();
  R.pick = [];
  for (var i = 0; i < 3 && pool.length; i++){
    R.pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  /* 押注卡：押一笔金币赌本波无伤（金币不够就不出现） */
  var coins = (typeof SHOP !== 'undefined' && SHOP && typeof SHOP.coins === 'number') ? SHOP.coins : 0;
  if (coins >= 20 && !R.bet){
    var stake = Math.round(Math.max(10, Math.min(60, coins * 0.2)));
    (function(amt){
      R.pick.push({
        id: 'bet', name: '押注 ' + amt,
        desc: '押 ' + amt + ' 金币：本波全员无伤返 ' + (amt * 2) + '，掉血没收',
        apply: function(){
          if (typeof addCoins === 'function') addCoins(-amt);
          R.bet = { amount: amt, hp: betSnapshot() };
        }
      });
    })(stake);
  }

  S.phase = 'pick';
  sfx('pick');
}

function chooseBuff(idx){
  if (S.phase !== 'pick') return;
  var b = R.pick && R.pick[idx];
  if (!b) return;
  try { b.apply(); } catch (e) {}
  pushLog('补给：' + b.name);
  R.pick = null;
  S.phase = 'play';
  spawnWave(R.wave + 1);
  sfx('tool');
}

/* 覆盖原版的三选一绘制（它用的是 PACKS，已经不用了） */
drawPick = function(){
  var now = performance.now();
  ctx.fillStyle = 'rgba(16,12,24,.72)';
  ctx.fillRect(0, 0, W, H);
  txt('波间补给 · 三选一', W / 2, Math.round(H * 0.2), Math.round(W * 0.05), C.amber, 'center', true);
  txt('只在本关有效', W / 2, Math.round(H * 0.2) + 22, Math.max(10, Math.round(W * 0.03)), C.muted, 'center');

  var pad = L.pad, cw = W - pad * 2, ch = Math.round(H * 0.1), gap = Math.round(H * 0.014);
  var y0 = Math.round(H * 0.27);
  for (var i = 0; i < (R.pick || []).length; i++){
    var b = R.pick[i];
    var y = y0 + i * (ch + gap);
    rr(pad, y, cw, ch, 12);
    ctx.fillStyle = C.panel; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232,172,80,.45)'; ctx.stroke();
    /* 图标（有 pixel 图标就画，没有就留白让文字自己撑） */
    var ic = iconImg('buff-' + b.id);
    var tx = pad + 14;
    if (ic){
      var isz = Math.round(ch * 0.62);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ic, pad + 10, y + (ch - isz) / 2, isz, isz);
      ctx.restore();
      tx = pad + 14 + isz + 8;
    }
    txt(b.name, tx, y + Math.round(ch * 0.38), Math.round(W * 0.04), C.ink, 'left', true);
    txt(b.desc, tx, y + Math.round(ch * 0.7), Math.max(9, Math.round(W * 0.027)), C.muted, 'left');
    txt('选它', pad + cw - 14, y + Math.round(ch * 0.55), Math.max(11, Math.round(W * 0.034)), C.amber, 'right', true);
    HIT['pick' + i] = [pad, y, cw, ch];
  }
  txt('也可以按 1 / 2 / 3', W / 2, y0 + 3 * (ch + gap) + 18,
      Math.max(10, Math.round(W * 0.03)), C.muted, 'center');
};

/* 资源说明三页：点屏幕任意处翻页，翻完自动开打 */
canvas.addEventListener('pointerdown', function(e){
  if (!(R.tut && R.tutSwap && !R.tutUlt)) return;
  try {
    R.tutRes = (R.tutRes | 0) + 1;
    if (R.tutRes >= 3){ R.tutRes = 3; R.tutUlt = true; }
    sfx('tap');
    if (e.preventDefault) e.preventDefault();
    e.stopImmediatePropagation();
  } catch (err) {}
}, true);

canvas.addEventListener('pointerdown', function(e){
  if (S.phase !== 'pick') return;
  try {
    var rect = canvas.getBoundingClientRect();
    var pt = [e.clientX - rect.left, e.clientY - rect.top - SAFE_TOP];
    for (var i = 0; i < 3; i++){
      if (HIT['pick' + i] && inRect(pt, HIT['pick' + i])){
        chooseBuff(i);
        if (e.preventDefault) e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
  } catch (err) {}
}, true);

window.addEventListener('keydown', function(e){
  if (e.key === 'g' || e.key === 'G'){ R.showGrid = !R.showGrid; }
  if (S.phase !== 'pick') return;
  var k = '123'.indexOf(e.key);
  if (k >= 0) chooseBuff(k);
}, false);

/* ---------- 14. 接管三个原流程函数 ---------- */
var _rpgAfterResolve = afterResolve;
afterResolve = function(){
  if (S.phase !== 'play') return;
  if (S.anim) return;
  rpgTurn(R.stepThisTurn);
  R.stepThisTurn = false;
};

var _rpgTrySwap = trySwap;
trySwap = function(a, b){
  // 没有步数限制：只要小队还在，就能一直消
  var before = S.swapCount || 0;
  R.stepThisTurn = false;
  var ok = _rpgTrySwap.apply(null, arguments);
  if (ok && (S.swapCount || 0) > before) R.stepThisTurn = true;   // 有效交换（含连锁的那一手）
  if (R.tut && ok && !R.tutSwap) R.tutSwap = true;                 // 教学关：第一次成功消除就开打
  return ok;
};

/* 工具在 RPG 里是"技能"：清格不再刷资源，改成直接结算伤害/能量（v4 §7）。
   否则 4 次工具的清盘量会变成几十点能量，两步就把整关清掉，步数形同虚设。 */
var _rpgUseTool = useTool;
useTool = function(id, cell){
  R.inTool = id;
  var res;
  try { res = _rpgUseTool.apply(null, arguments); }
  finally { R.inTool = null; }
  if (res === 'used'){
    if (id === 0){
      var foe = weakestEnemy();
      if (foe) hurtFoe(foe, 10, false);
      pushLog('液压冲压：单体 10');
    } else if (id === 1){
      R.energy = clamp(R.energy + 40, 0, R.energyMax);
      pushLog('仓鼠加餐：能量 +40');
    } else if (id === 2){
      var list = aliveEnemies();
      for (var i = 0; i < list.length; i++) hurtFoe(list[i], 15, false);
      pushLog('开箱爆裂：全场 15');
    }
    checkBattleEnd();
  }
  return res;
};

/* 原 startLevel 里是 var d = LEVELS[lv - 1] 取模板；LEVELS 只有 5 条，
   第 6 关起 d 是 undefined，d.steps 直接抛错（连过五关就崩）。
   RPG 层要跑无尽关卡，所以把"模板关卡号"夹回表内，建完场再把真关卡号写回 S.level。 */
function rpgTemplateLevel(lv){
  var n = LEVELS.length || 1;
  return ((Math.max(1, lv) - 1) % n) + 1;
}
/* 兜底：任何还在按 S.level 直取 LEVELS 的地方都不再越界 */
var _rpgCfg = cfg;
cfg = function(){
  return _rpgCfg.apply(null, arguments) || LEVELS[rpgTemplateLevel(S.level) - 1] || LEVELS[0];
};

/* ---------- 关卡随机事件（C） ----------
   每关 40% 概率抽一个，都是"有代价的甜头"，只改 mod、不改流程。 */
var EVENT_DECK = [
  { id: 'fault', name: '机器故障', desc: '产出 ×1.5，敌人出手快 20%',
    mod: { yieldMul: { energy: 1.5, armor: 1.5, parts: 1.5 }, chargeMul: 0.8 } },
  { id: 'overtime', name: '加班赶工', desc: '我方伤害 +20%，护甲上限 −15',
    mod: { dmgBonus: 0.2, armorMaxDelta: -15 } },
  { id: 'inspect', name: '突击质检', desc: '敌人血 +15%，通关多给 40 金币',
    mod: { hpMul: 1.15 }, coin: 40 }
];

function rollEvent(){
  if (R.eventRolled) return;
  R.eventRolled = true;
  /* 第一关先上教学，不加变数；越往后越爱出 */
  if (CHAPTER.tut || (S.level || 1) <= 1) return;
  var chance = (S.level >= 4) ? 0.45 : 0.28;
  if (Math.random() > chance) return;
  var e = EVENT_DECK[Math.floor(Math.random() * EVENT_DECK.length)];
  R.event = e;
  R.mod = Object.assign({}, R.mod || {});   /* 事件只改副本，别污染 game.json 的关卡表 */
  for (var k in e.mod){
    var v = e.mod[k];
    var isMul = (k === 'hpMul' || k === 'atkMul' || k === 'chargeMul');
    if (isMul && typeof v === 'number' && typeof R.mod[k] === 'number'){
      R.mod[k] = +(R.mod[k] * v).toFixed(3);      /* 倍率叠乘，不覆盖 */
    } else {
      R.mod[k] = v;
    }
  }
  if (e.coin) R.eventCoin = e.coin;
  if (e.mod.dmgBonus) R.buffDmgMul = (R.buffDmgMul || 1) * (1 + e.mod.dmgBonus);
  pushLog('随机事件：' + e.name + '（' + e.desc + '）');
  R.banner = { text: e.name + '·' + e.desc, t0: performance.now(), holdMs: 3200 };
}

var _rpgStartLevel = startLevel;
startLevel = function(lv){
  var real = Math.max(1, Math.round(Number(lv) || SHOP.level || S.level || 1));
  applyLevelCfg(real);   // 先按关卡把配置写好，再建战场
  var res = _rpgStartLevel.call(null, rpgTemplateLevel(real));
  S.level = real;        // 真关卡号：顶栏 / 商店 / 战斗都按它走
  // 没有步数限制：stepsMax = 0 表示不限（原 LEVELS 只保留关卡名）
  S.stepsMax = 0;
  S.steps = 0;
  S.tools = (CHAPTER.tools || [1, 1, 1]).slice();
  S.arm = -1;
  rpgResetBattle();
  S.phase = 'play';
  S.hintOpen = false;
  if (R.mod && R.mod.note) pushLog(R.mod.note);
  R.eventRolled = false;
  R.event = null;
  R.eventCoin = 0;
  rollEvent();
  /* 开场：教学关先停住等玩家第一次三消；其它关 5 秒倒计时，期间把本关特色浮在上方 */
  R.intro = null;
  R.tutSwap = false;
  R.tutUlt = false;
  R.tutMove = null;
  R.tutT0 = 0;
  R.tutRes = 0;                       /* 资源说明当前是第几页（0..2，翻完置 tutUlt） */
  R.tut = !!CHAPTER.tut;              /* 教学关：先停住，等玩家滑一次 */
  if (!R.tut && CHAPTER.brief){
    R.intro = { t0: performance.now(), dur: 5000 };
  }
  return res;
};

/* ---------- 15. 舞台：左右对峙的走位制（M6-5，去掉卡片） ----------
   我方在左、敌方在右，都站在同一条地面线上，靠 x 坐标真的走过去贴身。
   没有卡片框：只有角色本体 + 头顶血条 + 脚下的名字。以后接美术就是替换
   drawUnitSprite() 里画的那张图，位置/血条/名字都不用改。
   竖屏 390 宽：一排最多 5 只，站位间距 42px，两侧在中间地带交火。 */
/* 角色显示尺寸：贴图是 16×16，这里给整数倍放大。
   rules.unitSize 控制（32 = 16×2 经典像素比例，默认；48 = ×3；64 = ×4 偏大）。 */
var UNIT_SIZE = (function(){
  var v = Number((RULES && RULES.unitSize) || 32);
  if (!isFinite(v) || v < 16) v = 32;
  return Math.round(Math.max(16, Math.min(96, v)));
})();

var STAGE2 = {
  sprite: UNIT_SIZE,                    // 角色基准尺寸（贴图按这个尺寸 NEAREST 绘制）
  pitch: Math.round(UNIT_SIZE * ((RULES && typeof RULES.stagePitch === 'number') ? RULES.stagePitch : 0.82)),
  reach: Math.round(UNIT_SIZE * ((RULES && typeof RULES.stageReach === 'number') ? RULES.stageReach : 1.1)),
  groundPad: 150,                       // 地面线距舞台底部的距离（下面留给战况/资源条）
  jitter: Math.round(UNIT_SIZE * 0.28)  // 前后错开的深度差：奇偶站位分成前后两列
};

/* ---------- 舞台地面：角色在这个矩形里自由走（x / y 两个轴） ---------- */
function floorRect(){
  var pad = 12;
  var box = {
    left: L.pad + pad,
    right: W - L.pad - pad,
    top: L.giftY + Math.round(SZ.title) + 52,
    bottom: L.giftY + L.giftH - 46
  };
  /* rules.floor：编辑器里拖出来的地面范围（相对舞台的 0–1 比例），没配就用默认值 */
  var cf = (RULES && RULES.floor) ? RULES.floor : null;
  if (cf){
    var fw = W - L.pad * 2, fh = L.giftH;
    if (typeof cf.top === 'number') box.top = L.giftY + Math.round(fh * cf.top);
    if (typeof cf.bottom === 'number') box.bottom = L.giftY + Math.round(fh * cf.bottom);
    if (typeof cf.left === 'number') box.left = L.pad + Math.round(fw * cf.left);
    if (typeof cf.right === 'number') box.right = L.pad + Math.round(fw * cf.right);
  }
  return box;
}
function floorYRange(){
  var f = floorRect();
  return { top: f.top, bottom: f.bottom, h: Math.max(1, f.bottom - f.top) };
}
/* 远近缩放：靠下的（近处）大一点，靠上的（远处）小一点 */
/* 角色统一大小（不做近大远小）：只保留一个常量钩子，需要时再改 */
var UNIT_SCALE = 1;
function depthScale(y){ return UNIT_SCALE; }
/* 开场站位：优先读 game.json 的 rules.formation（0–1 归一化坐标，可直接手改）；
   没配就退回"左半/右半 + 两列多行"的老公式。 */
function formationAt(side, idx){
  var list = (RULES && RULES.formation) ? RULES.formation[side] : null;
  if (!list || !list.length) return null;
  var p = list[idx % list.length];
  return (p && p.length >= 2) ? p : null;
}
function homePos(idx, isFoe, total){
  var f = floorRect(), r = floorYRange();
  var custom = formationAt(isFoe ? 'foe' : 'ally', idx);
  if (custom){
    return {
      x: f.left + (f.right - f.left) * clamp(Number(custom[0]) || 0, 0, 1),
      y: r.top + r.h * clamp(Number(custom[1]) || 0, 0, 1)
    };
  }
  total = Math.max(1, total || (CFG.slots || 5));
  var col = idx % 2, row = Math.floor(idx / 2);
  var rows = Math.max(1, Math.ceil(total / 2));
  var k = rows > 1 ? row / (rows - 1) : 0.5;
  var y = r.top + r.h * (0.18 + 0.66 * k);
  var x = isFoe ? (f.right - 34 - col * 44) : (f.left + 34 + col * 44);
  return { x: x, y: y };
}
/* 初始站位夹在"守卫带"内，避免第一帧就贴边 */
function ensurePosClamped(o, f){
  if (!o) return;
  var guard = Math.round(STAGE2.sprite * 0.5);
  o.x = clamp(o.x, f.left + guard, f.right - guard);
  o.y = clamp(o.y, f.top + 8, f.bottom - 2);
}

function ensurePos(o, idx, isFoe, total){
  if (!o) return;
  if (typeof o.x !== 'number' || typeof o.y !== 'number'){
    var p = homePos(idx, isFoe, total);
    o.x = p.x; o.y = p.y;
  }
}
function unitX(o){ return (o && typeof o.x === 'number') ? o.x : W / 2; }
function unitY(o){ return (o && typeof o.y === 'number') ? o.y : floorYRange().bottom; }

/* 兼容旧调用（浮字 / 弹道锚点都走这两个） */
function stageXOf(u, isFoe){ return u ? unitX(u) : W / 2; }
function stageYOf(u, isFoe){ return u ? unitY(u) - STAGE2.sprite * 0.45 : floorYRange().bottom; }
/* 伤害飘字的锚点：单位卡中心 / 敌方卡中心 */

/* ---------- 车间地板背景：有纵深的 2D 地面，角色在上面自由走 ----------
   纯绘制，不参与任何判定。远处暗、近处亮，地砖线从消失点发散，
   两侧摆机箱和管道当布景，让 x/y 两轴移动有空间感。 */
/* 舞台背景图：构建时由 studio 注入成 window.GAME.assets.stage_bg（data URL） */
var BG_IMG = null;
function stageBgImg(){
  var src = (typeof window !== 'undefined' && window.GAME && window.GAME.assets)
    ? window.GAME.assets.stage_bg : null;
  if (!src) return null;
  if (!BG_IMG){
    BG_IMG = new Image();
    BG_IMG.__ready = false;
    BG_IMG.onload = function(){ BG_IMG.__ready = true; };
    BG_IMG.src = src;
  }
  return BG_IMG.__ready ? BG_IMG : null;
}

/* 背景：优先用生成的像素背景图（assets/stage_bg.png，构建时注入）；
   没有图就退回下面的程序化地板。两层都保留，缺图不会开天窗。 */
/* 站位标尺：按 G 键（或 __grid(true)）打开，画 0.1 归一化网格 + 当前 formation 的落点，
   方便在 game.json 里对着数字摆站位。只在开发时用，默认关闭。 */
function drawFormationGrid(){
  var f = floorRect(), r = floorYRange();
  var i, t, gx, gy2;
  ctx.save();
  ctx.strokeStyle = 'rgba(120,220,255,.28)';
  ctx.lineWidth = 1;
  ctx.font = Math.max(7, Math.round(W * 0.019)) + 'px sans-serif';
  ctx.fillStyle = 'rgba(120,220,255,.75)';
  for (i = 0; i <= 10; i++){
    t = i / 10;
    gx = f.left + (f.right - f.left) * t;
    gy2 = r.top + r.h * t;
    ctx.beginPath(); ctx.moveTo(gx, r.top); ctx.lineTo(gx, r.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(f.left, gy2); ctx.lineTo(f.right, gy2); ctx.stroke();
    ctx.fillText(t.toFixed(1), gx + 1, r.bottom - 2);
    ctx.fillText(t.toFixed(1), f.left + 1, gy2 - 1);
  }
  function dot(side, isFoe){
    var list = (RULES && RULES.formation && RULES.formation[side]) || [];
    for (var k = 0; k < list.length; k++){
      var px = f.left + (f.right - f.left) * list[k][0];
      var py = r.top + r.h * list[k][1];
      ctx.strokeStyle = isFoe ? 'rgba(255,120,120,.9)' : 'rgba(120,255,170,.9)';
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = isFoe ? 'rgba(255,120,120,.9)' : 'rgba(120,255,170,.9)';
      ctx.fillText(side + k, px + 6, py + 3);
    }
  }
  dot('ally', false); dot('foe', true);
  ctx.restore();
}
function drawFloorBg(now, bx, by, bw, bh){
  var f = floorRect();
  var img = stageBgImg();
  if (img){
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    /* 铺满整个舞台盒（墙在上、地板在下），再压一层暗纱保证文字可读 */
    ctx.drawImage(img, bx + 1, by + 1, bw - 2, bh - 2);
    ctx.fillStyle = 'rgba(20,16,30,.18)';
    ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.restore();
    /* 地面区再盖一层轻薄的地砖格线，给"能站人的地面"以尺度 */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    var vx = (f.left + f.right) / 2, vy = f.top + 2;
    for (var i = -5; i <= 5; i++){
      var ex = vx + i * ((f.right - f.left) / 9);
      ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(ex, f.bottom); ctx.stroke();
    }
    for (var k = 1; k <= 4; k++){
      var t = k / 4, yy2 = vy + (f.bottom - vy) * t * t;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.04 - 0.005 * k).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(f.left, yy2); ctx.lineTo(f.right, yy2); ctx.stroke();
    }
    ctx.restore();
    /* 四周暗角 */
    var vg = ctx.createRadialGradient((bx + bx + bw) / 2, by + bh * 0.55, bh * 0.3,
                                      (bx + bx + bw) / 2, by + bh * 0.55, bh * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(8,6,14,.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    return;
  }
  drawFloorBgFallback(now);
}

function drawFloorBgFallback(now){
  var f = floorRect(), r = floorYRange();
  var horizon = f.top + Math.round(r.h * 0.10);

  var g = ctx.createLinearGradient(0, horizon, 0, f.bottom);
  g.addColorStop(0, '#191426');
  g.addColorStop(0.55, '#221c31');
  g.addColorStop(1, '#2c2440');
  ctx.fillStyle = g;
  ctx.fillRect(f.left, horizon, f.right - f.left, f.bottom - horizon);

  ctx.fillStyle = 'rgba(232,172,80,.12)';
  ctx.fillRect(f.left, horizon - 2, f.right - f.left, 2);

  var vx = (f.left + f.right) / 2, vy = horizon;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.lineWidth = 1;
  for (var i = -5; i <= 5; i++){
    var bx = vx + i * ((f.right - f.left) / 9);
    ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(bx, f.bottom); ctx.stroke();
  }
  for (var k = 1; k <= 5; k++){
    var t = k / 5;
    var yy = vy + (f.bottom - vy) * t * t;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.05 - 0.005 * k).toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(f.left, yy); ctx.lineTo(f.right, yy); ctx.stroke();
  }
  ctx.restore();

  function box(bx, by, bw, bh, col){
    rr(bx, by, bw, bh, 2);
    ctx.fillStyle = col; ctx.fill();
  }
  box(f.left + 2, horizon + 6, 16, 22, 'rgba(18,14,28,.85)');
  box(f.left + 20, horizon + 14, 10, 14, 'rgba(24,19,36,.8)');
  box(f.right - 18, horizon + 4, 16, 26, 'rgba(18,14,28,.85)');
  box(f.right - 26, horizon + 18, 8, 12, 'rgba(24,19,36,.8)');
  ctx.strokeStyle = 'rgba(70,60,92,.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(f.left + 6, horizon - 6); ctx.lineTo(f.left + 6, horizon + 8);
  ctx.moveTo(f.right - 8, horizon - 6); ctx.lineTo(f.right - 8, horizon + 10);
  ctx.stroke();
  var pulse = 0.5 + 0.5 * Math.sin(now / 900);
  ctx.fillStyle = 'rgba(232,172,80,' + (0.35 + 0.35 * pulse) + ')';
  ctx.beginPath(); ctx.arc(f.left + 10, horizon + 6, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(f.right - 10, horizon + 6, 1.8, 0, Math.PI * 2); ctx.fill();

  var vg = ctx.createRadialGradient((f.left + f.right) / 2, (horizon + f.bottom) / 2, r.h * 0.25,
                                    (f.left + f.right) / 2, (horizon + f.bottom) / 2, r.h * 1.15);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(8,6,14,.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(f.left, horizon, f.right - f.left, f.bottom - horizon);
}

/* 倍率徽章：×2.4 连 3 —— 涨的时候亮一下，掉的时候变红抖一下 */
function drawMultBadge(x, y, w){
  var now = performance.now();
  var m = multNow();
  var hot = (R.multPop || 0) > now;
  var hurt = (R.multHurt || 0) > now;
  var col = m >= 3 ? '#ffd166' : (m >= 1.8 ? '#e8ac50' : '#8f86a6');
  if (hurt) col = '#d96d55';
  var fs = Math.max(10, Math.round(W * 0.03));
  var label = '×' + m.toFixed(1);
  var bw = Math.round(fs * 3.6), bh = Math.round(fs * 1.7);
  var bx = x + w - bw - 10, by = y;
  rr(bx, by, bw, bh, bh / 2);
  ctx.fillStyle = hurt ? 'rgba(217,109,85,.18)' : (hot ? 'rgba(232,172,80,.20)' : 'rgba(255,255,255,.04)');
  ctx.fill();
  ctx.lineWidth = hot || hurt ? 2 : 1;
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.save();
  if (hurt) ctx.translate(Math.sin(now / 40) * 1.5, 0);
  txt(label, bx + bw * 0.34, by + bh * 0.68, fs, col, 'center', true);
  txt('连', bx + bw * 0.78, by + bh * 0.68, Math.round(fs * 0.72), C.muted, 'center');
  ctx.restore();
}

function drawStage(){
  var x = L.pad, y = L.giftY, w = W - L.pad * 2, h = L.giftH;
  var now = performance.now();
  /* 震屏：整块舞台一起抖，越重抖得越厉害（纯绘制偏移，不影响命中与点击） */
  var shk = shakeOffset(now);
  ctx.save();
  if (shk.x || shk.y) ctx.translate(shk.x, shk.y);

  rr(x, y, w, h, 12);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();

  /* 标题行：左=章节，右=波次 + 双方当前站场数量（玩家能直接确认"我 5 只都在台上"） */
  txt(CHAPTER.name, x + 12, y + SZ.title + 6, SZ.title, C.muted, 'left', true);
  var allyCount = 0, foeCount = 0;
  for (var ai = 0; ai < R.units.length; ai++) if (R.units[ai]) allyCount++;
  for (var fi = 0; fi < R.enemies.length; fi++) if (R.enemies[fi]) foeCount++;
  txt('第 ' + (R.wave + 1) + '/' + R.waveTotal + ' 波 · 我 ' + allyCount + ' / 敌 ' + foeCount,
      x + w - 12, y + SZ.title + 6, SZ.title, C.muted, 'right', true);

  /* ---------- 地面：一块有纵深的"车间地板"，角色在这个矩形里两轴自由走 ---------- */
  drawFloorBg(now, x, y, w, h);
  if (R.showGrid) drawFormationGrid();

  /* 我方空位的脚印：没有卡片，就用地面上的虚线脚印提示"这儿能站人" */
  for (var e = 0; e < (CFG.slots || 5); e++){
    if (R.units[e]) continue;
    var hp2 = homePos(e, false, CFG.slots || 5);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(130,120,155,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(hp2.x, hp2.y, 12 * depthScale(hp2.y), 4 * depthScale(hp2.y), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* 所有角色按 y 排序后一起画：靠后的（y 小）先画，靠前的压上去 */
  var list = [];
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (!u) continue;
    ensurePos(u, i, false, CFG.slots || 5);
    list.push({ o: u, foe: false });
  }
  for (var j = 0; j < R.enemies.length; j++){
    var foe = R.enemies[j];
    if (!foe) continue;
    ensurePos(foe, j, true, R.enemies.length);
    list.push({ o: foe, foe: true });
  }
  list.sort(function(a, b){ return unitY(a.o) - unitY(b.o); });
  for (var k = 0; k < list.length; k++) drawUnitSprite(list[k].o, list[k].foe, now);

  drawShots(now);
  drawBlastFx(now);

  /* 排队条：改到舞台右下，横排，不再和敌方卡抢右边缘 */
  drawQueueRow(x + w - 12, y + h - SZ.stripH - 26);

  /* 底部：护甲 / 零件 / 大招 */
  var stripY = y + h - SZ.stripH - 18;
  var stripW = Math.round((w - 36 - SZ.ult) * 0.5);
  drawStrip(x + 10, stripY, stripW, '护甲', R.armor, R.armorMax, '#9fc6ff');
  drawStrip(x + 10 + stripW + 8, stripY, stripW, '零件', R.parts, R.partsMax, '#c7b6ff');
  drawUltButton(x + w - SZ.ult - 10, stripY - Math.round((SZ.ult - SZ.stripH) / 2), now);

  /* 战况面板：压住中段的空白，也给"刚刚发生了什么"一个交代 */
  /* 战况挪到标题下面当"滚动条"，把舞台下半让给地面 —— 角色活动范围才不会被压成上半截 */
  drawBattleLog(x + 10, y + Math.round(SZ.title) + 20, w - 20, 1);
  drawMultBadge(x + 10, y + Math.round(SZ.title) + 6, w - 20);

  /* 飘字 */
  for (var f = R.floats.length - 1; f >= 0; f--){
    var ft = R.floats[f];
    var age = now - ft.t0;
    if (age > ft.max){ R.floats.splice(f, 1); continue; }
    var p = age / ft.max;
    ctx.save();
    ctx.globalAlpha = 1 - p * p;
    var fy = ft.y - 18 * p;
    if (ft.icon && ft.kind === 'skill'){
      var ic2 = (typeof unitFrameImg === 'function') ? null : null;
      var simg = (typeof artFromMap === 'function') ? artFromMap(unitArtMap(), ['skill-' + ft.icon]) : null;
      if (simg){
        var isz2 = 16;
        ctx.drawImage(simg, Math.round(ft.x - isz2 / 2), Math.round(fy - isz2 - 2), isz2, isz2);
        fy += 9;
      }
    }
    txt(ft.text, ft.x, ft.y - 18 * p, ft.big ? SZ.float - 1 : Math.max(8, SZ.float - 3), ft.col, 'center', true);
    ctx.restore();
  }

  /* 横幅：波次（1.1s）或教学提示（3.6s，按「·」拆成多行） */
  if (R.banner){
    var hold = R.banner.holdMs || 1100;
    var bAge = now - R.banner.t0;
    if (bAge > hold) R.banner = null;
    else {
      var bp = bAge / hold;
      ctx.save();
      ctx.globalAlpha = bp < 0.7 ? 1 : (1 - (bp - 0.7) / 0.3);
      var ty = floorRect().top + 54;   /* 让开战况那一行 */
      if (R.banner.holdMs){
        var parts = String(R.banner.text).split('·');
        var size = Math.max(10, Math.round(W * 0.031));
        for (var pi = 0; pi < parts.length && pi < 3; pi++){
          txt(parts[pi].trim(), W / 2, ty - (parts.length - 1 - pi) * (size + 4), size, C.amber, 'center', true);
        }
      } else {
        txt(R.banner.text, W / 2, ty, Math.round(W * 0.046), C.amber, 'center', true);
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

/* 车间背景：一条传送带 + 中间加工中心 + 右侧鼠帮管道口。
   纯装饰，不参与任何判定，作用是把舞台中段的空白填出"厂"的味道。 */
function drawFactoryBackdrop(x, y, w, h, beltY, now){
  /* 传送带 */
  ctx.fillStyle = 'rgba(255,255,255,.045)';
  ctx.fillRect(x + 8, beltY - 5, w - 16, 10);
  var n = Math.floor((w - 20) / 24);
  for (var i = 0; i < n; i++){
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(x + 12 + i * 24, beltY - 3, 11, 6);
  }

  /* 中间加工中心：齿轮 + 双向流动箭头 */
  var cx = W / 2, cy = beltY + Math.round(h * 0.11);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((now / 3400) % (Math.PI * 2));
  ctx.strokeStyle = 'rgba(255,255,255,.09)';
  ctx.lineWidth = 3;
  for (var t = 0; t < 8; t++){
    var a = t * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
    ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  /* 左侧：我方出货口（三条短线） */
  ctx.strokeStyle = 'rgba(159,198,255,.22)';
  ctx.lineWidth = 2;
  for (var s = 0; s < 3; s++){
    var sx = x + 14 + s * 7, sy = cy - 8 + s * 7;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 10, sy); ctx.stroke();
  }
  /* 右侧：鼠帮管道口（一段管子 + 三个齿） */
  var px = x + w - 22;
  ctx.fillStyle = 'rgba(217,109,85,.16)';
  rr(px - 6, cy - 13, 24, 26, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(217,109,85,.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, cy - 9); ctx.lineTo(px + 12, cy - 9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px + 12, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, cy + 9); ctx.lineTo(px + 12, cy + 9); ctx.stroke();
}

/* 接管原礼盒面板：draw() 里调的是 drawGiftPanel，这里直接换绑 */
drawGiftPanel = drawStage;

function dashBox(x, y, w, h, r){
  ctx.save();
  if (ctx.setLineDash) ctx.setLineDash([4, 4]);
  rr(x, y, w, h, r);
  ctx.lineWidth = 1; ctx.strokeStyle = '#4a4160'; ctx.stroke();
  ctx.restore();
}

function drawBattleLog(x, bottomY, w, rows){
  rows = rows || 3;
  var lineH = 12;
  var boxH = rows * lineH + 18;
  var boxY = bottomY - boxH;
  rr(x, boxY, w, boxH, 8);
  ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.stroke();
  txt('战况', x + 8, boxY + 12, SZ.log, C.muted, 'left', true);
  var start = Math.max(0, R.log.length - rows);
  for (var i = 0; i < rows; i++){
    var line = R.log[start + i];
    if (!line && i === 0) line = '消掉零食，把力气送进车间';
    if (!line) continue;
    txt('· ' + line, x + 8, boxY + 12 + (i + 1) * lineH, SZ.log, '#948caa', 'left');
  }
}

/* 增援：横排在舞台右下，不再和敌方卡抢右边缘的竖排位置 */
function drawQueueRow(rightX, bottomY){
  if (!R.queue.length) return;
  var n = Math.min(4, R.queue.length);
  var w = n * (SZ.queue + 2) - 2;
  txt('增援 ' + R.queue.length, rightX, bottomY - SZ.queue - 3, SZ.log, '#c99', 'right');
  for (var i = 0; i < n; i++){
    var qx = rightX - w + i * (SZ.queue + 2);
    rr(qx, bottomY - SZ.queue, SZ.queue, SZ.queue, 5);
    ctx.fillStyle = 'rgba(217,109,85,.12)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(217,109,85,.35)'; ctx.stroke();
    drawFoeArt(qx + 2, bottomY - SZ.queue + 2, SZ.queue - 4, R.queue[i]);
  }
}

/* 工厂仪表风格的资源条：金属边框 + 分段刻槽 + 大号数值 + 小图标 */
function drawStrip(x, y, w, label, val, max, col){
  var v = Math.max(0, Math.round(val));
  var h = SZ.stripH;
  var ratio = clamp(val / Math.max(1, max), 0, 1);

  /* 外框（深槽） */
  rr(x - 1, y - 1, w + 2, h + 2, (h + 2) / 2);
  ctx.fillStyle = 'rgba(12,9,18,.85)'; ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(232,172,80,.35)';
  ctx.stroke();

  /* 底色 */
  rr(x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();

  /* 填充 */
  if (ratio > 0){
    ctx.save();
    rr(x, y, w, h, h / 2);
    ctx.clip();
    ctx.fillStyle = col;
    ctx.fillRect(x, y, Math.max(h, w * ratio), h);
    /* 顶部高光 */
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(x, y, Math.max(h, w * ratio), Math.max(1, Math.round(h * 0.35)));
    ctx.restore();
  }

  /* 刻槽：每 1/8 一道 */
  ctx.strokeStyle = 'rgba(12,9,18,.55)';
  ctx.lineWidth = 1;
  for (var i = 1; i < 8; i++){
    var gx = Math.round(x + w * i / 8);
    ctx.beginPath();
    ctx.moveTo(gx + 0.5, y + 1);
    ctx.lineTo(gx + 0.5, y + h - 1);
    ctx.stroke();
  }

  /* 数值：放在条上方右侧（浅色），空条时也读得清 */
  var fs = Math.max(9, Math.round(SZ.log));
  txt(v + '/' + max, x + w, y - 3, fs, 'rgba(233,226,245,.92)', 'right', true);

  /* 标签 + 小方点图标 */
  var iconCol = col;
  ctx.fillStyle = iconCol;
  ctx.fillRect(x, y - fs - 4, 4, 4);
  txt(label, x + 8, y - 3, fs, C.muted, 'left');
}

/* 步数用尽只是"不能再消"，不再有横幅、也不参与胜负（只在战况里记一行）。 */

function drawUltButton(x, y, now){
  var blocked = ultBlocked();
  var ready = !blocked && R.energy >= CFG.ult.cost;
  var r = SZ.ult / 2;
  var cx = x + r, cy = y + r;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = blocked ? 'rgba(217,109,85,.12)' : (ready ? 'rgba(232,172,80,.22)' : C.panel2);
  ctx.fill();
  ctx.lineWidth = ready ? 3 : 1;
  ctx.strokeStyle = blocked ? 'rgba(217,109,85,.8)' : (ready ? C.amber : C.line);
  ctx.stroke();
  if (!blocked){
    /* 环形进度 */
    var ratio = clamp(R.energy / CFG.ult.cost, 0, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.lineWidth = 3;
    ctx.strokeStyle = ready ? '#ffe1a3' : '#6d6188';
    ctx.stroke();
    txt(ready ? '爆产' : Math.round(ratio * 100) + '%', cx, cy + 4, ready ? 11 : 10,
        ready ? C.amber : C.muted, 'center', true);
  } else {
    /* 停电关：按钮直接变成"停电"，点了给原因，不让玩家以为是 bug */
    txt('停电', cx, cy - 2, 10, '#e89a8a', 'center', true);
    txt('大招停用', cx, cy + 9, 7, 'rgba(232,154,138,.8)', 'center');
    ctx.strokeStyle = 'rgba(217,109,85,.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 12); ctx.lineTo(cx + 4, cy - 16); ctx.stroke();
  }
  HIT.ult = [x, y, SZ.ult, SZ.ult];
}

/* 大招为什么不能放：'noUlt' | 'energy' | 'ready' */
function ultWhy(){
  if (ultBlocked()) return 'noUlt';
  if (R.energy < CFG.ult.cost) return 'energy';
  return 'ready';
}
function ultBlocked(){ return !!(R.mod && R.mod.noUlt); }
/* 点了不能放的时候给出原因（尤其停电关，别再让玩家以为是 bug） */
function explainUlt(){
  if (ultBlocked()){
    floatText('本关停电：大招停用', W / 2, L.giftY + L.giftH * 0.3, C.bad, true);
    if (!R.ultHinted){
      R.ultHinted = true;
      pushLog('停电：本关大招停用，靠护甲和资源撑过去');
    }
    sfx('invalid');
    return true;
  }
  if (R.energy < CFG.ult.cost) return false;
  return false;
}

/* ---------- 开场提示层：教学看真实可消的位置；其它关 5 秒倒计时浮一行特色 ---------- */
function cellRect(rc){
  return {
    x: L.boardX + rc[1] * L.cs,
    y: L.boardY + rc[0] * L.cs,
    s: L.cs
  };
}

/* 教学用：随机挑一个"现在真能消"的交换（比给最优解更像"随便示范一下"） */
function pickTutorialMove(){
  var moves = [];
  try { moves = validMoves(S.board) || []; } catch (e) { moves = []; }
  if (!moves.length) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

function drawTutorialMoveHint(now){
  if (!R.tutMove) R.tutMove = pickTutorialMove();
  var mv = R.tutMove;
  if (!mv) return;
  var a = cellRect(mv[0]), b = cellRect(mv[1]);
  var ax = a.x + a.s / 2, ay = a.y + a.s / 2;
  var bx = b.x + b.s / 2, by = b.y + b.s / 2;
  var pulse = 0.55 + 0.35 * Math.sin(now / 260);

  /* 两颗要交换的格子：虚线圈 + 呼吸 */
  var cells = [a, b];
  for (var i = 0; i < cells.length; i++){
    var c = cells[i];
    ctx.save();
    ctx.strokeStyle = 'rgba(232,172,80,' + pulse + ')';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    rr(c.x + 3, c.y + 3, c.s - 6, c.s - 6, 12);
    ctx.stroke();
    ctx.restore();
  }

  /* 从 A 指向 B 的箭头（带一个滑动的小光点） */
  ctx.save();
  ctx.strokeStyle = 'rgba(255,225,163,' + (0.6 + 0.3 * Math.sin(now / 200)) + ')';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  var ang = Math.atan2(by - ay, bx - ax);
  var hx = bx - Math.cos(ang) * 10, hy = by - Math.sin(ang) * 10;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - Math.cos(ang - 0.5) * 10, hy - Math.sin(ang - 0.5) * 10);
  ctx.lineTo(hx - Math.cos(ang + 0.5) * 10, hy - Math.sin(ang + 0.5) * 10);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,225,163,.95)';
  ctx.fill();
  /* 滑动的小光点 */
  var t = (now % 900) / 900;
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath();
  ctx.arc(ax + (bx - ax) * t, ay + (by - ay) * t, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* 一条提示放在舞台中段的空白里（不压护甲/零件条，也不挡棋盘） */
  var ty = floorRect().top + 34;   /* 放进地面区顶部那条空白带：不压战况，也不挡第一排角色 */
  rr(L.pad, ty - 17, W - L.pad * 2, 24, 12);
  ctx.fillStyle = 'rgba(20,16,28,.85)'; ctx.fill();
  txt('拖动这颗零食，和旁边那颗交换', W / 2, ty, Math.max(11, Math.round(W * 0.031)), C.ink, 'center', true);
}

/* 三消成功后：三种资源分三页讲，一页一条，点屏幕翻页；
   每一页都会把棋盘上对应的零食点亮，告诉玩家"消这个 → 得那个"。 */
function wrapLines(text, maxChars){
  var out = [], s = String(text);
  while (s.length > maxChars){
    var cut = s.lastIndexOf(' ', maxChars);
    if (cut < maxChars * 0.6) cut = maxChars;
    out.push(s.slice(0, cut));
    s = s.slice(cut).replace(/^\s+/, '');
  }
  if (s.length) out.push(s);
  return out;
}

var TUT_RES = [
  { type: 0, name: '能量', from: '花生', col: '#ffd98a',
    desc: '消掉花生就把能量灌给仓鼠；攒满 60 点可放「爆产」，全场重击。',
    hint: '棋盘上亮着的花生就是能量来源' },
  { type: 1, name: '护甲', from: '饼干', col: '#9fc6ff',
    desc: '消掉饼干变成全队护盾；敌人先打穿盾才会掉血，盾越厚越能拖。',
    hint: '棋盘上亮着的饼干就是护甲来源' },
  { type: 2, name: '零件', from: '瓜子', col: '#c7b6ff',
    desc: '消掉瓜子变零件；攒够自动开炮台，也能把坦克/炮手的强化弹灌满。',
    hint: '棋盘上亮着的瓜子就是零件来源' }
];

function tutResIndex(){ return clamp(R.tutRes | 0, 0, TUT_RES.length - 1); }

function drawTutorialResourcePage(now){
  var page = tutResIndex();
  var cur = TUT_RES[page];
  var fs = Math.max(10, Math.round(W * 0.028));

  /* 棋盘压暗，只把这一类零食点亮 */
  ctx.save();
  ctx.fillStyle = 'rgba(12,9,18,.5)';
  ctx.fillRect(L.boardX, L.boardY, L.boardW, L.boardW);
  for (var r = 0; r < N; r++){
    for (var c = 0; c < N; c++){
      if (S.board[r][c] !== cur.type) continue;
      var cx = L.boardX + c * L.cs, cy = L.boardY + r * L.cs;
      var pulse = 0.45 + 0.35 * Math.sin(now / 240 + (r + c) * 0.6);
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 2;
      rr(cx + 3, cy + 3, L.cs - 6, L.cs - 6, 12);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + (pulse * 0.18) + ')';
      ctx.fill();
    }
  }
  ctx.restore();

  /* 舞台上半部：一张大卡讲这一种资源 */
  var x = L.pad + 8, w = W - (L.pad + 8) * 2;
  var y = L.giftY + 24, h = 118;
  rr(x - 4, y - 8, w + 8, h + 16, 12);
  ctx.fillStyle = 'rgba(16,12,24,.9)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = cur.col; ctx.stroke();

  /* 左侧色块 + 名字 */
  ctx.fillStyle = cur.col;
  rr(x + 8, y + 6, 6, 34, 3); ctx.fill();
  txt(cur.from + ' → ' + cur.name, x + 22, y + 20, Math.round(W * 0.045), cur.col, 'left', true);
  txt((page + 1) + ' / ' + TUT_RES.length, x + w - 12, y + 20, fs, C.muted, 'right');

  /* 说明按宽度折行 */
  var lines = wrapLines(cur.desc, Math.floor((w - 24) / (fs * 1.02)));
  for (var i = 0; i < lines.length && i < 4; i++){
    txt(lines[i], x + 14, y + 46 + i * (fs + 5), fs, C.ink, 'left');
  }
  txt('· ' + cur.hint, x + 14, y + 46 + Math.min(4, lines.length) * (fs + 5) + 4, fs, '#b9aecb', 'left');

  /* 底部按钮：翻页 / 开始 */
  var btnH = Math.round(Math.min(50, H * 0.056));
  var by = L.boardY + L.boardW + Math.round(H * 0.012);
  if (by + btnH > H - 10) by = H - btnH - 10;
  rr(L.pad, by, W - L.pad * 2, btnH, btnH / 2);
  ctx.fillStyle = C.amber; ctx.fill();
  txt(page < TUT_RES.length - 1 ? '知道了，下一个 ▶' : '开打 ▶', W / 2, by + btnH * 0.62,
      Math.round(W * 0.043), '#241d2e', 'center', true);
  txt('点屏幕任意处继续', W / 2, by - 8, 10, C.muted, 'center');
}

function drawIntroOverlay(){
  var now = performance.now();
  var fs = Math.max(11, Math.round(W * 0.031));

  /* 其它关：开打前 5 秒倒计时 —— 本关特色做成**居中大卡**，倒计时结束就淡出消失 */
  if (R.intro){
    var left = Math.max(0, R.intro.dur - (now - R.intro.t0));
    var secs = Math.ceil(left / 1000);
    var p2 = 1 - left / Math.max(1, R.intro.dur);        /* 0 → 1 */
    /* 透明度：入场 300ms 淡入，退场最后 500ms 淡出 */
    var alpha = 1;
    if (p2 < 0.08) alpha = p2 / 0.08;
    else if (left < 500) alpha = Math.max(0, left / 500);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    var bw2 = W - L.pad * 2 - 24, bh2 = 116;
    var bx2 = L.pad + 12, by2 = L.giftY + Math.round(L.giftH * 0.32);
    rr(bx2, by2, bw2, bh2, 16);
    ctx.fillStyle = 'rgba(18,14,26,.92)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,172,80,.75)'; ctx.stroke();
    /* 标题 */
    txt('本 关 特 色', bx2 + bw2 / 2, by2 + 30, Math.round(W * 0.042), C.amber, 'center', true);
    /* 简述：最多两行 */
    var brief2 = CHAPTER.brief || '';
    var fs2 = Math.max(10, Math.round(W * 0.028));
    if (brief2.length <= 12){
      txt(brief2, bx2 + bw2 / 2, by2 + 62, fs2, C.ink, 'center');
    } else {
      txt(brief2.slice(0, 12), bx2 + bw2 / 2, by2 + 58, fs2, C.ink, 'center');
      txt(brief2.slice(12, 26), bx2 + bw2 / 2, by2 + 58 + fs2 + 4, fs2, C.ink, 'center');
    }
    /* 倒计时：底部一颗大数字 */
    txt(String(secs) + 's', bx2 + bw2 / 2, by2 + bh2 - 12, Math.round(W * 0.036),
        secs <= 1 ? '#ff8a5c' : '#ffd98a', 'center', true);
    ctx.restore();
  }

  /* 教学关：第一步指位置，第二步讲资源 */
  if (R.tut && !R.tutSwap) drawTutorialMoveHint(now);
  else if (R.tut && !R.tutUlt) drawTutorialResourcePage(now);
}

var _rpgDrawOverlay = draw;
draw = function(){
  _rpgDrawOverlay();
  if (S.phase === 'play') drawIntroOverlay();
};

/* 抬手时朝对面探身（左右对峙：我方往右、敌方往左），让"要打人了"看得见 */
function lungeDX(o, isFoe){
  if (!o || !(o.windup > 0)) return 0;
  var p = 1 - o.windup / STAGE.windupMs;
  return Math.sin(clamp(p, 0, 1) * Math.PI) * 5 * (isFoe ? -1 : 1);
}

/* ---------- 像素贴图（Tessera 出的 16×16，注入成 64×64 data URL） ----------
   有贴图就画贴图（NEAREST），没有就退回下面那套代码绘制的像素化渲染。
   注意：UNIT_ART 是构建时追加在文件末尾的，本层加载时它还不在 —— 必须"用的时候再读"，
   不能在加载时缓存成局部变量（否则永远是空表，画面全退回矢量）。 */
var ART_IMG = {};
var ART_DIAG = { draws: 0, misses: 0 };

function unitArtMap(){
  if (typeof window === 'undefined') return {};
  if (!window.UNIT_ART) window.UNIT_ART = {};
  return window.UNIT_ART;
}

function unitArtKey(o){
  var line = (o.cls && o.cls !== 'none') ? o.cls : 'none';
  return line + '-' + (o.tier || 1);
}

/* 敌方专用贴图键：foe-<type>-<tier>（Tessera 单独出的敌方造型）
   没有的话退回"我方同款 + 换色"（<cls>-<tier>-foe）。 */
function foeArtKeys(o){
  var out = [];
  if (o && o.type){
    out.push('foe-' + o.type + '-' + (o.tier || 1));
    if (o.type === 'blast') out.push('foe-shell-' + (o.tier || 1));   /* 新原型暂无专属美术 */
  }
  out.push(unitArtKey(o) + '-foe');
  out.push(unitArtKey(o));
  return out;
}

/* 按优先级取第一张"存在的"贴图：一旦命中就认它，不再往下退。
   否则贴图还在解码的那几帧会掉到下一档 —— 敌人会短暂变成"我方同款"。 */
function artFromMap(map, keys){
  var k = null;
  for (var i = 0; i < keys.length; i++){
    if (map[keys[i]]){ k = keys[i]; break; }
  }
  if (!k) return null;
  var img = ART_IMG[k];
  if (!img){
    img = new Image();
    img.__ready = false;
    img.onload = function(){ img.__ready = true; };
    img.onerror = function(){ img.__ready = false; };
    img.src = map[k];
    ART_IMG[k] = img;
  }
  return img.__ready ? img : null;
}

/* 预热：进场就把这批敌人 / 我方贴图开始解码，第一帧就不会回退成别的造型 */
function warmUnitArt(list, isFoe){
  if (!list) return;
  for (var i = 0; i < list.length; i++){
    var u = list[i];
    if (u) unitArtImg(unitArtKey(u), isFoe, u);
  }
}

/* 图标（buff-/gear-/mod-/snack-/tool- 前缀）走同一张注入表 */
/* 底部工具条的图标：有像素图标就画图标，没有就退回原来的代码绘制 */
var _drawToolMark = drawToolMark;
drawToolMark = function(cx, cy, s, i, on){
  var id = ['tool-pack', 'tool-hamster', 'tool-gift'][i];
  var ic = iconImg(id);
  if (ic){
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = on ? 1 : 0.32;
    ctx.drawImage(ic, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
    ctx.restore();
    return;
  }
  return _drawToolMark.apply(null, arguments);
};
function iconImg(id){
  if (!id) return null;
  return artFromMap(unitArtMap(), [id]);
}
/* ---------- 多帧动画（新美术包） ----------
   待机 idle1/idle2 每 400ms 交替；出手前 200ms 进 windup；出手后 140ms 显示 strike；
   在本帧里位移过就用 hop（跳跃）。找不到帧就退回静态贴图。 */
/* 敌方也用同一套 5 帧：待机交替、蓄力、出手、移动 */
function foeFrameName(o, now){
  if (!o) return null;
  if (o.animStrike && now - o.animStrike < 160) return 'strike';
  if (o.windup && o.windup > 0) return 'windup';
  if (o.movedAt && now - o.movedAt < 200){
    return (Math.floor(now / 150) % 2 === 0) ? 'hop' : 'idle1';
  }
  return (Math.floor(now / 400) % 2 === 0) ? 'idle1' : 'idle2';
}

function unitFrameName(u, isFoe, now){
  if (isFoe || !u) return null;
  if (u.animStrike && now - u.animStrike < 140) return 'strike';
  var nextAt = 0;
  if (u.atkMs && u.timerMs !== undefined) nextAt = u.atkMs - (u.timerMs || 0);
  else if (u.need && u.atkMs) nextAt = Math.max(0, u.atkMs - (u.timerMs || 0));
  if (u.atkMs && nextAt > 0 && nextAt < 200) return 'windup';
  if (u.movedAt && now - u.movedAt < 200){
    /* 移动：接触帧(idle1) 与 空中帧(hop) 交替，形成"跳着走"的节奏 */
    return (Math.floor(now / 150) % 2 === 0) ? 'hop' : 'idle1';
  }
  return (Math.floor(now / 400) % 2 === 0) ? 'idle1' : 'idle2';
}

function unitFrameImg(key, frame){
  try {
    var map = window.UNIT_FRAMES;
    if (!map || !map[key] || !frame || !map[key][frame]) return null;
    var id = key + '|' + frame;
    var img = ART_IMG[id];
    if (!img){
      img = new Image();
      img.__ready = false;
      img.onload = function(){ img.__ready = true; };
      img.src = map[key][frame];
      ART_IMG[id] = img;
    }
    return img.__ready ? img : null;
  } catch (e) { return null; }
}

function unitArtImg(key, isFoe, o, now){
  var t = now || performance.now();
  if (!isFoe){
    var fr = unitFrameName(o, isFoe, t);
    var img = fr ? unitFrameImg(key, fr) : null;
    if (img) return img;
  }
  if (isFoe){
    var fk = 'foe-' + ((o && o.type) || key.split('-')[0]) + '-' + ((o && o.tier) || 1);
    var fr2 = foeFrameName(o, t);
    var fim = fr2 ? unitFrameImg(fk, fr2) : null;
    if (fim) return fim;
    /* 新原型（blast）暂无美术：借同类 */
    if (o && o.type === 'blast'){
      var fim2 = fr2 ? unitFrameImg('foe-shell-' + (o.tier || 1), fr2) : null;
      if (fim2) return fim2;
    }
  }
  var map = unitArtMap();
  return artFromMap(map, isFoe ? foeArtKeys(o || { cls: key.split('-')[0], tier: 1 }) : [key]);
}

/* 跳跃离地量：移动中按 150ms 一拍做抛物线，最高 3px；不移动就是 0 */
function hopLift(o, now){
  if (!o || !o.movedAt || now - o.movedAt > 200) return 0;
  /* 和帧选择同一节拍：hop（空中）抬 3px，idle1（触地）回 0 —— 这样"飘"的感觉消失 */
  return (Math.floor(now / 150) % 2 === 0) ? 3 : 0;
}

function drawArtImage(img, x, gy, s, dead){
  ctx.save();
  if (dead) ctx.globalAlpha = 0.32;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(x - s / 2), Math.round(gy - s), s, s);
  ctx.restore();
}

/* 纸箱鼠的"纸箱"：贴图是同一套仓鼠，箱子用几笔代码叠上去，保住原来那个梗 */
function drawCrateTag(x, gy, s){
  var w = 22, h = 15;
  var bx = Math.round(x - w / 2), by = Math.round(gy - s * 0.95);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#c99a5b'; ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = '#a9762c'; ctx.fillRect(bx, by, w, 3);
  ctx.fillStyle = '#e6cf9e'; ctx.fillRect(bx + w / 2 - 2, by, 4, h);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(bx, by + h - 2, w, 2);
  ctx.restore();
}

/* ---------- 像素化渲染（真像素，零许可风险） ----------
   做法：把角色本体按 1/scale 的分辨率画进离屏画布，再用 NEAREST 放大回原尺寸。
   64 / 2 = 32 逻辑像素；血条与文字仍走矢量，保持清晰。
   scale 由 game.json 的 rules.artPixelScale 控制（1 = 关闭，回到矢量）。 */
var PIXEL = { canvas: null, ctx: null };

function pixelCtx(){
  if (!PIXEL.ctx){
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    PIXEL.canvas = c;
    PIXEL.ctx = c.getContext('2d');
  }
  return PIXEL.ctx;
}

function drawSpriteArtDirect(o, isFoe, now, x, gy, s, dead){
  ctx.save();
  if (dead) ctx.globalAlpha = 0.32;

  /* 影子 */
  ctx.globalAlpha *= 0.32;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, gy + 1, s * 0.3, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = dead ? 0.32 : 1;

  /* 本体（敌我用同一套画法，靠朝向镜像区分） */
  if (isFoe){
    ctx.save();
    ctx.translate(x, gy - s * 0.86);
    ctx.scale(-1, 1);
    drawFoeArt(0, 0, s, o);
    ctx.restore();
  } else {
    drawHamsterArt(x - s / 2, gy - s * 0.86, s, o);
  }

  /* 手里的武器：抬手时前送、释放后回摆（swing -0.6 → 0.8） */
  var swing = o.windup > 0 ? (-0.6 + (1 - o.windup / STAGE.windupMs) * 1.4) : 0;
  drawWeapon(o.cls || o.line, o.tier || 1,
             x + (isFoe ? -1 : 1) * s * 0.32, gy - s * 0.46,
             s, isFoe ? -1 : 1, swing, isFoe);

  /* 受伤闪一下 */
  if (now < (o.flash || 0)){
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, gy - s * 0.45, s * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawSpriteArt(o, isFoe, now, x, gy, s, dead){
  var scale = (RULES.artPixelScale === undefined) ? 2 : Number(RULES.artPixelScale);
  if (!scale || scale <= 1 || typeof document === 'undefined'){
    drawSpriteArtDirect(o, isFoe, now, x, gy, s, dead);
    return;
  }
  /* 抓一块能装下"人 + 挥出去的武器"的区域 */
  var rw = s * 2, rh = s * 1.7;
  var rx = x - rw / 2, ry = gy - s * 1.2;
  var cw = Math.max(8, Math.round(rw / scale)), chh = Math.max(8, Math.round(rh / scale));

  var pc = pixelCtx();
  if (PIXEL.canvas.width !== cw || PIXEL.canvas.height !== chh){
    PIXEL.canvas.width = cw; PIXEL.canvas.height = chh;
  }
  pc.setTransform(1, 0, 0, 1, 0, 0);
  pc.clearRect(0, 0, cw, chh);
  /* 把世界坐标缩进离屏画布：世界 (rx,ry) → 画布 (0,0)，缩比 1/scale */
  pc.setTransform(1 / scale, 0, 0, 1 / scale, -rx / scale, -ry / scale);

  var real = ctx;
  ctx = pc;
  try { drawSpriteArtDirect(o, isFoe, now, x, gy, s, dead); }
  finally { ctx = real; }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(PIXEL.canvas, rx, ry, rw, rh);
  ctx.restore();
}

/* ---------- 一个角色的全部画法（以后接美术只需要换这里的两笔） ----------
   没有卡片：本体 + 影子 + 头顶血条 + 脚下出手条 + 名字。
   位置来自 o.x（真的在走），前后深度来自 o.yo。 */
/* 天赋徽章：名字上方一排小片，最多 3 枚，写"硬化 Ⅱ"这种两字 + 罗马数字 */
var TALENT_SHORT = { tank: '硬', blade: '血', shot: '穿', hex: '烬', care: '苏' };
var TALENT_SIDE = { tank: '硬', blade: '嗜', shot: '穿', hex: '烬', care: '苏' };
function talentLabel(id){
  var def = TALENT_DEF[id];
  return def ? def.name : id;
}
/* 精英标记：脚下金环 + 头顶一颗小三角冠 */
/* 引信：脚下红色收缩圈 + 头顶一个小火花点 */
function drawFuse(x, y, s, fuseAt, now){
  var left = Math.max(0, fuseAt - now);
  var k = 1 - left / 1200;                     /* 0 → 1 */
  ctx.save();
  ctx.strokeStyle = 'rgba(255,110,80,' + (0.5 + 0.5 * Math.sin(now / 60)) + ')';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, s * 0.5 * (1 - k * 0.5), s * 0.18 * (1 - k * 0.5), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ff8a5c';
  ctx.fillRect(Math.round(x - 2), Math.round(y - s * 0.95), 4, 4);
  ctx.restore();
}

/* 引信鼠爆炸：5 帧序列（点火→爆闪→火球→冲击环→余烟），共 500ms */
function drawBlastFx(now){
  if (!R.blastFx || !R.blastFx.length) return;
  var keep = [];
  for (var i = 0; i < R.blastFx.length; i++){
    var f = R.blastFx[i];
    var age = now - f.t0;
    if (age > 520) continue;
    keep.push(f);
    var idx = Math.min(5, Math.max(1, Math.floor(age / 104) + 1));
    var img = unitFrameImg('fx-blast-' + idx, 'idle1') ||
              (typeof artFromMap === 'function' ? artFromMap(unitArtMap(), ['fx-blast-' + idx]) : null);
    if (img){
      var s2 = 96;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = Math.max(0, 1 - age / 520);
      ctx.drawImage(img, Math.round(f.x - s2 / 2), Math.round(f.y - s2 / 2), s2, s2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,150,90,' + Math.max(0, 0.8 - age / 600) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 12 + age / 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  R.blastFx = keep;
}

function drawEliteMark(x, y, s, now){
  ctx.save();
  ctx.strokeStyle = 'rgba(255,209,102,.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, s * 0.42, s * 0.16, 0, 0, Math.PI * 2);
  ctx.stroke();
  var pulse = 0.6 + 0.4 * Math.sin(now / 240);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ffd166';
  var cy = y - s * 0.92, w = s * 0.13;
  ctx.beginPath();
  ctx.moveTo(x - w, cy + w); ctx.lineTo(x, cy - w); ctx.lineTo(x + w, cy + w);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* 增益图标：护甲蓝 / 攻速琥珀 / 暴击绿，画在血条下方 */
function drawBuffIcons(u, x, y, now){
  if (!u) return;
  var marks = [];
  if (u.armorUntil && now < u.armorUntil) marks.push('#9fc6ff');
  if (u.asUntil && now < u.asUntil) marks.push('#e8ac50');
  if (u.critUntil && now < u.critUntil) marks.push('#79c98a');
  if (!marks.length) return;
  var w = 4, gap = 2;
  var total = marks.length * w + (marks.length - 1) * gap;
  var sx = Math.round(x - total / 2), sy = Math.round(y + 6);
  for (var i = 0; i < marks.length; i++){
    ctx.fillStyle = marks[i];
    ctx.fillRect(sx + i * (w + gap), sy, w, 3);
  }
}

/* 头顶天赋：只画图标（硬化/嗜血/穿甲/余烬/复苏），最多 3 个，不写字 —— 战场要干净 */
function drawTalentBadges(u, x, y){
  if (!u || !u.talents || !u.talents.length) return;
  var TAL_ICON = { tank: "hardening", blade: "bloodthirst", shot: "armourpierce", hex: "ember", care: "revival" };
  var list = u.talents.slice(0, 3);
  var ic = 12, gap = 2;
  var tot = list.length * ic + (list.length - 1) * gap;
  var x0 = Math.round(x - tot / 2), y0 = Math.round(y - ic + 2);
  ctx.save();
  ctx.fillStyle = "rgba(10,8,16,.45)";
  ctx.fillRect(x0 - 2, y0 - 2, tot + 4, ic + 4);
  ctx.imageSmoothingEnabled = false;
  for (var i = 0; i < list.length; i++){
    var key = TAL_ICON[list[i].id];
    var img = key && (typeof artFromMap === "function") ? artFromMap(unitArtMap(), ["talent-" + key]) : null;
    if (img) ctx.drawImage(img, x0 + i * (ic + gap), y0, ic, ic);
  }
  ctx.restore();
}


function drawUnitSprite(o, isFoe, now){
  var gy = unitY(o);                       /* 脚底就在地面上的 (x, y) */
  var s = STAGE2.sprite * depthScale(gy);  /* 越靠下（越近）越大 */
  var x = unitX(o) + lungeDX(o, isFoe);
  var dead = !o.alive;

  /* 本体：优先用 Tessera 出的像素贴图（64×64，NEAREST）；
     没贴图（或还没加载完）就退回代码绘制的像素化矢量 —— 两条路视觉上都还是像素风。 */
  var lift = hopLift(o, now);
  var gyDraw = gy - lift;
  var art = unitArtImg(unitArtKey(o), isFoe, o, now);
  if (art) ART_DIAG.draws++; else ART_DIAG.misses++;
  if (art) drawArtImage(art, x, gyDraw, s, dead);
  else drawSpriteArt(o, isFoe, now, x, gyDraw, s, dead);
  /* 纸箱鼠还没被破箱时，头上顶个纸箱（贴图统一后靠这几笔保住识别度） */
  if (isFoe && o.type === 'crate' && o.box > 0 && !dead) drawCrateTag(x, gy, s);

  /* 头顶：血条 + 出手/充能条（保持矢量清晰，不做像素化） */
  var bw = Math.max(24, Math.round(s * 0.72));
  var bx = x - bw / 2, by = gy - s * 0.86 - 4;
  bar(bx, by, bw, 3, o.hp / Math.max(1, o.hpMax), isFoe ? '#d96d55' : '#79c98a', 'rgba(0,0,0,.6)');
  if (isFoe){
    var ratio = CFG.realtime ? (o.timerMs / Math.max(1, o.chargeMs)) : (o.charge / Math.max(1, o.chargeMax));
    bar(bx, by + 4, bw, 2, ratio, ratio > 0.72 ? '#ff8a5c' : '#e8ac50', 'rgba(0,0,0,.6)');
  } else if (o.atkMs){
    bar(bx, by + 4, bw, 2, o.timerMs / Math.max(1, o.atkMs), 'rgba(255,255,255,.5)', 'rgba(0,0,0,.6)');
  } else if (o.need){
    bar(bx, by + 4, bw, 2, o.charge / o.need, o.empowered ? '#e8ac50' : '#c7b6ff', 'rgba(0,0,0,.6)');
  }

  /* 强化就绪：脚下一圈光 */
  if (!isFoe && o.empowered){
    ctx.save();
    ctx.strokeStyle = 'rgba(232,172,80,.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(x, gy + 1, s * 0.32, s * 0.1, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  if (!isFoe) drawTalentBadges(o, x, by - 6);
  drawBuffIcons(o, x, by + 8, now);
  if (isFoe && o.elite) drawEliteMark(x, gy, s, now);
  if (isFoe && o.fuseAt) drawFuse(x, gy, s, o.fuseAt, now);

  /* 名字：只在"需要辨认"的时候才占地方 —— 32px 精灵挤在一起时，标签比角色还宽。
     做法：名字只写名字（职业已经由配色和武器区分），并按站位交错高度，
     同时把字号压小、底色压薄；退场时仍然显示"退场"。 */
  if (STAGE2.sprite >= 48 && !dead) return;   /* 大精灵（64px）时省掉名字，避免和邻居压字 */
  var label = dead ? '退场' : o.name;
  var stagger = ((o.slot || 0) % 2) ? 9 : 0;
  var lx = x;
  var ly = isFoe ? (by - 8 - stagger) : (gy + 11 + stagger);
  var lw = Math.min(84, label.length * 6.4 + 8);
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = 'rgba(20,16,28,.85)';
  rr(lx - lw / 2, ly - 7, lw, 9.5, 5);
  ctx.fill();
  ctx.restore();
  txt(label, lx, ly, 8,
      dead ? '#6a6480' : (isFoe ? '#e8a7a7' : '#c6bcd8'), 'center', true);
}

/* 投射物 + 命中环：远程单位真的"打了出去" */
function drawShots(now){
  for (var i = 0; i < R.shots.length; i++){
    var s = R.shots[i];
    var p = clamp((now - s.t0) / Math.max(1, s.dur), 0, 1);
    var x = s.x0 + (s.x1 - s.x0) * p;
    var y = s.y0 + (s.y1 - s.y0) * p - Math.sin(p * Math.PI) * 10;   // 抛物线
    ctx.save();
    /* 拖尾 */
    ctx.strokeStyle = s.hostile ? 'rgba(217,109,85,.45)' : 'rgba(232,172,80,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - (s.x1 - s.x0) * 0.05, y + 2 + Math.sin(p * Math.PI) * 10 * 0.05);
    ctx.lineTo(x, y);
    ctx.stroke();
    /* 弹体 */
    ctx.fillStyle = s.hostile ? '#d96d55' : '#f0c06a';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (var j = 0; j < R.fx.length; j++){
    var f = R.fx[j];
    var q = clamp((now - f.t0) / f.dur, 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - q;
    ctx.strokeStyle = '#f0c06a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.x, f.y, 3 + q * 12, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawUnitCard(x, y, u, isFoe, now){
  var hurt = now < u.flash;
  var act = now < u.actFlash;
  rr(x, y, SZ.card, SZ.cardH, 10);
  ctx.fillStyle = hurt ? 'rgba(217,109,85,.22)' : C.panel2;
  ctx.fill();
  ctx.lineWidth = act ? 2 : 1;
  ctx.strokeStyle = act ? C.amber : (hurt ? C.bad : C.line);
  ctx.stroke();

  drawHamsterArt(x + (SZ.card - SZ.art) / 2, y + 6, SZ.art, u);

  /* 卡内底部三条：血条 / 资源强化条 / 出手进度条 */
  var baseY = y + SZ.cardH - 4;
  if (u.eats){
    bar(x + 4, baseY - SZ.slotBar, SZ.card - 8, SZ.slotBar,
        u.charge / Math.max(1, u.need), u.empowered ? C.amber : (u.eats === 'parts' ? '#c7b6ff' : '#ffd98a'), '#2a2338');
    baseY -= SZ.slotBar + 1;
  }
  if (u.atkMs){
    bar(x + 4, baseY - 2, SZ.card - 8, 2, u.timerMs / u.atkMs, 'rgba(255,255,255,.35)', '#2a2338');
    baseY -= 3;
  }
  bar(x + 4, baseY - SZ.hpBar, SZ.card - 8, SZ.hpBar, u.hp / u.hpMax, '#79c98a', '#2a2338');

  txt(u.name, x + SZ.card / 2, y + SZ.cardH + 10, SZ.name, u.alive ? C.muted : '#6a6480', 'center', true);
  if (u.alive){
    var label = u.empowered ? '强化就绪'
      : (u.atkMs ? (Math.max(0, (u.atkMs - u.timerMs) / 1000)).toFixed(1) + 's' : '');
    if (label){
      txt(label, x + SZ.card / 2, y + SZ.cardH + 19, SZ.name,
          u.empowered ? C.amber : '#8f86a6', 'center', true);
    }
  }
  if (!u.alive){
    ctx.fillStyle = 'rgba(20,16,28,.55)';
    rr(x, y, SZ.card, SZ.cardH, 10); ctx.fill();
    txt('累趴', x + SZ.card / 2, y + SZ.cardH / 2 + 3, 9, C.bad, 'center', true);
  }
}

function drawFoeCard(x, y, foe, now){
  var hurt = now < foe.flash;
  var act = now < foe.actFlash;
  rr(x, y, SZ.card, SZ.cardH, 10);
  ctx.fillStyle = hurt ? 'rgba(217,109,85,.22)' : (foe.boss ? 'rgba(217,109,85,.1)' : C.panel2);
  ctx.fill();
  ctx.lineWidth = act ? 2 : 1;
  ctx.strokeStyle = act ? C.bad : (hurt ? C.bad : C.line);
  ctx.stroke();
  drawFoeArt(x + (SZ.card - SZ.art) / 2, y + 6, SZ.art, foe);

  /* 出手倒计时：实时制按毫秒走，条越满越危险 */
  var baseY = y + SZ.cardH - 4;
  var ratio = CFG.realtime
    ? (foe.timerMs / Math.max(1, foe.chargeMs))
    : (foe.charge / Math.max(1, foe.chargeMax));
  var soon = ratio > 0.72;
  bar(x + 4, baseY - SZ.slotBar, SZ.card - 8, SZ.slotBar, ratio,
      soon ? '#ff8a5c' : C.amber, '#2a2338');
  baseY -= SZ.slotBar + 1;
  bar(x + 4, baseY - SZ.hpBar, SZ.card - 8, SZ.hpBar, foe.hp / foe.hpMax, '#d96d55', '#2a2338');

  txt(foe.name, x + SZ.card / 2, y + SZ.cardH + 10, SZ.name, C.muted, 'center', true);
  var cd = CFG.realtime
    ? (Math.max(0, foe.chargeMs - foe.timerMs) / 1000).toFixed(1) + 's'
    : (foe.chargeMax - foe.charge) + '步';
  txt(foe.alive ? cd : '已击退', x + SZ.card / 2, y + SZ.cardH + 19,
      SZ.name, foe.alive ? (soon ? '#ff8a5c' : '#c99') : '#6a6480', 'center');
  if (!foe.alive){
    ctx.fillStyle = 'rgba(20,16,28,.6)';
    rr(x, y, SZ.card, SZ.cardH, 10); ctx.fill();
  }
}

function bar(x, y, w, h, ratio, col, back){
  rr(x, y, w, h, h / 2);
  ctx.fillStyle = back || '#2a2338'; ctx.fill();
  var r = clamp(ratio, 0, 1);
  if (r > 0.02){
    rr(x, y, Math.max(h, w * r), h, h / 2);
    ctx.fillStyle = col; ctx.fill();
  }
}

/* ---------- 17.5 五职业 × 四阶：形态表 + 手里的武器（M6-2） ----------
   白板鼠（tier 1）→ 二级 → 三级 → 四级，每条线 3 次转职、每次换一把武器。
   数值一律走表：这里只声明"这个形态长什么样、有什么手感"，
   具体血量/伤害/间隔都在 ROSTER 里（见文件后段），方便用 __rpgSimAt 调。 */
var CLASS_LINES = ['tank', 'blade', 'shot', 'hex', 'care'];

var CLASS_NAME = {
  none: '白板', tank: '肉盾', blade: '近战', shot: '远程', hex: '魔法', care: '增益'
};

/* 每阶武器名（用于卡面/战报文案，也方便以后接美术按名字找图） */
var WEAPON_NAME = {
  tank:  ['木锅盖', '铁盾 + 短棍', '塔盾 + 钉锤', '铆钉巨盾 + 战锤'],
  blade: ['拳头', '小刀', '斧头', '华丽大宝剑'],
  shot:  ['弹弓', '短弩', '连发弩', '加农炮'],
  hex:   ['火柴', '火把', '电弧线圈', '熔炉核心法杖'],
  care:  ['药膏罐', '针筒', '喷雾罐', '医疗法阵旗']
};

/* 手里那把武器：全部代码矢量，接美术时替换成贴图即可。
   x,y = 手部锚点；s = 角色尺寸；dir = 1 朝右（我方）/ -1 朝左（敌方）。
   swing ∈ [-1,1]：抬手时为负、释放后为正，用来做挥砍/后坐。 */
function drawWeapon(line, tier, x, y, s, dir, swing, isFoe){
  var L = CLASS_LINES.indexOf(line) >= 0 ? line : null;
  if (!L || tier < 2) return;
  var k = s / 54;                       /* 按角色尺寸缩放 */
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.rotate((swing || 0) * 0.5);
  var steel = isFoe ? '#8e8794' : '#c8cfdb';
  var dark  = isFoe ? '#4e4650' : '#6a6f7d';
  var warm  = isFoe ? '#a85a4a' : '#e8ac50';

  if (L === 'blade'){
    if (tier === 2){                    /* 小刀 */
      ctx.strokeStyle = steel; ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15 * k, -2 * k); ctx.stroke();
    } else if (tier === 3){             /* 斧头 */
      ctx.strokeStyle = dark; ctx.lineWidth = 3.4 * k;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13 * k, -3 * k); ctx.stroke();
      ctx.fillStyle = steel;
      ctx.beginPath();
      ctx.moveTo(10 * k, -12 * k); ctx.lineTo(20 * k, -6 * k);
      ctx.lineTo(20 * k, 4 * k); ctx.lineTo(10 * k, 8 * k); ctx.closePath(); ctx.fill();
    } else {                            /* 华丽大宝剑 */
      ctx.strokeStyle = dark; ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6 * k, -2 * k); ctx.stroke();
      ctx.fillStyle = steel;
      ctx.beginPath();
      ctx.moveTo(6 * k, -3 * k); ctx.lineTo(30 * k, -1 * k);
      ctx.lineTo(36 * k, 1.5 * k); ctx.lineTo(30 * k, 4 * k); ctx.lineTo(6 * k, 5 * k);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = warm; ctx.lineWidth = 1.6 * k;
      ctx.beginPath(); ctx.moveTo(6 * k, -7 * k); ctx.lineTo(6 * k, 9 * k); ctx.stroke();
      if (isFoe) { ctx.fillStyle = 'rgba(255,60,70,.5)'; }
      else { ctx.fillStyle = 'rgba(232,172,80,.45)'; }
      ctx.beginPath(); ctx.arc(33 * k, 1.5 * k, 2.4 * k, 0, Math.PI * 2); ctx.fill();
    }
  } else if (L === 'tank'){
    var w = (tier === 2 ? 11 : tier === 3 ? 14 : 17) * k;
    var h = (tier === 2 ? 15 : tier === 3 ? 19 : 23) * k;
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(-2 * k, -h / 2); ctx.lineTo(w, -h / 2 + 2 * k);
    ctx.lineTo(w, h / 2 - 2 * k); ctx.lineTo(-2 * k, h / 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6 * k; ctx.stroke();
    if (tier >= 3){                      /* 钉锤 */
      ctx.fillStyle = dark;
      ctx.fillRect(-6 * k, -2 * k, 8 * k, 3 * k);
      ctx.beginPath(); ctx.arc(-8 * k, -0.5 * k, 3.4 * k, 0, Math.PI * 2); ctx.fill();
    }
    if (tier === 4){                     /* 铆钉 */
      ctx.fillStyle = warm;
      for (var i = 0; i < 3; i++){
        ctx.beginPath(); ctx.arc(w * 0.35 + i * 3.4 * k, -h * 0.3 + i * 4 * k, 1.3 * k, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (L === 'shot'){
    if (tier === 2){                     /* 短弩 */
      ctx.strokeStyle = dark; ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14 * k, -2 * k); ctx.stroke();
      ctx.strokeStyle = steel; ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.arc(11 * k, -2 * k, 7 * k, -1.1, 1.1); ctx.stroke();
    } else if (tier === 3){              /* 连发弩 */
      ctx.strokeStyle = dark; ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16 * k, -2 * k); ctx.stroke();
      ctx.strokeStyle = steel; ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.arc(12 * k, -2 * k, 8 * k, -1.0, 1.0); ctx.stroke();
      ctx.beginPath(); ctx.arc(12 * k, -2 * k, 5 * k, -1.0, 1.0); ctx.stroke();
    } else {                             /* 加农炮 */
      ctx.fillStyle = dark;
      ctx.fillRect(0, -5 * k, 22 * k, 9 * k);
      ctx.fillStyle = steel;
      ctx.beginPath(); ctx.arc(22 * k, -0.5 * k, 5 * k, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,180,90,.55)';
      ctx.beginPath(); ctx.arc(25 * k, -0.5 * k, 3 * k, 0, Math.PI * 2); ctx.fill();
    }
  } else if (L === 'hex'){
    ctx.strokeStyle = dark; ctx.lineWidth = 2.6 * k;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16 * k, -6 * k); ctx.stroke();
    var core = isFoe ? '#ff5468' : '#ffd27a';
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(18 * k, -7 * k, (tier === 2 ? 2.4 : tier === 3 ? 3.4 : 5) * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,122,.45)';
    ctx.lineWidth = 1.2 * k;
    if (tier >= 3){
      ctx.beginPath(); ctx.arc(18 * k, -7 * k, 7 * k, -0.8, 0.8); ctx.stroke();
    }
    if (tier === 4){
      ctx.beginPath(); ctx.arc(18 * k, -7 * k, 10 * k, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (L === 'care'){
    if (tier === 2){                     /* 针筒 */
      ctx.fillStyle = steel;
      ctx.fillRect(0, -2 * k, 14 * k, 4 * k);
      ctx.strokeStyle = dark; ctx.lineWidth = 1.6 * k;
      ctx.beginPath(); ctx.moveTo(14 * k, 0); ctx.lineTo(19 * k, 0); ctx.stroke();
    } else if (tier === 3){              /* 喷雾罐 */
      ctx.fillStyle = steel;
      rr(0, -5 * k, 10 * k, 10 * k, 2 * k); ctx.fill();
      ctx.fillStyle = warm;
      ctx.beginPath(); ctx.arc(14 * k, -6 * k, 2.2 * k, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(17 * k, -9 * k, 1.6 * k, 0, Math.PI * 2); ctx.fill();
    } else {                             /* 医疗法阵旗 */
      ctx.strokeStyle = dark; ctx.lineWidth = 2.2 * k;
      ctx.beginPath(); ctx.moveTo(0, 4 * k); ctx.lineTo(0, -18 * k); ctx.stroke();
      ctx.fillStyle = isFoe ? '#a85a4a' : '#79c98a';
      rr(0, -18 * k, 14 * k, 9 * k, 1.6 * k); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(6 * k, -16.5 * k, 2 * k, 6 * k);
      ctx.fillRect(4 * k, -14.5 * k, 6 * k, 2 * k);
    }
  }
  ctx.restore();
}

/* ---------- 16. 矢量角色（占位美术，尺寸由 SZ.art 控制） ---------- */
function drawHamsterArt(x, y, s, u){
  ctx.save();
  ctx.translate(x, y);
  /* 耳朵 */
  ctx.fillStyle = '#c98f5e';
  ctx.beginPath(); ctx.arc(s * 0.24, s * 0.2, s * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.76, s * 0.2, s * 0.13, 0, Math.PI * 2); ctx.fill();
  /* 身体 */
  rr(0, s * 0.14, s, s * 0.8, s * 0.32);
  ctx.fillStyle = u.line === 'wrench' ? '#cfd4de' : '#e5b982';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = u.line === 'wrench' ? '#7c8494' : '#a9762c';
  ctx.stroke();
  /* 脸颊 */
  ctx.fillStyle = '#f4dcc0';
  ctx.beginPath(); ctx.arc(s * 0.5, s * 0.64, s * 0.28, 0, Math.PI * 2); ctx.fill();
  /* 眼睛 */
  ctx.fillStyle = '#2a2338';
  ctx.beginPath(); ctx.arc(s * 0.35, s * 0.5, s * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.65, s * 0.5, s * 0.07, 0, Math.PI * 2); ctx.fill();

  /* 职业标识：只用 2~3 笔，缩到 42px 还认得出 */
  if (u.line === 'wrench'){
    ctx.strokeStyle = '#7c8494'; ctx.lineWidth = s * 0.09;
    ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.9); ctx.lineTo(s * 0.8, s * 0.9); ctx.stroke();
    ctx.fillStyle = '#8e97a8';
    for (var i = 0; i < 3; i++){
      ctx.beginPath(); ctx.arc(s * (0.28 + i * 0.22), s * 0.9, s * 0.045, 0, Math.PI * 2); ctx.fill();
    }
  } else if (u.line === 'driver'){
    ctx.fillStyle = '#8e97a8';
    rr(s * 0.62, s * 0.42, s * 0.44, s * 0.16, s * 0.06); ctx.fill();
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath(); ctx.arc(s * 0.32, s * 0.62, s * 0.09, 0, Math.PI * 2); ctx.fill();
  } else if (u.line === 'spring'){
    ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    for (var k = 0; k <= 6; k++){
      var px = s * (0.24 + k * 0.09), py = s * (0.86 + ((k % 2) ? -0.05 : 0.05));
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (u.line === 'medic'){
    ctx.fillStyle = '#e37b6d';
    ctx.fillRect(s * 0.46, s * 0.6, s * 0.08, s * 0.24);
    ctx.fillRect(s * 0.38, s * 0.68, s * 0.24, s * 0.08);
  } else if (u.line === 'sack'){
    ctx.fillStyle = '#a48b6a';
    rr(s * 0.66, s * 0.62, s * 0.3, s * 0.28, s * 0.08); ctx.fill();
  }
  ctx.restore();
}

function drawFoeArt(x, y, s, foe){
  ctx.save();
  ctx.translate(x, y);
  var body = '#9aa0ad';
  ctx.fillStyle = body;
  rr(s * 0.08, s * 0.3, s * 0.84, s * 0.66, s * 0.3); ctx.fill();
  ctx.lineWidth = 1.4; ctx.strokeStyle = '#5c6270'; ctx.stroke();
  /* 耳朵 */
  ctx.fillStyle = '#8b91a0';
  ctx.beginPath(); ctx.arc(s * 0.26, s * 0.3, s * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.74, s * 0.3, s * 0.12, 0, Math.PI * 2); ctx.fill();
  /* 眼睛（尖牙帮统一：红豆眼） */
  ctx.fillStyle = '#ff6f61';
  ctx.beginPath(); ctx.arc(s * 0.35, s * 0.58, s * 0.075, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.65, s * 0.58, s * 0.075, 0, Math.PI * 2); ctx.fill();
  /* 尖牙 */
  ctx.fillStyle = '#fff4e2';
  ctx.beginPath();
  ctx.moveTo(s * 0.44, s * 0.78); ctx.lineTo(s * 0.5, s * 0.88); ctx.lineTo(s * 0.56, s * 0.78);
  ctx.closePath(); ctx.fill();

  if (foe.type === 'crate'){
    /* 纸箱头盔 */
    ctx.fillStyle = '#c19a63';
    rr(s * 0.14, s * 0.04, s * 0.72, s * 0.36, s * 0.05); ctx.fill();
    ctx.strokeStyle = '#8d6b3c'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.06); ctx.lineTo(s * 0.5, s * 0.38); ctx.stroke();
    if (foe.box > 0){ ctx.fillStyle = 'rgba(193,154,99,.55)'; rr(s * 0.1, s * 0.02, s * 0.8, s * 0.4, s * 0.06); ctx.fill(); }
  } else if (foe.type === 'shell'){
    /* 背上的果壳堆 */
    ctx.fillStyle = '#b98b5e';
    for (var i = 0; i < 3; i++){
      ctx.beginPath();
      ctx.ellipse(s * (0.3 + i * 0.2), s * 0.26, s * 0.1, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (foe.boss){
    /* 机械臂：方头 + 液压杆 */
    ctx.fillStyle = '#8e97a8';
    rr(s * 0.2, s * 0.06, s * 0.6, s * 0.3, s * 0.08); ctx.fill();
    ctx.strokeStyle = '#5c6270'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = s * 0.08;
    ctx.beginPath(); ctx.moveTo(s * 0.86, s * 0.5); ctx.lineTo(s * 0.98, s * 0.78); ctx.stroke();
  }
  ctx.restore();
}

/* ---------- 17. 顶栏接管：敌方血条取代"进度" ---------- */
drawHeader = function(){
  var p = L.pad, y = Math.round(L.headerH * 0.42);
  txt('第 ' + S.level + ' 关 · ' + CHAPTER.name, p, y, Math.round(W * 0.043), C.ink, 'left', true);
  txt('消除 ' + (S.swapCount || 0) + ' 次 · 无限步', W - p, y, Math.round(W * 0.034), C.muted, 'right', true);

  var bh = Math.max(12, Math.round(H * 0.017));
  var by = y + Math.round(H * 0.018);
  var fs = Math.max(10, Math.round(W * 0.031));
  var target = aliveEnemies()[0];
  var name = target ? target.name : (R.queue.length ? R.queue[0].name : '下一波待命');
  var hp = target ? target.hp : 0;
  var hpMax = target ? target.hpMax : 1;
  var lbl = '存活 ' + aliveUnits().length + '/' + R.units.filter(Boolean).length +
            (target ? ' · ' + name + ' ' + Math.max(0, Math.round(hp)) + '/' + hpMax : '');
  ctx.font = '700 ' + fs + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  var lw = ctx.measureText(lbl).width;
  var bw = Math.max(60, W - p * 2 - lw - 10);

  rr(p, by, bw, bh, bh / 2); ctx.fillStyle = C.panel2; ctx.fill();
  var ratio = clamp((target ? hp : 0) / Math.max(1, hpMax), 0, 1);
  if (ratio > 0){
    rr(p, by, Math.max(bh, bw * ratio), bh, bh / 2);
    ctx.fillStyle = C.bad; ctx.fill();
  }
  txt(lbl, W - p, by + bh - Math.round(bh * 0.2), fs, C.muted, 'right', true);
};

/* ---------- 18. 结算卡片：换成 RPG 数据 ---------- */
drawEnd = function(){
  var win = S.phase === 'win';
  var padIn = 22;
  var wCard = w0();
  var titleSize = Math.round(W * 0.052);
  var rowSize = Math.max(11, Math.round(W * 0.034));
  var lh = Math.round(rowSize * 1.85);

  var rows = [
    ['波次', Math.min(R.waveTotal, R.wave + (win ? 1 : 0)) + ' / ' + R.waveTotal],
    ['击退鼠群', R.kills + ' 只'],
    ['累计伤害', Math.round(R.dmgDealt)],
    ['存活仓鼠', aliveUnits().length + ' / ' + R.units.filter(Boolean).length]
  ];
  var btnH = Math.round(Math.min(44, W * 0.115));
  var yTitle = 40, ySub = yTitle + 30;
  var yRows = ySub + 26;
  var h = yRows + rows.length * lh + 16 + btnH + 22;
  h = Math.min(h, Math.round(H * 0.9));

  var box = cardBox(h);
  var x = box[0], y = box[1], w = box[2];

  txt(win ? '守住了' : '全队阵亡', W / 2, y + yTitle, titleSize, win ? C.amber : C.bad, 'center', true);
  txt(CHAPTER.name + ' · 第 ' + S.level + ' 关', W / 2, y + ySub, Math.round(W * 0.036), C.muted, 'center', true);

  for (var i = 0; i < rows.length; i++){
    txt(rows[i][0], x + padIn, y + yRows + i * lh, rowSize, C.muted, 'left');
    txt(String(rows[i][1]), x + w - padIn, y + yRows + i * lh, rowSize, C.ink, 'right', true);
  }

  var bw = Math.round(w * 0.52), bh = btnH;
  var bx = W / 2 - bw / 2, byy = y + h - bh - 22;
  rr(bx, byy, bw, bh, bh / 2);
  ctx.fillStyle = win ? C.amber : C.panel;
  ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.amber; ctx.stroke();
  txt(win ? '再开一厂' : '重新开工', bx + bw / 2, byy + bh * 0.66,
      Math.max(12, Math.round(W * 0.038)), win ? '#241d2e' : C.amber, 'center', true);
  HIT.again = [bx, byy, bw, bh];
};

/* ---------- 19. 大招：能量满点按钮 ---------- */
function useUlt(){
  if (S.phase !== 'play' || S.anim) return false;
  if (R.mod && R.mod.noUlt) return false;       // 某些关卡停电：大招停用
  if (R.energy < CFG.ult.cost) return false;
  R.energy = 0;
  var list = aliveEnemies();
  /* 5 人版：伤害随上阵人数走，别让"少上人"变成更划算的选择 */
  var dmg = 14 + 4 * aliveUnits().length;
  for (var i = 0; i < list.length; i++) hurtFoe(list[i], dmg, true);
  if (R.tut) R.tutUlt = true;
  R.ultFlash = performance.now() + 420;
  floatText('全厂爆产 ' + dmg, W / 2, L.giftY + L.giftH * 0.22, C.amber, true);
  sfx('tool');
  checkBattleEnd();
  return true;
}

canvas.addEventListener('pointerdown', function(e){
  try {
    var rect = canvas.getBoundingClientRect();
    var pt = [e.clientX - rect.left, e.clientY - rect.top - SAFE_TOP];
    if (HIT.ult && inRect(pt, HIT.ult)){
      var blockedNow = explainUlt();          /* 停电关：先说清原因 */
      if (blockedNow || useUlt()){ e.preventDefault(); e.stopImmediatePropagation(); }
    }
  } catch (err) {}
}, true);

window.addEventListener('keydown', function(e){
  if (e.key === 'q' || e.key === 'Q') useUlt();
}, false);

/* ---------- 20. 自动化接口补字段 ---------- */
var _rpgGameState = window.__gameState;
window.__gameState = function(){
  var st = _rpgGameState ? _rpgGameState() : {};
  st.score = Math.round(R.dmgDealt);
  st.hearts = S.swapCount || 0;   // 无限步：把"已消次数"作为读数报给试玩报告
  st.rpg = {
    alive: aliveUnits().length,
    total: R.units.filter(Boolean).length,
    armor: Math.round(R.armor), armorMax: R.armorMax,
    parts: Math.round(R.parts), partsMax: R.partsMax,
    energy: Math.round(R.energy), energyMax: R.energyMax,
    wave: R.wave + 1, waveTotal: R.waveTotal,
    kills: R.kills,
    realtime: !!CFG.realtime,
    outOfStock: !!R.outOfStock,
    units: R.units.map(function(u){
      return u ? { id: u.id, name: u.name, hp: Math.round(u.hp), hpMax: u.hpMax,
        eats: u.eats, charge: Math.round(u.charge), need: u.need, alive: u.alive,
        atkMs: u.atkMs, timerMs: Math.round(u.timerMs), empowered: !!u.empowered } : null;
    }),
    enemies: R.enemies.filter(function(f){ return f; }).map(function(f){
      return { type: f.type, name: f.name, hp: Math.round(f.hp), hpMax: f.hpMax, charge: f.charge, alive: f.alive };
    }),
    queue: R.queue.length
  };
  return st;
};

/* 自动试玩：波间补给先选，能量满了放大招，其余交给原调度（开局 / 最优交换） */
var _rpgAutoplay = window.__autoplay;
window.__autoplay = function(st){
  /* 教学关：自动试玩替玩家把三页说明点完，别卡住 */
  if (R.tut && R.tutSwap && !R.tutUlt){
    R.tutRes = (R.tutRes | 0) + 1;
    if (R.tutRes >= 3){ R.tutRes = 3; R.tutUlt = true; }
    return 'tut';
  }
  if (S.phase === 'pick'){ chooseBuff(0); return 'pick'; }
  if (S.phase === 'play' && !S.anim && R.energy >= CFG.ult.cost){ useUlt(); return 'ult'; }
  return _rpgAutoplay ? _rpgAutoplay(st) : 'wait';
};

/* 调试口 */
window.__rpg = function(){ return R; };
window.__rpgUlt = useUlt;

/* 配平模拟器：instant 模式下按"会用工具 + 满能量就放大招 + 最优交换"跑 N 局。
   原工程的 __testRun 不认识大招，用它配平会把伤害低估一半。 */
window.__rpgSim = function(games, seed0){
  games = games || 10;
  seed0 = seed0 === undefined ? 20261120 : seed0;
  var wasInstant = S.instant;
  S.instant = true;
  var wins = 0, stepsLeft = [], dmgDealt = [], stuckN = 0, perWave = [];
  for (var g = 0; g < games; g++){
    S.phase = 'title';               // 绕开商店守卫：模拟器要的是"重开一局"
    newRun((seed0 + g * 7919) | 0);
    var guard = 0;
    while ((S.phase === 'play' || S.phase === 'pick') && guard++ < 500){
      if (S.phase === 'pick'){ chooseBuff(0); continue; }   // 模拟器固定选第一张
      if (R.energy >= CFG.ult.cost){ useUlt(); continue; }
      var usedTool = false;
      for (var t = 0; t < TOOLS.length; t++){
        if (S.tools[t] > 0){
          useTool(t, TOOLS[t].needsCell ? [2, 2] : null);
          usedTool = true;
          break;
        }
      }
      if (usedTool) continue;
      var mv = bestMove(S.board);
      if (!mv){ stuckN++; break; }
      unitTick(1200);   // 一步按 1.2 秒算，让自动战斗的输出也计入
      trySwap(mv[0], mv[1]);
    }
    if (S.phase === 'win'){ wins++; stepsLeft.push(S.swapCount || 0); dmgDealt.push(Math.round(R.dmgDealt)); }
    perWave.push(R.wave + 1);
  }
  S.instant = wasInstant;
  var avg = function(a){ if (!a.length) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return Math.round(s / a.length * 10) / 10; };
  return {
    games: games, winRate: Math.round(wins / Math.max(1, games) * 100),
    avgStepsLeft: avg(stepsLeft), avgDmg: avg(dmgDealt), stuck: stuckN,
    wavesReached: perWave
  };
};
/* 舞台自检口：走位 / 抬手 / 弹道到底有没有在跑 */
window.__stage = function(){
  var pick = function(o){
    return { name: o.name, x: Math.round(unitX(o)), y: Math.round(unitY(o)),
             scale: Math.round(depthScale(unitY(o)) * 100) / 100,
             range: o.range || '',
             windup: Math.round(o.windup || 0), hp: Math.round(o.hp), alive: !!o.alive };
  };
  return {
    floor: floorRect(), box: { y: L.giftY, h: L.giftH },
    sprite: STAGE2.sprite,
    units: R.units.map(function(u){ return u ? pick(u) : null; }),
    foes: R.enemies.filter(function(f){ return !!f; }).map(pick),
    shots: R.shots.length, fx: R.fx.length,
    reach: STAGE2.reach, windupMs: STAGE.windupMs
  };
};
/* 五职业 × 四阶自检口：把 20 个形态连数值一起吐出来 */
window.__ultWhy = function(){ return ultWhy(); };
window.__swapAt = function(a, b){ return trySwap(a, b); };   /* 走完整的包装链（含教学/记账） */
/* ---------- 精灵导出（给美术用的像素底稿） ----------
   __spritePNG(line, tier, px)：把某个形态光栅化到 px×px 的透明画布，返回 dataURL。
   __spriteSheetPNG(px)：16 个形态拼成一张总览图。
   导出器 tools/export-sprites.mjs 会调用这两个口，把 PNG 落到 assets/units/。 */
var SPRITE_FORMS = (function(){
  var out = [{ line: 'none', tier: 1 }];
  for (var i = 0; i < 5; i++){
    for (var t = 2; t <= 4; t++) out.push({ line: CLASS_LINES[i], tier: t });
  }
  return out;
})();

function renderSpriteTo(canvas, line, tier, px, isFoe){
  var g = canvas.getContext('2d');
  g.clearRect(0, 0, px, px);
  g.imageSmoothingEnabled = false;
  var real = ctx;
  ctx = g;
  try {
    var id = (line === 'none') ? 'worker' : (line + '-' + tier);
    var def = ROSTER[id] || ROSTER.worker;
    var fake = { name: def.name, line: def.line || line, cls: def.cls || line, tier: tier || 1 };
    var body = px * 0.78;
    drawHamsterArt(px * 0.05, px * 0.10, body, fake);
    drawWeapon(line, tier || 1, px * 0.66, px * 0.62, body * 0.72, 1, 0, !!isFoe);
  } finally {
    ctx = real;
  }
}

/* 真·像素化：把画布按 grid 网格重新落色 + alpha 二值化（半透明边缘一律砍掉）。
   这是"矢量画"和"像素画"的区别所在：像素画必须有网格和限色。 */
var SPRITE_PALETTE = [
  [42, 35, 56], [26, 21, 36], [60, 50, 80], [96, 78, 116], [140, 120, 160], [176, 160, 196],
  [229, 185, 130], [201, 143, 94], [244, 220, 192], [255, 255, 255],
  [200, 207, 219], [138, 146, 160], [106, 111, 125], [78, 70, 80],
  /* 描边色：矢量原稿的棕描边与铁灰描边，少了它们像素化后轮廓会偏红 */
  [169, 118, 44], [124, 132, 148], [142, 151, 168],
  [232, 172, 80], [255, 217, 138], [255, 209, 102],
  [122, 201, 138], [159, 198, 255], [199, 182, 255],
  [217, 109, 85], [255, 157, 138], [179, 64, 47], [142, 135, 148]
];

function pixelateCanvas(g, size){
  var img;
  try { img = g.getImageData(0, 0, size, size); } catch (e) { return; }
  var d = img.data;
  for (var i = 0; i < d.length; i += 4){
    if (d[i + 3] < 128){ d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    var r = d[i], gg = d[i + 1], b = d[i + 2], best = 0, bd = Infinity;
    for (var p = 0; p < SPRITE_PALETTE.length; p++){
      var pr = SPRITE_PALETTE[p][0], pg = SPRITE_PALETTE[p][1], pb = SPRITE_PALETTE[p][2];
      var dist = (r - pr) * (r - pr) + (gg - pg) * (gg - pg) + (b - pb) * (b - pb);
      if (dist < bd){ bd = dist; best = p; }
    }
    d[i] = SPRITE_PALETTE[best][0];
    d[i + 1] = SPRITE_PALETTE[best][1];
    d[i + 2] = SPRITE_PALETTE[best][2];
  }
  g.putImageData(img, 0, 0);
}

/* 先按 grid（比如 27）画，落色成像素；再 NEAREST 放大到 out 尺寸 */
function makePixelSprite(line, tier, grid, out, isFoe){
  grid = Math.max(8, Math.round(grid));
  out = Math.max(grid, Math.round(out || grid));
  var small = document.createElement('canvas');
  small.width = grid; small.height = grid;
  renderSpriteTo(small, line, tier, grid, isFoe);
  pixelateCanvas(small.getContext('2d'), grid);
  if (out === grid) return small;
  var big = document.createElement('canvas');
  big.width = out; big.height = out;
  var bg = big.getContext('2d');
  bg.imageSmoothingEnabled = false;
  bg.drawImage(small, 0, 0, out, out);
  return big;
}

window.__spritePNG = function(line, tier, grid, out, isFoe){
  return makePixelSprite(line, tier, grid || 27, out || (grid || 27) * 4, isFoe).toDataURL('image/png');
};

window.__spriteSheetPNG = function(grid, cols, out){
  grid = Math.max(8, Math.round(grid || 27));
  out = Math.max(grid, Math.round(out || grid * 4));
  cols = cols || 4;
  var rows = Math.ceil(SPRITE_FORMS.length / cols);
  var pad = Math.round(out * 0.16);
  var W2 = cols * (out + pad) + pad, H2 = rows * (out + pad) + pad;
  var sheet = document.createElement('canvas');
  sheet.width = W2; sheet.height = H2;
  var sg = sheet.getContext('2d');
  sg.imageSmoothingEnabled = false;
  sg.fillStyle = '#241d2e'; sg.fillRect(0, 0, W2, H2);
  for (var i = 0; i < SPRITE_FORMS.length; i++){
    var f = SPRITE_FORMS[i];
    var cell = makePixelSprite(f.line, f.tier, grid, out, false);
    var cx = pad + (i % cols) * (out + pad);
    var cy = pad + Math.floor(i / cols) * (out + pad);
    sg.drawImage(cell, cx, cy, out, out);
  }
  return { png: sheet.toDataURL('image/png'), w: W2, h: H2, forms: SPRITE_FORMS.slice() };
};

/* 开发口：手动打开"波间补给三选一"，方便截图标看效果 */
window.__bet = function(){
  return {
    bet: R.bet ? { amount: R.bet.amount, hp: R.bet.hp } : null,
    coins: (typeof SHOP !== 'undefined' && SHOP && typeof SHOP.coins === 'number') ? SHOP.coins : null
  };
};
window.__forceClearWave = function(){
  for (var i = 0; i < R.enemies.length; i++){ if (R.enemies[i]) { R.enemies[i].alive = false; R.enemies[i].hp = 0; } }
  R.queue = [];
  checkBattleEnd();
  return window.__bet();
};

/* 调试口：用指定伤害类型打第一只活敌，返回前后血量与箱子状态（S1 验证用） */
/* 敌人特色自检：逐个跑一遍，返回是否生效（确定性，不依赖随机战斗） */
window.__enemySelfTest = function(){
  var out = {};
  var now = performance.now();

  /* ① 破箱怒气：箱子打掉后 chargeMs 应该变小 */
  var crate = foeMake('crate', 2);
  crate.box = 1;
  var c0 = crate.chargeMs;
  hurtFoe(crate, 5, false, null, 'phys');
  out.rage = { before: c0, after: crate.chargeMs, ok: crate.chargeMs < c0 && !!crate.rage };

  /* ② 半穿甲：护甲只吸收 50% */
  var savedArmor = R.armor;
  R.armor = 100;
  var dummy = R.units.filter(Boolean)[0] || { hp: 100, hpMax: 100, alive: true, x: 100, y: 200 };
  applyUnitDamage(dummy, 20, 0.5, 'phys');
  out.pierce = { armorLeft: Math.round(R.armor), expectAbout: 90 };
  R.armor = savedArmor;

  /* ③ 拾荒偷钱 */
  var thief = foeMake('thief', 2);
  var savedCoins = (typeof SHOP !== 'undefined' && SHOP) ? SHOP.coins : 0;
  if (typeof SHOP !== 'undefined' && SHOP) SHOP.coins = savedCoins + 100;
  var coins0 = (typeof SHOP !== 'undefined' && SHOP) ? SHOP.coins : 0;
  thiefSteal(thief);
  var coins1 = (typeof SHOP !== 'undefined' && SHOP) ? SHOP.coins : 0;
  out.steal = { before: coins0 - 100, after: coins1, stolen: thief.stolen || 0, ok: coins1 < coins0 };
  if (typeof SHOP !== 'undefined' && SHOP) SHOP.coins = savedCoins;

  /* ④ 撤离 */
  thief.fleeAt = now - 1;
  R.enemies.push(thief);
  thiefTick(now);
  out.flee = { alive: thief.alive, ok: thief.alive === false };

  /* ⑤ boss 超载 */
  var boss = foeMake('boss', 2);
  boss.hp = Math.round(boss.hpMax * 0.4);
  R.enemies.push(boss);
  var b0 = boss.chargeMs;
  bossOverload();
  out.overload = { chargeBefore: b0, chargeAfter: boss.chargeMs, resPDelta: boss.resPDelta,
                   ok: !!boss.overload && boss.chargeMs < b0 };

  /* ⑥ 胶水治疗 */
  var glue = foeMake('glue', 2);
  var hurtF = foeMake('crate', 2);
  hurtF.hp = Math.round(hurtF.hpMax * 0.5);
  var savedFoes = R.enemies;
  R.enemies = [glue, hurtF];                 /* 干净的列表，确保治疗落在 hurtF 身上 */
  glue.healAt = now - 1;
  var h0 = hurtF.hp;
  glueTick(now);
  out.glueHeal = { before: Math.round(h0), after: Math.round(hurtF.hp), heal: Math.round(hurtF.hpMax * 0.1), ok: hurtF.hp > h0 };
  R.enemies = savedFoes;

  /* 清理测试用的敌人 */
  R.enemies = R.enemies.filter(function(f){ return f !== thief && f !== boss; });
  return out;
};

window.__foeMake = function(type, tier, elite){ return foeMake(type, tier, elite); };
/* 调试口：当前每个单位用的动画帧 + 离地量（验证"跳着走"） */
window.__animInfo = function(){
  var now = performance.now();
  var out = [];
  var push = function(list, isFoe){
    for (var i = 0; i < list.length; i++){
      var u = list[i];
      if (!u || !u.alive) continue;
      out.push({
        who: (u.name || ('#' + i)) + (isFoe ? '(敌)' : ''),
        slot: u.slot,
        x: Math.round(unitX(u)), y: Math.round(unitY(u)),
        frame: isFoe ? foeFrameName(u, now) : unitFrameName(u, isFoe, now),
        lift: hopLift(u, now),
        moving: !!(u.movedAt && now - u.movedAt < 200)
      });
    }
  };
  push(R.units, false);
  push(R.enemies, true);
  return out;
};

window.__hitTest = function(kind, dmg){
  var foe = R.enemies.filter(function(f){ return f && f.alive; })[0];
  if (!foe) return { err: 'no foe' };
  var before = { hp: Math.round(foe.hp), box: foe.box | 0 };
  hurtFoe(foe, dmg || 10, false, R.units.filter(Boolean)[0], kind || 'phys');
  return { kind: kind || 'phys', before: before, after: { hp: Math.round(foe.hp), box: foe.box | 0 },
           type: foe.type, resP: foeRes(foe, 'phys'), resM: foeRes(foe, 'mag') };
};

window.__foeArt = function(){
  var map = unitArtMap();
  return R.enemies.filter(Boolean).map(function(f){
    var keys = foeArtKeys(f);
    return { name: f.name, type: f.type, cls: f.cls, tier: f.tier, keys: keys,
             hit: keys.filter(function(k){ return !!map[k]; }) };
  });
};
window.__openPick = function(){
  openPick();
  return S.phase;
};

window.__grid = function(v){
  R.showGrid = (v === undefined) ? !R.showGrid : !!v;
  return R.showGrid;
};

window.__artDiag = function(){
  var map = unitArtMap();
  var keys = Object.keys(map);
  var loaded = keys.filter(function(k){ return ART_IMG[k] && ART_IMG[k].__ready; });
  return { keys: keys.length, loaded: loaded.length, draws: ART_DIAG.draws, misses: ART_DIAG.misses, sample: loaded.slice(0, 4) };
};
window.__forms = function(){
  var out = [{ id: 'worker', name: '白板鼠', cls: 'none', tier: 1, hp: ROSTER.worker.hp,
               atkMs: ROSTER.worker.atkMs, base: ROSTER.worker.baseDmg, act: ROSTER.worker.act }];
  for (var i = 0; i < CLASS_LINES.length; i++){
    var line = CLASS_LINES[i];
    for (var t = 2; t <= 4; t++){
      var def = ROSTER[line + '-' + t];
      if (!def) continue;
      out.push({
        id: line + '-' + t, name: def.name, cls: def.cls, tier: def.tier,
        hp: def.hp, atkMs: def.atkMs, base: def.baseDmg, act: def.act,
        eats: def.eats, need: def.need, weapon: (WEAPON_NAME[line] || [])[t - 1],
        range: def.atkMs ? (def.cls === 'blade' || def.cls === 'tank' ? 'melee' : (def.cls === 'hex' ? 'mid' : 'far')) : 'melee'
      });
    }
  }
  return out;
};
window.__rpgHit = function(dmg, pierce){ hurtTeam(dmg, !!pierce); return { alive: aliveUnits().length, armor: R.armor }; };
/* 逐关配平：和 __rpgSim 同口径（instant、最优交换、满能量放大招、会用工具），
   但先把关卡跳到 level 再开打，用来验证 rules.rpg.levels 里每一关的难度。
   __rpgSimAt(4, 10) → 第 4 关跑 10 局。 */
window.__rpgSimAt = function(level, games, seed0){
  games = games || 8;
  seed0 = seed0 === undefined ? 20261120 : seed0;
  var wasInstant = S.instant;
  S.instant = true;
  var wins = 0, dmgDealt = [], perWave = [], stuckN = 0;
  for (var g = 0; g < games; g++){
    S.phase = 'title';                                  // 绕开商店守卫
    S.seed = (seed0 + g * 7919) | 0;                    // 每关同一批种子，才可比
    S.rng = mulberry32(S.seed);
    SHOP.level = Math.max(1, level) - 1;
    window.__shopNext();                                // startNextLevel()：+1 后 startLevel(真关卡)
    var guard = 0;
    while ((S.phase === 'play' || S.phase === 'pick') && guard++ < 600){
      if (S.phase === 'pick'){ chooseBuff(0); continue; }
      if (!(R.mod && R.mod.noUlt) && R.energy >= CFG.ult.cost){ useUlt(); continue; }
      var usedTool = false;
      for (var t = 0; t < TOOLS.length; t++){
        if (S.tools[t] > 0){
          useTool(t, TOOLS[t].needsCell ? [2, 2] : null);
          usedTool = true;
          break;
        }
      }
      if (usedTool) continue;
      var mv = bestMove(S.board);
      if (!mv){ stuckN++; break; }
      unitTick(1200);
      trySwap(mv[0], mv[1]);
    }
    if (S.phase === 'win'){ wins++; dmgDealt.push(Math.round(R.dmgDealt)); }
    perWave.push(R.wave + 1);
  }
  S.instant = wasInstant;
  var avg = function(a){ if (!a.length) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return Math.round(s / a.length * 10) / 10; };
  return {
    level: level, games: games, winRate: Math.round(wins / Math.max(1, games) * 100),
    avgDmg: avg(dmgDealt), avgWave: avg(perWave), stuck: stuckN,
    cfg: R.cfg ? { name: R.cfg.name, round: R.cfg.round, waves: (R.cfg.waves || []).length } : null,
    wavesReached: perWave
  };
};

/* 批量模拟用：把战斗时钟整体加速（动画不加速，所以玩家侧偏保守） */
window.__setTimeScale = function(v){ CFG.timeScale = Math.max(0.1, Number(v) || 1); return CFG.timeScale; };
/* 波间三选一：测试口 */
window.__pick = function(i){ chooseBuff(i); return R.pick ? R.pick.map(function(b){ return b.name; }) : []; };
/* 强行指定三张卡（测试用）：__pickForce(['armorCap','dmgUp']) */
window.__pickForce = function(ids){
  R.pick = [];
  for (var i = 0; i < ids.length; i++){
    for (var j = 0; j < BUFF_DECK.length; j++){
      if (BUFF_DECK[j].id === ids[i]) R.pick.push(BUFF_DECK[j]);
    }
  }
  S.phase = 'pick';
  return R.pick.map(function(b){ return b.id; });
};

