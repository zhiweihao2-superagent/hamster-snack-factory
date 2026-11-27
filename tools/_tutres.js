/* 三消成功后：三种资源分三页讲，一页一条，点屏幕翻页；
   每一页都会把棋盘上对应的零食点亮，告诉玩家"消这个 → 得那个"。 */
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

