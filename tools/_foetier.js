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
  }
  return Math.max(1, Math.min(4, base));
}
