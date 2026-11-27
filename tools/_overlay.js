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

  /* 一条提示压在棋盘上方 */
  var ty = L.boardY - 26;
  rr(L.pad, ty - 17, W - L.pad * 2, 24, 12);
  ctx.fillStyle = 'rgba(20,16,28,.85)'; ctx.fill();
  txt('拖动这颗零食，和旁边那颗交换', W / 2, ty, Math.max(11, Math.round(W * 0.031)), C.ink, 'center', true);
}

/* 三消成功后：在舞台上用"明暗"逐条讲清三种资源的用途 */
function drawTutorialResources(now){
  if (!R.tutT0) R.tutT0 = now;
  var focus = Math.floor((now - R.tutT0) / 1700) % 3;
  var rows = [
    { name: '能量', from: '花生', desc: '攒满放「爆产」：全场重击', col: '#ffd98a', bar: 'rgba(255,217,138,' },
    { name: '护甲', from: '饼干', desc: '全队护盾，先扣盾再扣血', col: '#9fc6ff', bar: 'rgba(159,198,255,' },
    { name: '零件', from: '瓜子', desc: '炮台弹药 / 强化弹', col: '#c7b6ff', bar: 'rgba(199,182,255,' }
  ];
  var x = L.pad + 10, w = W - (L.pad + 10) * 2;
  var y0 = L.giftY + 30, rowH = 30, gap = 4;
  for (var i = 0; i < rows.length; i++){
    var y = y0 + i * (rowH + gap);
    var on = i === focus;
    ctx.save();
    ctx.globalAlpha = on ? 1 : 0.32;
    rr(x, y, w, rowH, 8);
    ctx.fillStyle = on ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)';
    ctx.fill();
    if (on){ ctx.lineWidth = 1.5; ctx.strokeStyle = rows[i].col; ctx.stroke(); }
    /* 左侧色条 */
    ctx.fillStyle = rows[i].col;
    ctx.globalAlpha = (on ? 1 : 0.32) * 0.9;
    rr(x + 4, y + 6, 4, rowH - 12, 2); ctx.fill();
    ctx.globalAlpha = on ? 1 : 0.32;
    txt(rows[i].from + ' → ' + rows[i].name, x + 14, y + 13, Math.max(10, Math.round(W * 0.028)), rows[i].col, 'left', true);
    txt(rows[i].desc, x + 14, y + 24, Math.max(9, Math.round(W * 0.025)), '#b9aecb', 'left');
    if (on && i === 0 && R.energy >= CFG.ult.cost){
      txt('满了！点右下「爆产」', x + w - 10, y + 19, Math.max(9, Math.round(W * 0.026)), C.amber, 'right', true);
    }
    ctx.restore();
  }
  /* 焦点那一行脚下加个跳动的小三角，视线更好跟 */
  var fy = y0 + focus * (rowH + gap);
  ctx.save();
  ctx.fillStyle = rows[focus].col;
  var triY = fy + rowH - 3 + Math.sin(now / 220) * 2;
  ctx.beginPath();
  ctx.moveTo(x + w - 22, triY + 5);
  ctx.lineTo(x + w - 16, triY + 5);
  ctx.lineTo(x + w - 19, triY + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (R.energy >= CFG.ult.cost && HIT.ult){
    ctx.save();
    ctx.strokeStyle = 'rgba(232,172,80,' + (0.45 + 0.35 * Math.sin(now / 180)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(HIT.ult[0] + HIT.ult[2] / 2, HIT.ult[1] + HIT.ult[3] / 2, HIT.ult[2] / 2 + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawIntroOverlay(){
  var now = performance.now();
  var fs = Math.max(11, Math.round(W * 0.031));

  /* 其它关：开打前 5 秒倒计时，上方浮一行"本关特色" */
  if (R.intro){
    var left = Math.max(0, R.intro.dur - (now - R.intro.t0));
    var secs = Math.ceil(left / 1000);
    var y = L.giftY + 28;
    rr(L.pad, y, W - L.pad * 2, 26, 13);
    ctx.fillStyle = 'rgba(20,16,28,.78)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232,172,80,.45)'; ctx.stroke();
    txt('本关特色 · ' + (CHAPTER.brief || ''), L.pad + 14, y + 17, fs, C.amber, 'left', true);
    txt(String(secs), W - L.pad - 14, y + 17, fs + 2, C.ink, 'right', true);
  }

  /* 教学关：第一步指位置，第二步讲资源 */
  if (R.tut && !R.tutSwap) drawTutorialMoveHint(now);
  else if (R.tut && !R.tutUlt) drawTutorialResources(now);
}

