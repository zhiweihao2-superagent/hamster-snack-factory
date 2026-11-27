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
