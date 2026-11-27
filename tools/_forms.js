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
