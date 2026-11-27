/* ---------- 15. 舞台：左右对峙的走位制（M6-5，去掉卡片） ----------
   我方在左、敌方在右，都站在同一条地面线上，靠 x 坐标真的走过去贴身。
   没有卡片框：只有角色本体 + 头顶血条 + 脚下的名字。以后接美术就是替换
   drawUnitSprite() 里画的那张图，位置/血条/名字都不用改。
   竖屏 390 宽：一排最多 5 只，站位间距 42px，两侧在中间地带交火。 */
var STAGE2 = {
  sprite: 38,      // 角色基准尺寸（宽=高*1.0 的方框内画）
  pitch: 42,       // 同侧相邻站位间距
  reach: 34,       // 近战贴到这个距离就能挥
  groundPad: 150,  // 地面线距舞台底部的距离（下面留给战况/资源条）
  jitter: 9        // 前后错开的深度差，避免完全重叠
};

function groundLine(){ return L.giftY + L.giftH - STAGE2.groundPad; }
function homeX(idx, isFoe){
  var edge = 12;
  return isFoe
    ? (W - edge - STAGE2.pitch * 0.5 - idx * STAGE2.pitch)
    : (edge + STAGE2.pitch * 0.5 + idx * STAGE2.pitch);
}
function ensurePos(o, idx, isFoe){
  if (!o) return;
  if (typeof o.x !== 'number') o.x = homeX(idx, isFoe);
  if (typeof o.yo !== 'number') o.yo = (idx % 2 ? STAGE2.jitter : 0);
}
function unitX(o){ return (o && typeof o.x === 'number') ? o.x : W / 2; }

/* 兼容旧调用（浮字 / 弹道锚点都走这两个） */
function stageXOf(u, isFoe){ return u ? unitX(u) : W / 2; }
function stageYOf(u, isFoe){
  var gy = groundLine() + (u ? (u.yo || 0) : 0);
  return gy - STAGE2.sprite * 0.45;
}
