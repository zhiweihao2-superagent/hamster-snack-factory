(function(){
'use strict';

/* ============================================================
   仓鼠零食工厂 · 第一版
   规则按《仓鼠零食工厂_游戏策划与开发说明.md》实现，美术为方块占位。
   逻辑与渲染分离：所有规则在 tick 之前同步算完，渲染只读状态。
   ============================================================ */

var N = 5;                       // 棋盘 5×5
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var DPR = 1, W = 390, H = 844, L = {};

/* ---------- 微信小游戏安全区：状态栏 + 右上角胶囊 ---------- */
var SAFE_TOP = 0, SAFE_BOT = 0;
(function(){
  try {
    if (typeof wx === 'undefined' || !wx) return;
    var sa = window.__wxSafeArea;
    if (sa && sa.topHudY) SAFE_TOP = Math.round(sa.topHudY);
    if (sa && sa.bottom && window.innerHeight) SAFE_BOT = Math.max(0, Math.round(window.innerHeight - sa.bottom));
  } catch (e) {}
})();

/* ---------- 零食：三种，颜色与轮廓都不同 ---------- */
var TYPES = [
  { name:'花生', base:'#e8ac50', dark:'#a9762c', glyph:'peanut' },
  { name:'饼干', base:'#d96d55', dark:'#a34834', glyph:'cookie' },
  { name:'瓜子', base:'#69a69c', dark:'#3f7368', glyph:'seed'   }
];

/* ---------- 礼盒图案（先手工做三张） ---------- */
var PATTERNS = [
  { name:'笑脸', rows:[
    '...........',
    '..#######..',
    '.#########.',
    '###.###.###',
    '###########',
    '###########',
    '###.....###',
    '.####.####.',
    '..#######..',
    '...#####...',
    '...........'
  ]},
  { name:'爱心', rows:[
    '...........',
    '..##...##..',
    '.#########.',
    '###########',
    '###########',
    '.#########.',
    '..#######..',
    '...#####...',
    '....###....',
    '.....#.....',
    '...........'
  ]},
  { name:'快递箱', rows:[
    '...........',
    '..#######..',
    '.#########.',
    '###########',
    '###########',
    '#####.#####',
    '#####.#####',
    '#####.#####',
    '#####.#####',
    '###########',
    '...........'
  ]}
];

/* ---------- 五关（原型数值，未校准） ---------- */
var LEVELS = [
  { name:'工厂开张',   steps:5, target:40, hint:'swap',
    tip:'滑动相邻的两颗零食，三个排成一线就能消除。' },
  { name:'第一笔订单', steps:6, target:74, hint:'cascade',
    tip:'先消下面的，上面的零食掉下来还会继续消 —— 掉落连击不花步数。' },
  { name:'零食试吃会', steps:6, target:82,
    tip:'' },
  { name:'挑食订单',   steps:7, target:118, want:0, need:6, hint:'order',
    tip:'这关的订单要花生：只算真正消掉的花生，强化追加的通用进度不算。' },
  { name:'零食节',     steps:7, target:132,
    tip:'' }
];

/* ---------- 礼盒里开出来的工具：主动技能，点一下再用一次，直接改棋盘 ---------- */
/* needsCell：要先点盘上一格（打包机、大礼盒）；false 就是点一下立刻生效（仓鼠） */
var TOOLS = [
  { name:'打包机',   mark:'机', needsCell:true,
    desc:'点它，再点盘上一格：那一整行和一整列都打掉',
    tip:'点一格，整行整列一起打包出库' },
  { name:'打包仓鼠', mark:'鼠', needsCell:false,
    desc:'点它：仓鼠啃掉最多那种零食的 10 格',
    tip:'仓鼠上手，最多那种零食啃掉 10 格' },
  { name:'大礼盒',   mark:'礼', needsCell:true,
    desc:'点它，再点盘上一格：那一片 5×5 全炸开',
    tip:'点一格，周围 5×5 全炸' }
];

/* 每关通关后礼盒里开三样，挑一样带走（不是被动加成，是能点出来用的工具） */
var PACKS = [
  { tool:0, n:1, name:'打包机 ×1',   desc:'点它再点一格，整行整列一起打掉' },
  { tool:1, n:2, name:'打包仓鼠 ×2', desc:'点一下，最多那种零食啃掉 10 格' },
  { tool:2, n:1, name:'大礼盒 ×1',   desc:'点它再点一格，周围 5×5 全炸开' }
];

/* ---------- 随机数：统一注入，可复现 ---------- */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- 状态 ---------- */
var S = {
  seed:0, rng:null,
  level:1, board:[], steps:0, stepsMax:0,
  prog:0, target:1, wantT:-1, need:0, have:0,
  upgrades:[], trig:{}, swapCount:0,
  tools:[0,0,0], arm:-1, rewardInfo:null,
  pattern:0, filledIdx:[],
  phase:'title', busy:false,
  maxGain:0, lastGain:0, cascadeMax:0,
  reshuffles:0,
  hintOpen:false, hintText:'',
  cand:[], picked:[],
  shakeUntil:0, punchUntil:0, gainFlashUntil:0,
  // 动画层：逻辑一步算完，动画把这一步摊到几帧里演出来
  anim:null, instant:false,
  pops:[], fallMap:null, parts:[],
  combo:0, comboTxt:0, tmpGain:0, popTxt:null,
  animFreeze:false,
  progShown:0,
  trace:[]
};

function rndInt(n){ return Math.floor(S.rng() * n); }
function own(id){ return S.upgrades.indexOf(id) >= 0; }   // 老接口留着，现在没人调
function cfg(){ return LEVELS[S.level - 1]; }

/* ============================================================
   棋盘逻辑
   ============================================================ */
function findRuns(b){
  var runs = [], r, c, t, e, i, len, cells;
  for (r = 0; r < N; r++){
    c = 0;
    while (c < N){
      t = b[r][c];
      if (t === null){ c++; continue; }
      e = c;
      while (e + 1 < N && b[r][e + 1] === t) e++;
      len = e - c + 1;
      if (len >= 3){
        cells = [];
        for (i = c; i <= e; i++) cells.push(r + ',' + i);
        runs.push({ dir:'h', t:t, len:len, cells:cells });
      }
      c = e + 1;
    }
  }
  for (c = 0; c < N; c++){
    r = 0;
    while (r < N){
      t = b[r][c];
      if (t === null){ r++; continue; }
      e = r;
      while (e + 1 < N && b[e + 1][c] === t) e++;
      len = e - r + 1;
      if (len >= 3){
        cells = [];
        for (i = r; i <= e; i++) cells.push(i + ',' + c);
        runs.push({ dir:'v', t:t, len:len, cells:cells });
      }
      r = e + 1;
    }
  }
  return runs;
}

function swapCells(b, a, c){
  var t = b[a[0]][a[1]];
  b[a[0]][a[1]] = b[c[0]][c[1]];
  b[c[0]][c[1]] = t;
}

function validMoves(b){
  var out = [], r, c;
  for (r = 0; r < N; r++){
    for (c = 0; c < N; c++){
      if (b[r][c] === null) continue;
      if (c + 1 < N && b[r][c+1] !== null){
        swapCells(b, [r,c], [r,c+1]);
        if (findRuns(b).length) out.push([[r,c],[r,c+1]]);
        swapCells(b, [r,c], [r,c+1]);
      }
      if (r + 1 < N && b[r+1][c] !== null){
        swapCells(b, [r,c], [r+1,c]);
        if (findRuns(b).length) out.push([[r,c],[r+1,c]]);
        swapCells(b, [r,c], [r+1,c]);
      }
    }
  }
  return out;
}

// 生成无现成匹配、且至少有一个合法交换的棋盘
function genBoard(){
  var b, guard = 0, r, c, tries, t, ok;
  do {
    b = [];
    for (r = 0; r < N; r++){
      b.push([]);
      for (c = 0; c < N; c++){
        tries = 0;
        do {
          t = rndInt(3); ok = true;
          if (c >= 2 && b[r][c-1] === t && b[r][c-2] === t) ok = false;
          if (r >= 2 && b[r-1][c] === t && b[r-2][c] === t) ok = false;
          tries++;
        } while (!ok && tries < 40);
        b[r][c] = t;
      }
    }
    guard++;
  } while (findRuns(b).length > 0 && guard < 60);
  if (!validMoves(b).length) return genBoard();
  return b;
}

function clearCells(cells){
  var i, k;
  for (i = 0; i < cells.length; i++){
    k = cells[i].split(',');
    S.board[+k[0]][+k[1]] = null;
  }
}

// 掉落 + 顶部补新
function dropRefill(){
  var c, r, col, i;
  for (c = 0; c < N; c++){
    col = [];
    for (r = N - 1; r >= 0; r--) if (S.board[r][c] !== null) col.push(S.board[r][c]);
    r = N - 1;
    for (i = 0; i < col.length; i++){ S.board[r][c] = col[i]; r--; }
    while (r >= 0){ S.board[r][c] = rndInt(3); r--; }   // 补进来的只会是三种零食，不会是炸弹
  }
}

/* 在盘上埋 n 颗炸弹（老机制已删，保留这个空壳会被误当成还在用） */

/* 把一批格子真正消掉：算分、清盘、掉落、录一段动画。
   cells 用 'r,c' 字符串；label 是这一步的来源（消除 / 打包机 / 仓鼠 / 大礼盒）。 */
function commitClear(cells, round, log, rec, label){
  var before = snapshot(), haveBefore = S.have;
  var i, k, r, c, t;
  var perType = [0,0,0];
  for (i = 0; i < cells.length; i++){
    k = cells[i].split(',');
    t = S.board[+k[0]][+k[1]];
    if (t !== null && t < 3) perType[t]++;
  }
  var gain = cells.length;
  log.push({ label: (label || '消除') + ' ' + cells.length, v: cells.length });
  if (S.wantT >= 0) S.have += perType[S.wantT];

  clearCells(cells);
  dropRefill();

  if (rec){
    var dead = {}, q;
    for (q = 0; q < cells.length; q++) dead[cells[q]] = 1;
    var fall = {}, cc, rr, surv, kk, nNew;
    for (cc = 0; cc < N; cc++){
      surv = [];
      for (rr = 0; rr < N; rr++)
        if (before[rr][cc] !== null && !dead[rr + ',' + cc]) surv.push(rr);
      nNew = N - surv.length;
      // 掉落与 dropRefill 同序：存活块自下而上占满底部，新块从盘顶上方落进来
      for (rr = 0; rr < N; rr++)
        fall[rr + ',' + cc] = (rr < nNew) ? (rr - nNew) : surv[rr - nNew];
    }
    rec.push({
      cells: cells.map(function(s){ var p = s.split(','); return [ +p[0], +p[1] ]; }),
      dead: dead, before: before, after: snapshot(), fall: fall,
      gain: gain, round: round, haveGain: S.have - haveBefore
    });
  }
  return gain;
}

/* 一轮自然三连消除 */
function resolveRound(round, log, rec){
  var runs = findRuns(S.board);
  if (!runs.length) return -1;
  var seen = {}, cells = [], i, j, k;
  for (i = 0; i < runs.length; i++){
    for (j = 0; j < runs[i].cells.length; j++){
      k = runs[i].cells[j];
      if (!seen[k]){ seen[k] = 1; cells.push(k); }
    }
  }
  return commitClear(cells, round, log, rec, '消除');
}

function snapshot(){
  var out = [], r;
  for (r = 0; r < N; r++) out.push(S.board[r].slice());
  return out;
}

// 消除到棋盘稳定，返回总进度；log 记录每笔来源，rec 记录每一轮用于播放动画
// after：已经用掉的回合数（技能先清了一轮就传 1，连击编号接着往下排）
function resolveAll(log, rec, after){
  var round = after || 0, total = 0, g;
  S.cascadeMax = 0;
  while (true){
    g = resolveRound(round + 1, log, rec);
    if (g < 0) break;
    round++;
    total += g;
  }
  if (round > S.cascadeMax) S.cascadeMax = round;
  return total;
}

/* ============================================================
   礼盒工具：主动技能，点一下用一次
   ============================================================ */
/* 算这颗技能要清哪些格。返回 'r,c' 的数组，越界/空格自动跳过。 */
function toolCells(id, cell){
  var out = [], seen = {}, r, c, k;
  function put(rr, cc){
    if (rr < 0 || rr >= N || cc < 0 || cc >= N) return;
    if (S.board[rr][cc] === null) return;
    var kk = rr + ',' + cc;
    if (seen[kk]) return;
    seen[kk] = 1; out.push(kk);
  }
  if (id === 0){
    // 打包机：整行 + 整列（十字）
    for (c = 0; c < N; c++) put(cell[0], c);
    for (r = 0; r < N; r++) put(r, cell[1]);
  } else if (id === 1){
    // 打包仓鼠：盘上最多的那种零食，从最大的一堆开始啃，一共啃 10 格。
    // 整盘同色全清太离谱（实测一次 +140，第一关直接通关），封顶 10 格才有得取舍。
    var cnt = [0,0,0], best = 0, br, bc, kk, q;
    for (br = 0; br < N; br++) for (bc = 0; bc < N; bc++){
      kk = S.board[br][bc];
      if (kk !== null && kk < 3) cnt[kk]++;
    }
    for (k = 1; k < 3; k++) if (cnt[k] > cnt[best]) best = k;
    var mark = {}, groups = [];
    for (br = 0; br < N; br++) for (bc = 0; bc < N; bc++){
      if (S.board[br][bc] !== best || mark[br + ',' + bc]) continue;
      var group = [], st = [[br, bc]];
      mark[br + ',' + bc] = 1;
      while (st.length){
        var g2 = st.pop(); group.push(g2);
        var nb = [[g2[0]-1,g2[1]],[g2[0]+1,g2[1]],[g2[0],g2[1]-1],[g2[0],g2[1]+1]];
        for (q = 0; q < 4; q++){
          var nr = nb[q][0], nc = nb[q][1];
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          if (S.board[nr][nc] !== best) continue;
          if (mark[nr + ',' + nc]) continue;
          mark[nr + ',' + nc] = 1;
          st.push([nr, nc]);
        }
      }
      groups.push(group);
    }
    groups.sort(function(a, b){ return b.length - a.length; });
    var LIMIT = 10, tookN = 0;
    for (k = 0; k < groups.length && tookN < LIMIT; k++){
      for (q = 0; q < groups[k].length && tookN < LIMIT; q++){
        put(groups[k][q][0], groups[k][q][1]);
        tookN++;
      }
    }
  } else {
    // 大礼盒：以这一格为中心 5×5
    for (r = cell[0] - 2; r <= cell[0] + 2; r++)
      for (c = cell[1] - 2; c <= cell[1] + 2; c++) put(r, c);
  }
  return out;
}

/* 点技能：不需要选格子的立刻生效；需要选格子的先把按钮点亮，等玩家点盘面。
   返回 'used' | 'armed' | 'off'。技能不花步数，但库存只有一次。 */
function useTool(id, cell){
  if (S.phase !== 'play' || S.anim) return 'off';
  if (!S.tools[id]){ S.shakeUntil = performance.now() + 160; return 'off'; }
  if (TOOLS[id].needsCell && !cell){
    S.arm = (S.arm === id ? -1 : id);
    return 'armed';
  }
  var cells = toolCells(id, cell);
  if (!cells.length){ S.shakeUntil = performance.now() + 160; return 'off'; }
  S.tools[id]--;
  S.arm = -1;
  S.sel = null;

  var pre = snapshot(), log = [], rounds = [];
  var g1 = commitClear(cells, 1, log, rounds, TOOLS[id].name);
  var gain = g1 + resolveAll(log, rounds, 1);

  S.prog += gain;
  S.lastGain = gain;
  S.gains = log;
  if (gain > S.maxGain) S.maxGain = gain;
  S.gainFlashUntil = performance.now() + 700;

  if (S.instant){ S.progShown = S.prog; afterResolve(); return 'used'; }
  S.anim = {
    phase:'pop', t:0, idx:0, steps:0,
    a:null, b:null, pre:pre, rounds:rounds,
    swapMs:0, popMs:190, fallMs:210
  };
  spawnPops(rounds[0]);
  S.progShown = S.prog - gain;
  S.combo = 0;
  return 'used';
}

/* 无合法交换时重排：不扣步，重排后不得有现成匹配 */
function reshuffle(){
  var pool = [], r, c, guard = 0, i, j, tmp;
  for (r = 0; r < N; r++) for (c = 0; c < N; c++) pool.push(S.board[r][c]);
  do {
    for (i = pool.length - 1; i > 0; i--){
      j = rndInt(i + 1); tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    i = 0;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) S.board[r][c] = pool[i++];
    guard++;
  } while ((findRuns(S.board).length > 0 || !validMoves(S.board).length) && guard < 200);
  if (findRuns(S.board).length > 0 || !validMoves(S.board).length){
    S.board = genBoard();
  }
  S.reshuffles++;
}

/* ============================================================
   一局流程
   ============================================================ */
function startLevel(lv){
  var d = LEVELS[lv - 1];
  S.level = lv;
  S.steps = d.steps; S.stepsMax = d.steps;
  S.prog = 0; S.target = d.target;
  S.wantT = (d.want === undefined ? -1 : d.want);
  S.need = d.need || 0; S.have = 0;
  S.board = genBoard();
  S.phase = 'play';
  S.arm = -1;
  S.maxGain = 0; S.lastGain = 0; S.cascadeMax = 0; S.reshuffles = 0;
  S.sel = null;
  S.hintText = d.tip || '';
  S.hintOpen = !!d.tip;
  S.gains = [];
  // 换关要把动画层归零，否则上一关的碎屑/连击会漏到新棋盘上
  S.anim = null; S.parts = []; S.pops = []; S.combo = 0; S.comboTxt = 0;
  S.progShown = 0; S.tmpGain = 0; S.popTxt = null;
}

function newRun(seed){
  S.seed = seed | 0;
  S.rng = mulberry32(S.seed);
  S.tools = [0,0,0]; S.arm = -1; S.rewardInfo = null;
  S.pattern = rndInt(PATTERNS.length);
  S.filledIdx = [];
  S.picked = [];
  S.trace = [];
  startLevel(1);
}

function chunkOf(level){
  var total = PATTERN_CELLS().length;
  var per = Math.ceil(total / 5);
  var start = (level - 1) * per;
  return { start: start, end: Math.min(total, start + per), per: per, total: total };
}

var _pcache = null;
function PATTERN_CELLS(){
  if (_pcache && _pcache.idx === S.pattern) return _pcache.cells;
  var p = PATTERNS[S.pattern], cells = [], r, c;
  for (r = 0; r < p.rows.length; r++)
    for (c = 0; c < p.rows[r].length; c++)
      if (p.rows[r][c] === '#') cells.push([r, c]);
  _pcache = { idx: S.pattern, cells: cells };
  return cells;
}

function fillChunkThisLevel(){
  var ch = chunkOf(S.level), i;
  for (i = ch.start; i < ch.end; i++) S.filledIdx.push(i);
}

/* 过关后礼盒开出来的三选一：不是被动加成，是能点出来用的工具 */
function rollCandidates(){
  var i, out = [];
  for (i = 0; i < PACKS.length; i++) out.push(i);
  return out;
}

function chooseUpgrade(id){
  var pk = PACKS[id];
  if (!pk) return;
  S.tools[pk.tool] += pk.n;
  S.arm = -1;
  S.picked.push(id);
  startLevel(S.level + 1);
}

function finishLevel(){
  fillChunkThisLevel();
  S.trace.push({ lv:S.level, steps:S.steps, prog:S.prog, target:S.target, cascade:S.cascadeMax, resh:S.reshuffles });
  S.maxGainOfRun = Math.max(S.maxGainOfRun || 0, S.maxGain);
  if (S.level >= LEVELS.length){ S.phase = 'win'; return; }
  S.cand = rollCandidates();
  S.phase = 'pick';
}

function afterResolve(){
  var d = cfg();
  if (S.prog >= S.target && (S.wantT < 0 || S.have >= S.need)){ finishLevel(); return; }
  if (S.steps <= 0){ S.phase = 'lose'; return; }
  if (!validMoves(S.board).length) reshuffle();
}

/* 玩家交换：无效回弹不扣步，有效扣一步并完整结算。
   结算一次性算完（逻辑不变），但把过程录成 rounds，交给动画层慢慢演：
   交换 → 这一轮炸掉 → 掉下来 → 下一轮连击。 */
function trySwap(a, b){
  if (S.phase !== 'play') return false;
  if (S.anim) return false;
  if (!a || !b) return false;
  var dr = Math.abs(a[0] - b[0]), dc = Math.abs(a[1] - b[1]);
  if (dr + dc !== 1) return false;

  var pre = snapshot();
  swapCells(S.board, a, b);
  if (findRuns(S.board).length === 0){
    swapCells(S.board, a, b);
    S.shakeUntil = performance.now() + 160;
    S.sel = null;
    return false;
  }

  S.steps--;
  S.swapCount++;
  S.sel = null;

  var log = [], rounds = [];
  var gain = resolveAll(log, rounds);

  S.prog += gain;
  S.lastGain = gain;
  S.gains = log;
  if (gain > S.maxGain) S.maxGain = gain;
  S.gainFlashUntil = performance.now() + 700;

  if (S.instant || !rounds.length){ afterResolve(); return true; }

  S.anim = {
    phase:'swap', t:0, idx:0, steps:0,
    a:a, b:b, pre:pre, rounds:rounds,
    swapMs:110, popMs:170, fallMs:210
  };
  S.progShown = S.prog - gain;         // 进度条从旧值往上爬
  S.combo = 0;
  return true;
}

/* 动画推进：每帧按 dt 走时间轴 */
function stepAnim(dt){
  var a = S.anim;
  if (!a) return;
  a.t += dt;

  if (a.phase === 'swap'){
    if (a.t >= a.swapMs){ a.phase = 'pop'; a.t = 0; a.idx = 0; spawnPops(a.rounds[0]); }
    return;
  }
  if (a.phase === 'pop'){
    if (a.t >= a.popMs){ a.phase = 'fall'; a.t = 0; }
    return;
  }
  if (a.phase === 'fall'){
    if (a.t >= a.fallMs){
      a.idx++;
      if (a.idx < a.rounds.length){
        a.phase = 'pop'; a.t = 0;
        spawnPops(a.rounds[a.idx]);
      } else {
        S.anim = null;
        S.progShown = S.prog;
        afterResolve();
      }
    }
  }
}

/* 炸开的碎屑：只做视觉，不参与规则。
   颜色跟被消掉的方块走，别一律琥珀色——否则三种零食炸开看着一模一样。 */
function spawnPops(rec){
  if (!rec) return;
  var cs = L.cs, i, k, r, c;
  S.combo = rec.round;
  if (rec.round >= 2) S.comboTxt = performance.now() + 620;
  // 连到第三下时有一下轻微的顶动，隔着屏幕能感觉到「这一下更重」
  if (rec.round >= 3) S.punchUntil = performance.now() + 110;
  var isNew = rec.round >= 2 || !S.popTxt;
  for (i = 0; i < rec.cells.length; i++){
    r = rec.cells[i][0]; c = rec.cells[i][1];
    var cx = L.boardX + c * cs + cs / 2;
    var cy = L.boardY + r * cs + cs / 2;
    var tt = rec.before && rec.before[r] ? rec.before[r][c] : null;
    var col = (tt !== null && tt !== undefined && TYPES[tt]) ? TYPES[tt].base : C.amber;
    for (k = 0; k < 4; k++){
      S.parts.push({
        x:cx, y:cy,
        // 速度按「每毫秒」算：整块碎屑在 400ms 里飞出去大约一格，看着才像被弹开；
        // 早先按每帧写，一帧就飞出屏外，等于从来没画出来过
        vx:(Math.random() - 0.5) * 0.0016 * cs,
        vy:-(0.0005 + Math.random() * 0.0013) * cs,
        g:0.0000017 * cs,
        s:cs * (0.07 + Math.random() * 0.09),
        life:0, max:420 + Math.random() * 180,
        col:col
      });
    }
  }
  if (S.parts.length > 300) S.parts.splice(0, S.parts.length - 300);
  // 每一轮在消除处飘一个「+N」，玩家能看见这一下到底加了多少
  var rs = 0, cs2 = 0, n = 0;
  for (i = 0; i < rec.cells.length; i++){
    rs += rec.cells[i][0]; cs2 += rec.cells[i][1]; n++;
  }
  if (n){
    S.popTxt = {
      text: (rec.round >= 2 ? '连击 ×' + rec.round + '  +' : '+') + rec.gain,
      x: L.boardX + (cs2 / n + 0.5) * cs,
      y: L.boardY + (rs / n + 0.2) * cs,
      t0: performance.now(), max: 620, big: rec.round >= 2
    };
  }
}

/* 动画期间要画的棋盘视图：位置、缩放、透明度都从动画状态推出来 */
function animView(){
  var a = S.anim;
  if (!a) return null;
  var cs = L.cs;
  var out = { board:null, dx:{}, dy:{}, sc:{}, al:{}, glow:{} };
  var p, k, i;

  if (a.phase === 'swap'){
    out.board = a.pre;
    p = easeOut(Math.min(1, a.t / a.swapMs));
    var A = a.a, B = a.b;
    var ax = (B[1] - A[1]) * cs * p, ay = (B[0] - A[0]) * cs * p;
    out.dx[A[0] + ',' + A[1]] = ax;  out.dy[A[0] + ',' + A[1]] = ay;
    out.dx[B[0] + ',' + B[1]] = -ax; out.dy[B[0] + ',' + B[1]] = -ay;
    return out;
  }

  var rec = a.rounds[a.idx];
  if (!rec) return null;

  if (a.phase === 'pop'){
    out.board = rec.before;
    out.flash = {}; out.ring = {};
    p = Math.min(1, a.t / a.popMs);
    /* 「被捏爆」三件事同时发生，缩放到零不算其中一件：
       1) 0~15% 快速鼓到 1.12 倍（再多就压到隔壁格，一格一格的棋盘会糊成一片）
       2) 15%~55% 缩回 1.0 并淡出，格子自己让位
       3) 0~70% 从格子边缘往外荡一圈琥珀环，碎屑同时飞出去 */
    var grow = p < 0.15
      ? 1 + 0.12 * easeOut(p / 0.15)
      : 1.12 - 0.12 * easeOut((p - 0.15) / 0.4);
    for (k in rec.dead){
      out.sc[k] = Math.max(1, grow);
      out.al[k] = p < 0.15 ? 1 : Math.max(0, 1 - (p - 0.15) / 0.4);
      out.flash[k] = p < 0.14 ? (p / 0.14) * 0.5 : Math.max(0, 0.5 * (1 - (p - 0.14) / 0.26));
      out.ring[k] = p < 0.7 ? p / 0.7 : -1;
    }
    return out;
  }

  // fall：落到位时带一点点回弹，看着像「砸」下来而不是滑下来
  out.board = rec.after;
  p = Math.min(1, a.t / a.fallMs);
  var ep = easeOut(p);
  var over = p < 0.82 ? 0 : Math.sin((p - 0.82) / 0.18 * Math.PI) * 0.06;
  for (k in rec.fall){
    var from = rec.fall[k];
    var r = +k.split(',')[0];
    out.dy[k] = (from - r) * cs * ((1 - ep) - over);
  }
  return out;
}

function easeOut(t){ return 1 - (1 - t) * (1 - t); }


/* ============================================================
   布局
   ============================================================ */
function layout(){
  W = canvas.clientWidth || 390;
  H = (canvas.clientHeight || 844) - SAFE_TOP - SAFE_BOT;
  var pad = Math.round(W * 0.045);
  var headerH = Math.max(54, Math.round(H * 0.088));
  var bottomH = Math.max(48, Math.round(H * 0.068));
  var cs = Math.floor(Math.min((W - pad * 2) / N, (H * 0.46) / N));
  var boardW = cs * N;
  var boardY, giftY, giftH;

  for (var guard = 0; guard < 12; guard++){
    boardY = H - bottomH - boardW - Math.round(H * 0.02);
    giftY = headerH + Math.round(H * 0.01);
    giftH = boardY - Math.round(H * 0.014) - giftY;
    if (giftH >= 96 || cs <= 26) break;
    cs--; boardW = cs * N;
  }

  L = {
    pad: pad, headerH: headerH, bottomH: bottomH,
    cs: cs, boardW: boardW,
    boardX: Math.round((W - boardW) / 2), boardY: boardY,
    giftY: giftY, giftH: Math.max(60, giftH)
  };
}

function resize(){
  DPR = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(canvas.clientWidth * DPR);
  canvas.height = Math.round(canvas.clientHeight * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layout();
}

/* ============================================================
   绘制
   ============================================================ */
var C = {
  bg:'#241d2e', panel:'#332b45', panel2:'#2c2540', line:'#4a4160',
  ink:'#f4ecdc', muted:'#a79cb8', amber:'#e8ac50', good:'#69a69c', bad:'#d96d55'
};

var HIT = {};

function rr(x, y, w, h, r){
  var rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function txt(s, x, y, size, color, align, bold){
  ctx.font = (bold ? '700 ' : '500 ') + size + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function drawTile(x, y, size, t, dim){
  var ty = TYPES[t];
  if (!ty) return;
  rr(x, y, size, size, size * 0.26);
  ctx.fillStyle = dim ? '#2a2338' : ty.base;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = dim ? '#38304d' : ty.dark;
  ctx.stroke();

  var cx = x + size / 2, cy = y + size / 2, s = size;
  ctx.fillStyle = ty.dark;
  if (ty.glyph === 'peanut'){
    ctx.beginPath(); ctx.arc(cx - s * 0.11, cy, s * 0.135, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.11, cy, s * 0.135, 0, Math.PI * 2); ctx.fill();
  } else if (ty.glyph === 'cookie'){
    var d2 = s * 0.1, o2 = s * 0.175;
    ctx.beginPath();
    ctx.arc(cx, cy - o2 * 0.85, d2, 0, Math.PI * 2);
    ctx.arc(cx - o2, cy + o2 * 0.7, d2, 0, Math.PI * 2);
    ctx.arc(cx + o2, cy + o2 * 0.7, d2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.13, s * 0.24, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHamster(x, y, size, snack, bob){
  var s = size;
  ctx.save();
  ctx.translate(x, y + bob);
  // 耳朵
  ctx.fillStyle = '#c98f5e';
  ctx.beginPath(); ctx.arc(s * 0.26, s * 0.22, s * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.74, s * 0.22, s * 0.15, 0, Math.PI * 2); ctx.fill();
  // 身体
  rr(0, s * 0.14, s, s * 0.82, s * 0.34);
  ctx.fillStyle = '#e5b982'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = '#a9762c'; ctx.stroke();
  // 脸颊
  ctx.fillStyle = '#f4dcc0';
  ctx.beginPath(); ctx.arc(s * 0.5, s * 0.66, s * 0.3, 0, Math.PI * 2); ctx.fill();
  // 眼睛
  ctx.fillStyle = '#2a2338';
  ctx.beginPath(); ctx.arc(s * 0.34, s * 0.52, s * 0.075, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.66, s * 0.52, s * 0.075, 0, Math.PI * 2); ctx.fill();
  // 抱着的零食
  if (snack !== null && snack !== undefined && snack >= 0){
    rr(s * 0.34, s * 0.72, s * 0.32, s * 0.32, s * 0.08);
    ctx.fillStyle = TYPES[snack].base; ctx.fill();
    ctx.strokeStyle = TYPES[snack].dark; ctx.stroke();
  }
  ctx.restore();
}

function drawHeader(){
  var p = L.pad, y = Math.round(L.headerH * 0.42);
  txt('第 ' + S.level + '/' + LEVELS.length + ' 关 · ' + cfg().name, p, y, Math.round(W * 0.043), C.ink, 'left', true);

  // 步数与重开
  var bs = Math.round(W * 0.034);
  txt('步数 ' + S.steps + '/' + S.stepsMax, W - p, y, bs, S.steps <= 1 ? C.bad : C.muted, 'right', true);

  // 进度条 + 右侧读数（读数放条外，条内不再压字，否则空条上的深色字看不见）
  var bh = Math.max(12, Math.round(H * 0.017));
  var by = y + Math.round(H * 0.018);
  var fs = Math.max(10, Math.round(W * 0.031));
  // 动画期间读数追着条爬，消除的进度是一点一点加上去的
  var shown = S.anim ? S.progShown : S.prog;
  shown = Math.max(0, Math.round(shown));
  var lbl = '进度 ' + Math.min(shown, S.target) + '/' + S.target;
  if (S.wantT >= 0) lbl += ' · ' + TYPES[S.wantT].name + ' ' + S.have + '/' + S.need;
  ctx.font = '700 ' + fs + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  var lw = ctx.measureText(lbl).width;
  var bw = Math.max(60, W - p * 2 - lw - 10);

  rr(p, by, bw, bh, bh / 2); ctx.fillStyle = C.panel2; ctx.fill();
  var ratio = Math.min(1, shown / Math.max(1, S.target));
  if (ratio > 0){
    rr(p, by, Math.max(bh, bw * ratio), bh, bh / 2);
    ctx.fillStyle = C.amber; ctx.fill();
  }
  txt(lbl, W - p, by + bh - Math.round(bh * 0.2), fs, shown >= S.target ? C.amber : C.muted, 'right', true);
}

function drawGiftPanel(){
  var x = L.pad, y = L.giftY, w = W - L.pad * 2, h = L.giftH;
  rr(x, y, w, h, 12);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();

  var pat = PATTERNS[S.pattern];
  var rows = pat.rows.length, cols = pat.rows[0].length;

  var tSize = Math.max(10, Math.round(W * 0.033));
  var tY = y + Math.round(tSize * 1.7) + 2;
  txt('礼盒 · ' + pat.name, x + 12, tY, tSize, C.muted, 'left', true);
  txt('第 ' + Math.min(5, Math.max(1, S.level)) + '/5 份', x + w - 12, tY, tSize, C.muted, 'right', true);

  if (S.phase === 'play' && S.hintOpen) return;

  var hamsterH = Math.round(Math.min(h * 0.2, W * 0.13));
  var top = tY + Math.round(tSize * 0.9);
  var availH = h - (top - y) - hamsterH - Math.round(h * 0.07);
  var cell = Math.max(4, Math.min(15, Math.floor(Math.min((w - 28) / cols, availH / rows))));
  var gx = x + Math.round((w - cell * cols) / 2);
  var gy = top + Math.round((availH - cell * rows) / 2);

  var cells = PATTERN_CELLS();
  var ch = chunkOf(S.level);
  var ratio = Math.min(1, S.prog / Math.max(1, S.target));
  var shownIdx = {};
  var i;
  // 填图顺序只由「已完成的份数 + 本关进度」决定，从下往上；
  // 之前还叠了 S.filledIdx（按行优先的原始下标），两套顺序打架，填充会跑到顶上
  var order = [];
  for (i = 0; i < cells.length; i++) order.push(i);
  order.sort(function(a, b){
    var ra = cells[a][0], rb = cells[b][0];
    if (ra !== rb) return rb - ra;
    return cells[a][1] - cells[b][1];
  });
  var liveEnd = ch.start + Math.round((ch.end - ch.start) * ratio);
  for (i = 0; i < liveEnd && i < order.length; i++) shownIdx[order[i]] = 1;

  // 空位：补成深一档的整块剪影，看得出礼盒轮廓，也知道还能填多少
  for (var rr2 = 0; rr2 < rows; rr2++){
    for (var cc2 = 0; cc2 < cols; cc2++){
      if (pat.rows[rr2][cc2] !== '#') continue;
      // 剪影整块画，不留缝 —— 留缝会变成一张格子纸，看不出礼盒的形状
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.fillRect(gx + cc2 * cell, gy + rr2 * cell, cell, cell);
    }
  }

  for (i = 0; i < cells.length; i++){
    if (!shownIdx[i]) continue;
    var rc = cells[i];
    // 整块同色，不留缝 —— 留缝会把图案拆成一把碎方块，看不出是花还是脸
    ctx.fillStyle = C.amber;
    ctx.fillRect(gx + rc[1] * cell, gy + rc[0] * cell, cell, cell);
  }

  // 搬运区
  var hy = y + h - hamsterH - Math.round(h * 0.03);
  var hs = Math.min(hamsterH * 1.1, W * 0.15);
  var now = performance.now();
  var live = now < S.gainFlashUntil;
  var snack = -1;
  if (live && S.gains && S.gains.length) snack = ((now / 120) | 0) % 3;
  var count = 3;
  var totalW = count * hs + (count - 1) * hs * 0.28;
  var hx = x + (w - totalW) / 2;
  for (i = 0; i < count; i++){
    var bob = live ? Math.round(Math.sin(now / 90 + i * 1.1) * hs * 0.16) : 0;
    drawHamster(hx + i * hs * 1.28, hy, hs, live && i === ((now / 260 | 0) % count) ? snack : -1, bob);
  }

  if (now < S.gainFlashUntil && S.lastGain > 0){
    // 放网格右上方空白处，别和「第 N/5 份」抢同一行
    txt('+' + S.lastGain, x + w - 14, top + Math.round(tSize * 2.2), Math.round(W * 0.058), C.amber, 'right', true);
  }
}

function drawBoard(){
  var cs = L.cs, bx = L.boardX, by = L.boardY;
  var now = performance.now();
  var shake = now < S.shakeUntil ? Math.sin(now / 14) * 3
            : (now < S.punchUntil ? Math.sin(now / 11) * 1.6 : 0);
  var view = animView();

  rr(bx - 6, by - 6, L.boardW + 12, L.boardW + 12, 14);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();

  var grid = view ? view.board : S.board;
  // 新块从盘顶上方落进来，必须裁在盘内，否则会飘到上面的礼盒面板上
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, L.boardW, L.boardW);
  ctx.clip();
  for (var r = 0; r < N; r++){
    for (var c = 0; c < N; c++){
      var x = bx + c * cs + shake, y = by + r * cs;
      var pad = Math.max(2, Math.round(cs * 0.055));
      var t = grid[r] ? grid[r][c] : null;
      rr(x + pad * 0.5, y + pad * 0.5, cs - pad, cs - pad, cs * 0.16);
      ctx.fillStyle = C.panel2; ctx.fill();

      var key = r + ',' + c;
      if (t !== null && t !== undefined){
        var ox = view && view.dx[key] || 0;
        var oy = view && view.dy[key] || 0;
        var sc = view && view.sc[key] !== undefined ? view.sc[key] : 1;
        var al = view && view.al[key] !== undefined ? view.al[key] : 1;
        var fl = view && view.flash && view.flash[key] ? view.flash[key] : 0;
        var rg = view && view.ring && view.ring[key] !== undefined ? view.ring[key] : -1;
        var size = (cs - pad * 2) * sc;
        var off = ((cs - pad * 2) - size) / 2;

        if (size > 0.5){
          ctx.save();
          ctx.globalAlpha = al;
          drawTile(x + pad + off + ox, y + pad + off + oy, size, t);
          // 白光：炸开瞬间整块提亮，比单纯缩放更像「被打掉」；
          // 只提一点点，太亮会把三块零食糊成一片白，反而看不清消了什么
          if (fl > 0){
            ctx.globalAlpha = fl * 0.6;
            rr(x + pad + off + ox, y + pad + off + oy, size, size, size * 0.26);
            ctx.fillStyle = '#fff6e2';
            ctx.fill();
          }
          ctx.restore();
        }

        // 外扩环：从块的外沿往外荡一圈（画在块之后，否则被放大的块整个盖住，根本看不见）
        if (rg > 0.02 && rg < 1){
          var rr2 = (cs - pad * 2) * (1 + rg * 0.5);
          ctx.save();
          ctx.globalAlpha = (1 - rg) * 0.85;
          ctx.lineWidth = Math.max(2, cs * 0.06);
          ctx.strokeStyle = C.amber;
          rr(x + cs / 2 - rr2 / 2, y + cs / 2 - rr2 / 2, rr2, rr2, rr2 * 0.24);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (!view && S.sel && S.sel[0] === r && S.sel[1] === c){
        rr(x + 2, y + 2, cs - 4, cs - 4, cs * 0.2);
        ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
      }
    }
  }
  ctx.restore();

  drawParts();

  // 消除读数：飘在被消掉的那片格子上方，玩家一眼看到「这一下加了多少」；
  // 连击那一轮字号更大、带一行「连击 ×N」
  if (S.popTxt){
    var pt = S.popTxt;
    var pa = (now - pt.t0) / pt.max;
    if (S.animFreeze) { if (pa > 0.34) pa = 0.34; }   // 定格截图时不淡出
    if (pa >= 1){ S.popTxt = null; }
    else {
      var fsz = Math.round(cs * (pt.big ? 0.5 : 0.4) * (pa < 0.2 ? 0.7 + 1.5 * pa : 1));
      // 只飘大半格，并且钉死在盘内：消最上面那行时，原来的 1.05 格会飘到礼盒和仓鼠身上
      var rise = easeOut(pa) * cs * 0.7;
      var ty = pt.y - rise;
      var tTop = L.boardY + fsz * 0.85;
      var tBot = L.boardY + 5 * cs - fsz * 0.25;
      if (ty < tTop) ty = tTop;
      if (ty > tBot) ty = tBot;
      ctx.save();
      ctx.globalAlpha = pa > 0.62 ? Math.max(0, 1 - (pa - 0.62) / 0.38) : 1;
      ctx.textAlign = 'center';
      ctx.font = '900 ' + fsz + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.lineWidth = Math.max(3, fsz * 0.22);
      ctx.strokeStyle = 'rgba(28,22,38,.92)';
      ctx.strokeText(pt.text, pt.x, ty);
      ctx.fillStyle = pt.big ? C.amber : '#fff0cf';
      ctx.fillText(pt.text, pt.x, ty);
      ctx.restore();
    }
  }
}

/* 碎屑：重力 + 淡出，纯视觉 */
function drawParts(){
  if (!S.parts.length) return;
  var now = performance.now(), i = 0, p;
  while (i < S.parts.length){
    p = S.parts[i];
    if (p.t0 === undefined) p.t0 = now;
    var age = now - p.t0;
    if (age > p.max){ S.parts.splice(i, 1); continue; }
    var k = age / p.max;
    var x = p.x + p.vx * age;
    var y = p.y + p.vy * age + (p.g || 0) * age * age;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = p.col;
    ctx.fillRect(x - p.s / 2, y - p.s / 2, p.s, p.s);
    i++;
  }
  ctx.globalAlpha = 1;
}

function drawBottom(){
  var y = H - L.bottomH;
  var hb = L.bottomH - Math.round(L.bottomH * 0.18);
  rr(L.pad, y, W - L.pad * 2, hb, 10);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();

  // 重开
  var bw = Math.round(W * 0.15), bh = Math.round(hb * 0.62);
  var bx = W - L.pad - 8 - bw, byy = y + Math.round((hb - bh) / 2);
  rr(bx, byy, bw, bh, bh / 2);
  ctx.fillStyle = C.panel2; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
  txt('重开', bx + bw / 2, byy + bh * 0.68, Math.max(10, Math.round(W * 0.032)), C.muted, 'center', true);
  HIT.restart = [bx, byy, bw, bh];

  // 三个工具：点一下用一次。有库存时亮着，用光变灰；等选格子的那个按下后描边变亮
  var chip = Math.round(hb * 0.66);
  var cy = y + Math.round((hb - chip) / 2);
  var cx = L.pad + 8;
  var roomW = bx - 8 - cx;
  var gap = 6;
  var bw2 = Math.min(Math.round(chip * 2.2), Math.floor((roomW - gap * 2) / 3));
  var now = performance.now();
  for (var i = 0; i < TOOLS.length; i++){
    var t = TOOLS[i], n = S.tools[i] || 0;
    var tx = cx + i * (bw2 + gap);
    var on = n > 0, armed = S.arm === i;
    rr(tx, cy, bw2, chip, 9);
    ctx.fillStyle = on ? '#4a4160' : '#2a2338';
    ctx.fill();
    ctx.lineWidth = armed ? Math.max(2, Math.round(chip * 0.07)) : 1;
    ctx.strokeStyle = armed ? C.amber : (on ? '#6d6188' : C.line);
    ctx.stroke();
    // 图标在左，文字「机 ×2」在右，各自占一块，谁也不压谁
    var s = Math.round(chip * 0.56);
    drawToolMark(tx + 7 + s / 2, cy + chip / 2, s, i, on);
    var fs = Math.max(9, Math.round(chip * 0.34));
    txt(t.mark + ' ×' + n, tx + bw2 - 7, cy + chip * 0.62, fs, on ? C.ink : '#6a6480', 'right', true);
    if (armed && now % 900 < 560){
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,172,80,.6)';
      rr(tx - 2, cy - 2, bw2 + 4, chip + 4, 10); ctx.stroke();
    }
    HIT['tool' + i] = [tx, cy, bw2, chip];
  }
  if (S.arm >= 0){
    // 选了要指定格子的工具：给一句提示，否则玩家不知道下一步点哪儿。
    // 只能放在礼盒区中间（盘上会盖住方块、盘下只有十几像素、工具条里没位置），
    // 提示是临时的，压住礼盒剪影不挡任何操作。
    var tipFs = Math.max(10, Math.round(W * 0.031));
    ctx.font = '700 ' + tipFs + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    var tw = ctx.measureText(TOOLS[S.arm].tip).width;
    var th = Math.round(tipFs * 2.0);
    var tbx = Math.round((W - tw) / 2) - 11;
    var tby = L.giftY + Math.round(L.giftH * 0.5) - Math.round(th / 2);
    rr(tbx, tby, tw + 22, th, th / 2);
    ctx.fillStyle = 'rgba(28,23,40,.96)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232,172,80,.65)'; ctx.stroke();
    txt(TOOLS[S.arm].tip, W / 2, tby + th * 0.67, tipFs, C.amber, 'center', true);
  }
}

/* 工具图标：全是代码画，跟零食方块一个语言 */
function drawToolMark(cx, cy, s, id, on){
  var col = on ? C.ink : '#6a6480';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = Math.max(1.5, s * 0.1);
  ctx.strokeStyle = col;
  if (id === 0){
    // 打包机：方箱 + 上下两道压条
    ctx.strokeRect(-s * 0.34, -s * 0.3, s * 0.68, s * 0.6);
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, -s * 0.12); ctx.lineTo(s * 0.42, -s * 0.12);
    ctx.moveTo(-s * 0.42, s * 0.16);  ctx.lineTo(s * 0.42, s * 0.16);
    ctx.stroke();
  } else if (id === 1){
    // 仓鼠：两只耳朵 + 一张脸
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(-s * 0.26, -s * 0.26, s * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( s * 0.26, -s * 0.26, s * 0.15, 0, Math.PI * 2); ctx.fill();
    rr(-s * 0.34, -s * 0.12, s * 0.68, s * 0.54, s * 0.24); ctx.stroke();
    ctx.beginPath(); ctx.arc(-s * 0.12, s * 0.14, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( s * 0.12, s * 0.14, s * 0.05, 0, Math.PI * 2); ctx.fill();
  } else {
    // 大礼盒：盒身 + 中间的缎带 + 顶上蝴蝶结
    ctx.strokeRect(-s * 0.34, -s * 0.16, s * 0.68, s * 0.54);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.16); ctx.lineTo(0, s * 0.38);
    ctx.moveTo(-s * 0.34, s * 0.06); ctx.lineTo(s * 0.34, s * 0.06);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-s * 0.14, -s * 0.26, s * 0.14, 0, Math.PI * 2);
    ctx.arc( s * 0.14, -s * 0.26, s * 0.14, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function cardBox(h){
  var w = Math.min(W - L.pad * 2, 340);
  var x = (W - w) / 2, y = (H - h) / 2;
  ctx.fillStyle = 'rgba(20,16,28,.74)';
  ctx.fillRect(0, 0, W, H);
  rr(x, y, w, h, 16);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
  return [x, y, w, h];
}

/* 说明文字排版：先压字号塞成一行；压不下去就按标点对半断成两行，
   绝不让最后一行只剩一个句号（320 档出现过「。」独占一行） */
function fitHintLines(text, maxW, base){
  var sz, one;
  for (sz = base; sz >= 11; sz--){
    one = wrap(text, maxW, sz);
    if (one.length === 1) return { size: sz, lines: one };
  }
  var mid = text.length / 2, idx = -1, bestD = 1e9, i, d;
  for (i = 0; i < text.length - 1; i++){
    if ('，。；、！？'.indexOf(text.charAt(i)) < 0) continue;
    d = Math.abs(i + 1 - mid);
    if (d < bestD){ bestD = d; idx = i + 1; }
  }
  if (idx < 0) idx = Math.round(mid);
  var two = [text.slice(0, idx), text.slice(idx)];
  for (sz = base; sz >= 11; sz--){
    if (wrap(two[0], maxW, sz).length === 1 && wrap(two[1], maxW, sz).length === 1)
      return { size: sz, lines: two };
  }
  return { size: 11, lines: two };
}

function drawHint(){
  var padIn = 24;
  var w = w0();
  var base = Math.max(13, Math.round(W * 0.04));
  var fit = fitHintLines(S.hintText, w - padIn * 2, base);
  var size = fit.size, lines = fit.lines;
  var lh = Math.round(size * 1.8);
  var btnH = Math.round(Math.min(44, W * 0.115));
  var h = 30 + 26 + lines.length * lh + 18 + btnH + 22;

  var box = cardBox(h);
  var x = box[0], y = box[1];

  txt('第 ' + S.level + ' 关 · ' + cfg().name, W / 2, y + 30, Math.max(11, Math.round(W * 0.034)), C.muted, 'center', true);
  for (var i = 0; i < lines.length; i++)
    txt(lines[i], W / 2, y + 30 + 26 + i * lh, size, C.ink, 'center', true);

  var bw = Math.round(w * 0.52);
  var bx = W / 2 - bw / 2, byy = y + h - btnH - 22;
  rr(bx, byy, bw, btnH, btnH / 2);
  ctx.fillStyle = C.amber; ctx.fill();
  txt('知道了', bx + bw / 2, byy + btnH * 0.66, Math.max(12, Math.round(W * 0.038)), '#241d2e', 'center', true);
  HIT.ok = [bx, byy, bw, btnH];
}

function wrap(str, maxW, size){
  ctx.font = '700 ' + size + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  var out = [], cur = '', i, ch, test;
  for (i = 0; i < str.length; i++){
    ch = str.charAt(i);
    test = cur + ch;
    if (ctx.measureText(test).width > maxW && cur.length){
      out.push(cur); cur = ch;
    } else cur = test;
  }
  if (cur.length) out.push(cur);
  return out;
}

function drawPick(){
  var h = Math.round(Math.min(H * 0.56, 400));
  var box = cardBox(h);
  var x = box[0], y = box[1], w = box[2];
  txt('第 ' + S.level + ' 关完成', W / 2, y + 30, Math.round(W * 0.042), C.muted, 'center', true);
  txt('礼盒里挑一样带走', W / 2, y + 56, Math.round(W * 0.038), C.ink, 'center', true);

  var ch = Math.round((h - 96) / 3) - 6;
  var cw = w - 32;
  for (var i = 0; i < S.cand.length; i++){
    var pk = PACKS[S.cand[i]];
    var cy = y + 70 + i * (ch + 8);
    rr(x + 16, cy, cw, ch, 10);
    ctx.fillStyle = C.panel2; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
    drawToolMark(x + 44, cy + ch * 0.44, Math.min(ch * 0.62, 34), pk.tool, true);
    txt(pk.name, x + 72, cy + ch * 0.42, Math.round(W * 0.04), C.ink, 'left', true);
    txt(pk.desc, x + 72, cy + ch * 0.74, Math.max(10, Math.round(W * 0.03)), C.muted, 'left');
    txt('带走', x + 16 + cw - 16, cy + ch * 0.55, Math.round(W * 0.034), C.amber, 'right', true);
    HIT['pick' + i] = [x + 16, cy, cw, ch];
  }
}

function drawEnd(){
  var win = S.phase === 'win';
  var padIn = 22;
  var titleSize = Math.round(W * 0.052);
  var subSize = Math.round(W * 0.036);
  var rowSize = Math.max(11, Math.round(W * 0.034));
  var lh = Math.round(rowSize * 1.9);

  var rows = [
    ['总进度', Math.min(S.prog, S.target) + ' / ' + S.target],
    ['剩余步数', String(S.steps)],
    ['最大单次滑动', '+' + S.maxGain],
    ['本关重排', S.reshuffles + ' 次']
  ];
  if (S.wantT >= 0) rows.splice(1, 0, [TYPES[S.wantT].name, S.have + ' / ' + S.need]);

  var names = [];
  for (var ni = 0; ni < TOOLS.length; ni++)
    if (S.tools[ni]) names.push(TOOLS[ni].name + ' ×' + S.tools[ni]);
  var nameLines = wrap(names.length ? names.join('、') : '没用出去', w0() - padIn * 2, Math.max(11, Math.round(W * 0.032)));

  var pat = PATTERNS[S.pattern];
  var prow = pat.rows.length, pcol = pat.rows[0].length;
  var cell = win ? Math.max(6, Math.min(14, Math.floor((w0() - padIn * 2) / pcol))) : 0;
  var giftH = win ? cell * prow : 0;

  var btnH = Math.round(Math.min(44, W * 0.115));
  // 逐段推 y，再据此定卡高 —— 之前用估的公式，礼盒底部会压到按钮
  var yTitle = 40, ySub = yTitle + 30;
  var yRows = ySub + Math.round(lh * 0.9) + 4;
  var yNames = yRows + rows.length * lh + 4;
  var yNameFirst = yNames + 20;
  var yGift = yNameFirst + Math.max(0, nameLines.length - 1) * 20 + 12;
  var h = yGift + giftH + 20 + btnH + 24;
  h = Math.min(h, Math.round(H * 0.9));

  var box = cardBox(h);
  var x = box[0], y = box[1], w = box[2];

  txt(win ? '本局通关' : '订单没完成', W / 2, y + yTitle, titleSize, win ? C.amber : C.bad, 'center', true);
  txt('第 ' + S.level + ' 关 · ' + cfg().name, W / 2, y + ySub, subSize, C.muted, 'center', true);

  for (var i = 0; i < rows.length; i++){
    txt(rows[i][0], x + padIn, y + yRows + i * lh, rowSize, C.muted, 'left');
    txt(rows[i][1], x + w - padIn, y + yRows + i * lh, rowSize, C.ink, 'right', true);
  }

  txt('本局剩下的工具', x + padIn, y + yNames, Math.max(11, Math.round(W * 0.032)), C.muted, 'left');
  for (i = 0; i < nameLines.length; i++)
    txt(nameLines[i], x + padIn, y + yNameFirst + i * 20, Math.max(11, Math.round(W * 0.032)), C.ink, 'left');

  if (win){
    var gx = Math.round(W / 2 - cell * pcol / 2), gy = y + yGift;
    for (var r2 = 0; r2 < prow; r2++){
      for (var c2 = 0; c2 < pcol; c2++){
        if (pat.rows[r2][c2] !== '#') continue;
        ctx.fillStyle = C.amber;
        ctx.fillRect(gx + c2 * cell, gy + r2 * cell, cell, cell);
      }
    }
  }

  var bw = Math.round(w * 0.52), bh = btnH;
  var bx = W / 2 - bw / 2, byy = y + h - bh - 22;
  rr(bx, byy, bw, bh, bh / 2);
  ctx.fillStyle = win ? C.amber : C.panel;
  ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.amber; ctx.stroke();
  txt(win ? '再玩一局' : '重打这一关', bx + bw / 2, byy + bh * 0.66,
      Math.max(12, Math.round(W * 0.038)), win ? '#241d2e' : C.amber, 'center', true);
  HIT.again = [bx, byy, bw, bh];
}

function w0(){ return Math.min(W - L.pad * 2, 340); }

function drawTitle(){
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  var cy = Math.round(H * 0.3);
  txt('仓鼠零食工厂', W / 2, cy, Math.round(W * 0.1), C.ink, 'center', true);
  txt('交换三消 · 掉落连击 · 集齐礼盒', W / 2, cy + Math.round(W * 0.08),
      Math.max(11, Math.round(W * 0.036)), C.muted, 'center');

  var hs = Math.round(W * 0.16);
  for (var i = 0; i < 3; i++)
    drawHamster(W / 2 - hs * 1.9 + i * hs * 1.4, cy + Math.round(W * 0.16), hs, i % 3, 0);

  var bw = Math.round(W * 0.56), bh = Math.round(Math.min(52, H * 0.07));
  var bx = W / 2 - bw / 2, by = Math.round(H * 0.68);
  rr(bx, by, bw, bh, bh / 2);
  ctx.fillStyle = C.amber; ctx.fill();
  txt('开一局', bx + bw / 2, by + bh * 0.65, Math.round(W * 0.045), '#241d2e', 'center', true);
  HIT.start = [bx, by, bw, bh];

  txt('五关订单 · 三选一强化 · 一张礼盒图案', W / 2, by + bh + 34,
      Math.max(10, Math.round(W * 0.031)), C.muted, 'center');
}

function draw(){
  HIT = {};
  if (S.phase === 'title'){ drawTitle(); return; }

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  drawHeader();
  drawGiftPanel();
  drawBoard();
  drawBottom();

  if (S.phase === 'play' && S.hintOpen) drawHint();
  if (S.phase === 'pick') drawPick();
  if (S.phase === 'win' || S.phase === 'lose') drawEnd();
}

/* ============================================================
   交互
   ============================================================ */
function hitCell(px, py){
  var cs = L.cs;
  var c = Math.floor((px - L.boardX) / cs);
  var r = Math.floor((py - L.boardY) / cs);
  if (r < 0 || r >= N || c < 0 || c >= N) return null;
  return [r, c];
}

function inRect(p, rect){
  return rect && p[0] >= rect[0] && p[0] <= rect[0] + rect[2] && p[1] >= rect[1] && p[1] <= rect[1] + rect[3];
}

var drag = null;

function onDown(e){
  var rect = canvas.getBoundingClientRect();
  var pt = [e.clientX - rect.left, e.clientY - rect.top - SAFE_TOP];
  drag = { start: pt, cell: hitCell(pt[0], pt[1]), done: false };

  // 动画期间不接操作，否则连点会把还没演完的那一步顶掉
  if (S.anim){ drag = null; return; }
  if (S.phase === 'play' && S.hintOpen){
    if (inRect(pt, HIT.ok)){ S.hintOpen = false; drag = null; }
    return;
  }
  if (S.phase === 'title'){ newRun(Date.now() & 0x7fffffff); drag = null; return; }
  if (S.phase === 'pick'){
    for (var i = 0; i < S.cand.length; i++){
      if (inRect(pt, HIT['pick' + i])){ chooseUpgrade(S.cand[i]); drag = null; return; }
    }
    return;
  }
  if ((S.phase === 'win' || S.phase === 'lose') && inRect(pt, HIT.again)){
    if (S.phase === 'win') newRun((Date.now() ^ 0x5f3a) & 0x7fffffff);
    else startLevel(S.level);
    drag = null;
    return;
  }
  if (inRect(pt, HIT.restart)){ newRun((Date.now() ^ 0x1f) & 0x7fffffff); drag = null; return; }

  // 底部三个工具：点一下用一次。需要选格子的按下后进入「待点」状态，再点盘面。
  if (S.phase === 'play'){
    for (var ti = 0; ti < TOOLS.length; ti++){
      if (inRect(pt, HIT['tool' + ti])){
        if (S.tools[ti] > 0 && TOOLS[ti].needsCell){ useTool(ti, null); drag = null; return; }
        if (S.tools[ti] > 0){ useTool(ti, null); drag = null; return; }
        S.shakeUntil = performance.now() + 160;   // 没有库存：晃一下，别静默
        drag = null; return;
      }
    }
    // 待点状态：这一下点盘面就是给工具指位置
    if (S.arm >= 0 && drag.cell){
      useTool(S.arm, drag.cell);
      drag = null;
      return;
    }
  }

  // 点选两下也能换：先点的留在 S.sel，第二下要是相邻就直接交换。
  // 之前这里无条件 S.sel = 当前格，第一下就被自己覆盖，点两下永远换不动。
  if (S.phase === 'play' && drag.cell){
    var prev = S.sel;
    if (prev && (Math.abs(prev[0] - drag.cell[0]) + Math.abs(prev[1] - drag.cell[1]) === 1)){
      trySwap(prev, drag.cell);
      S.sel = null;
      drag = null;
      return;
    }
    S.sel = drag.cell;
  }
}

function onMove(e){
  if (!drag || drag.done || S.phase !== 'play' || S.hintOpen) return;
  var rect = canvas.getBoundingClientRect();
  var px = e.clientX - rect.left, py = e.clientY - rect.top - SAFE_TOP;
  var dx = px - drag.start[0], dy = py - drag.start[1];
  var th = L.cs * 0.42;
  if (Math.abs(dx) < th && Math.abs(dy) < th) return;

  var a = drag.cell;
  if (!a) return;
  var b = Math.abs(dx) > Math.abs(dy)
    ? [a[0], a[1] + (dx > 0 ? 1 : -1)]
    : [a[0] + (dy > 0 ? 1 : -1), a[1]];
  if (b[0] < 0 || b[0] >= N || b[1] < 0 || b[1] >= N) return;

  drag.done = true;
  trySwap(a, b);
}

function onUp(e){
  if (!drag) return;
  if (S.anim){ drag = null; return; }
  var rect = canvas.getBoundingClientRect();
  var pt = [e.clientX - rect.left, e.clientY - rect.top - SAFE_TOP];
  if (!drag.done && S.phase === 'play' && !S.hintOpen){
    var cell = hitCell(pt[0], pt[1]);
    if (cell && drag.cell && (cell[0] !== drag.cell[0] || cell[1] !== drag.cell[1])){
      var d = Math.abs(cell[0] - drag.cell[0]) + Math.abs(cell[1] - drag.cell[1]);
      if (d === 1) trySwap(drag.cell, cell);
      else S.sel = cell;
    }
  }
  drag = null;
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', function(){ drag = null; });
window.addEventListener('resize', resize);

/* ============================================================
   主循环
   ============================================================ */
function frame(ts){
  if (ts === undefined || ts === null) ts = performance.now();
  var dt = _lastTs ? Math.min(60, ts - _lastTs) : 16;
  _lastTs = ts;
  // 进度条在动画期间追着真值爬，别一帧跳满
  if (S.anim){
    var target = S.prog;
    S.progShown += (target - S.progShown) * Math.min(1, dt / 90);
    if (Math.abs(target - S.progShown) < 0.6) S.progShown = target;
    if (!S.animFreeze) stepAnim(dt);
  } else if (S.progShown !== S.prog){
    S.progShown = S.prog;
  }
  draw();
  requestAnimationFrame(frame);
}
var _lastTs = 0;

resize();
S.phase = 'title';
S.board = [];
for (var _i = 0; _i < N; _i++) S.board.push([0,0,0,0,0]);
requestAnimationFrame(frame);

/* ============================================================
   测试接口
   ============================================================ */
function bestMove(b){
  var moves = validMoves(b), best = null, bestScore = -1, i, runs, seen, k;
  for (i = 0; i < moves.length; i++){
    swapCells(b, moves[i][0], moves[i][1]);
    runs = findRuns(b);
    seen = {};
    for (var j = 0; j < runs.length; j++)
      for (k = 0; k < runs[j].cells.length; k++) seen[runs[j].cells[k]] = 1;
    var score = Object.keys(seen).length;
    swapCells(b, moves[i][0], moves[i][1]);
    if (score > bestScore){ bestScore = score; best = moves[i]; }
  }
  return best;
}

window.__gameState = function(){
  return {
    phase: S.phase, level: S.level, steps: S.steps, prog: S.prog,
    target: S.target, have: S.have, need: S.need,
    want: S.wantT, upgrades: S.upgrades.slice(), pattern: S.pattern,
    board: S.board.map(function(row){ return row.slice(); }),
    seed: S.seed, cascadeMax: S.cascadeMax, reshuffles: S.reshuffles
  };
};

window.__newRun = newRun;
window.__trySwap = trySwap;
window.__chooseUpgrade = chooseUpgrade;
/* 给截图/回归用的钩子：只改状态，不改规则 */
window.__startLevel = startLevel;
window.__dismissHint = function(){ if (S.phase === 'play') S.hintOpen = false; };
window.__debug = function(obj){ for (var k in obj) S[k] = obj[k]; };
window.__bestMove = function(){ return bestMove(S.board); };
window.__pickFirst = function(){ return S.cand ? S.cand[0] : -1; };
window.__useTool = function(id, cell){ return useTool(id, cell || null); };
window.__geom = function(){ return { cs: L.cs, bx: L.boardX, by: L.boardY }; };
/* 动画自检：返回当前动画阶段与碎屑/连击状态 */
window.__animState = function(){
  return {
    phase: S.anim ? S.anim.phase : null,
    idx: S.anim ? S.anim.idx : -1,
    rounds: S.anim ? S.anim.rounds.length : 0,
    parts: S.parts.length,
    combo: S.combo,
    progShown: Math.round(S.progShown),
    prog: S.prog
  };
};
/* 渲染层自检：把这一帧真正用来画的视图吐出来，排查错位 */
window.__viewDump = function(){
  var v = animView();
  return {
    phase: S.anim ? S.anim.phase : null,
    idx: S.anim ? S.anim.idx : -1,
    board: v ? v.board : S.board.map(function(r){ return r.slice(); }),
    dy: v ? v.dy : {}, sc: v ? v.sc : {},
    rounds: S.anim ? S.anim.rounds.map(function(r){ return { n:r.cells.length, gain:r.gain }; }) : []
  };
};

/* 截图自检：把动画钉在某一阶段的某一时刻，拍准这一帧。
   __freezeAnim('pop', 0.12) —— 只给截图脚本用，不参与规则 */
window.__freezeAnim = function(phase, frac){
  var a = S.anim;
  if (!a) return null;
  S.animFreeze = true;
  a.idx = 0;
  a.phase = phase;
  a.t = (phase === 'swap' ? a.swapMs : phase === 'pop' ? a.popMs : a.fallMs) * (frac || 0);
  if (phase === 'pop') spawnPops(a.rounds[0]);
  return { phase: a.phase, t: a.t, idx: a.idx };
};
window.__unfreezeAnim = function(){ S.animFreeze = false; return !!S.anim; };

/* 动画自检（截图/回归用）：不开画面，同步把动画一点点推完，
   记录每一段的阶段、连击数、飘字内容。用来证明「连击」这一段真的会播。 */
window.__animSelfTest = function(board, move){
  var wasInstant = S.instant;
  S.instant = false;
  if (board){ S.board = board.map(function(r){ return r.slice(); }); S.phase = 'play'; if (!S.steps) S.steps = 9; }
  S.sel = null; S.prog = 0; S.anim = null; S.parts = []; S.popTxt = null; S.combo = 0;
  if (!move) move = bestMove(S.board);
  var ok = move ? trySwap(move[0], move[1]) : false;
  var seen = [], guard = 0;
  while (S.anim && guard++ < 2000){
    seen.push({ ph: S.anim.phase, idx: S.anim.idx, combo: S.combo,
                txt: S.popTxt ? S.popTxt.text : null, parts: S.parts.length });
    S.anim.t += 24;              // 每步 24ms，够把 swapMs/popMs/fallMs 走穿
    stepAnim(24);
  }
  var out = {
    started: ok, steps: seen.length, phases: [], combos: [], texts: [],
    maxParts: 0, ended: !!S.anim === false, prog: S.prog
  };
  for (var i = 0; i < seen.length; i++){
    var s = seen[i];
    var key = s.ph + '/' + s.idx;
    if (out.phases.indexOf(key) < 0) out.phases.push(key);
    if (out.combos.indexOf(s.combo) < 0) out.combos.push(s.combo);
    if (s.txt && out.texts.indexOf(s.txt) < 0) out.texts.push(s.txt);
    if (s.parts > out.maxParts) out.maxParts = s.parts;
  }
  S.instant = wasInstant;
  return out;
};
/* 当前飘字（回归读取用） */
window.__popInfo = function(){
  return S.popTxt ? { text: S.popTxt.text, big: !!S.popTxt.big } : null;
};

/* 截图用：装上一批工具，真放一次，把动画停在「清得最多的那一轮」的 pop 上并钉住。
   cell 不传就自己挑：打包机/大礼盒取盘面中心，仓鼠不需要格子。
   注意：为了让这一手不被过关判定打断，临时把 target 抬高；定格后把顶部读数恢复成
   关卡真值，否则截图上会出现「步数 399/5、进度 166/99999」这种一眼假的数字。 */
window.__toolStage = function(toolId, frac, cell){
  window.__unfreezeAnim();
  if (S.phase !== 'play'){ newRun(Date.now() & 0x7fffffff); S.hintOpen = false; }
  var realTarget = S.target, realSteps = S.steps, realProg = S.prog;
  S.tools = [0,0,0]; S.tools[toolId] = 1;
  S.target = 99999; S.steps = 400;
  S.anim = null; S.parts = []; S.popTxt = null; S.combo = 0;
  var at = cell || [2, 2];
  // 空格子换一个，否则 toolCells 会把它跳掉
  if (S.board[at[0]][at[1]] === null) at = [2, 3];
  var res = useTool(toolId, TOOLS[toolId].needsCell ? at : null);
  if (res !== 'used') return { ok:false, why:'tool ' + res };
  if (!S.anim) return { ok:false, why:'no anim' };
  var bestI = 0, bestN = -1, i;
  for (i = 0; i < S.anim.rounds.length; i++){
    if (S.anim.rounds[i].cells.length > bestN){ bestN = S.anim.rounds[i].cells.length; bestI = i; }
  }
  var guard = 0;
  while (S.anim && guard++ < 4000){
    if (S.anim.phase === 'pop' && S.anim.idx === bestI) break;
    S.anim.t = 1e6; stepAnim(16);
  }
  if (!S.anim) return { ok:false, why:'anim ended' };
  S.animFreeze = true;
  S.anim.t = S.anim.popMs * (frac === undefined ? 0.24 : frac);
  if (S.popTxt) S.popTxt.t0 = performance.now();
  var acc = 0, rr;
  for (rr = 0; rr <= bestI && rr < S.anim.rounds.length; rr++) acc += (S.anim.rounds[rr].gain || 0);
  var shownProg = Math.min(realTarget, realProg + acc);
  S.target = realTarget;
  S.steps = Math.max(0, realSteps - 1);
  S.prog = shownProg; S.progShown = shownProg;
  return { ok:true, idx: bestI, cells: bestN, rounds: S.anim.rounds.length,
           txt: S.popTxt ? S.popTxt.text : null,
           want: shownProg + '/' + realTarget, steps: S.steps + '/' + S.stepsMax,
           log: S.gains.map(function(g){ return g.label; }).join(' | ') };
};

/* 当前这一轮要清掉几格（截图挑帧用） */
window.__animRoundSize = function(){
  if (!S.anim) return 0;
  var rec = S.anim.rounds[S.anim.idx];
  return rec ? rec.cells.length : 0;
};

/* 工具自检（回归用）：给每个工具放一次，返回清掉几格、花没花步数、动画几轮。
   目标调成 9999，免得中途过关换关。 */
window.__toolProbe = function(moves, seed){
  var wasInst = S.instant;
  var out = { perTool: [], stepsSpent: 0, errors: [] };
  newRun(seed || 20261120);
  S.instant = true;
  S.target = 9999; S.steps = 400;
  for (var id = 0; id < TOOLS.length; id++){
    var pre = S.prog, preSteps = S.steps;
    S.tools = [0,0,0]; S.tools[id] = 1;
    var before = S.steps;
    var r = useTool(id, TOOLS[id].needsCell ? [2, 3] : null);
    out.perTool.push({
      name: TOOLS[id].name, res: r, gain: S.prog - pre,
      stepsUsed: before - S.steps, rounds: S.gains.length,
      log: S.gains.map(function(g){ return g.label; }).join(' | ')
    });
  }
  // 连放 20 手普通交换，确认工具用完以后规则照旧
  S.steps = 400;
  for (var i = 0; i < (moves || 20) && S.phase === 'play'; i++){
    var mv = bestMove(S.board);
    if (!mv) break;
    trySwap(mv[0], mv[1]);
  }
  S.instant = wasInst;
  return out;
};

/* 连击抽样（回归用）：连下 n 手，返回有多少手演到了第二回合以上，   以及一个实例的相位/飘字，用来证明「连击」那一段确实会播。 */
window.__animScan = function(n){
  n = n || 60;
  var played = 0, multi = [], maxIdx = 0, i, k, hi, p2, r;
  for (i = 0; i < n; i++){
    if (S.phase !== 'play'){ newRun(20261120 + i * 97); S.hintOpen = false; }
    S.steps = Math.max(S.steps, 2);
    r = window.__animSelfTest(null, null);
    if (!r.started) continue;
    played++;
    hi = 0;
    for (k = 0; k < r.phases.length; k++){
      p2 = r.phases[k].split('/');
      if (+p2[1] > hi) hi = +p2[1];
    }
    if (hi > maxIdx) maxIdx = hi;
    if (hi >= 1) multi.push({ hand: i, idx: hi, phases: r.phases, texts: r.texts, combos: r.combos });
  }
  return { played: played, multiRound: multi.length, maxIdx: maxIdx, sample: multi[0] || null };
};

/* 截图用：真下一手，把动画推进到第 wantIdx 回合的 pop 阶段并钉住（配合 __freezeAnim 出图）。
   返回是否到达；不到就原样收尾。 */
window.__animStage = function(wantIdx, frac){
  window.__unfreezeAnim();
  if (S.phase !== 'play'){ newRun(Date.now() & 0x7fffffff); S.hintOpen = false; }
  var mv = bestMove(S.board);
  if (!mv) return { ok:false, why:'no move' };
  S.anim = null; S.parts = []; S.popTxt = null; S.combo = 0;
  if (!trySwap(mv[0], mv[1])) return { ok:false, why:'swap refused' };
  if (!S.anim) return { ok:false, why:'no anim (single round instant?)' };
  var guard = 0, reached = false;
  while (S.anim && guard++ < 3000){
    if (S.anim.phase === 'pop' && S.anim.idx === wantIdx){ reached = true; break; }
    S.anim.t = 1e6; stepAnim(16);
  }
  if (!reached) return { ok:false, why:'rounds=' + (S.anim ? S.anim.rounds.length : 0) };
  S.animFreeze = true;
  S.anim.t = S.anim.popMs * (frac === undefined ? 0.12 : frac);
  if (S.popTxt) S.popTxt.t0 = performance.now();   // 定格这一帧时飘字也从起点开始，截图才对准
  S.progShown = S.prog;
  return { ok:true, idx: S.anim.idx, rounds: S.anim.rounds.length, combo: S.combo,
           txt: S.popTxt ? S.popTxt.text : null, parts: S.parts.length };
};

/* 批量回归：跑 games 局，返回通过率与可疑项（只筛异常，不证趣味） */
window.__testRun = function(games, seed0, useTools){
  games = games || 12;
  seed0 = (seed0 === undefined ? 20261120 : seed0) | 0;
  if (useTools === undefined) useTools = true;   // 工具不花步数，真人一定会点，回归也得点
  var wasInstant = S.instant;
  S.instant = true;                 // 回归只验规则，不等动画
  var out = {
    games: games, wins: 0, stuck: 0, errors: [],
    levelReach: [0,0,0,0,0],
    stepsLeft: {}, cascades: [], reshuffleTotal: 0,
    picks: {}, toolsUsed: 0
  };
  for (var gi = 0; gi < games; gi++){
    try {
      newRun(seed0 + gi * 7919);
      var usedLv = {}, pickTurn = 0, guard = 0;
      while (S.phase === 'play' || S.phase === 'pick'){
        if (++guard > 800){ out.stuck++; break; }
        if (S.phase === 'pick'){
          // 三张卡轮流选，才测得出每样工具的实际强度（以前永远取第一张）
          var pk = PACKS[(gi + pickTurn++) % PACKS.length];
          out.picks[pk.name] = (out.picks[pk.name] || 0) + 1;
          chooseUpgrade(pk.tool);
          continue;
        }
        // 每关开局先把手上的工具用完（不用白不用，且不花步数）
        var lkey = S.trace.length;
        if (useTools && !usedLv[lkey]){
          usedLv[lkey] = 1;
          for (var ti = 0; ti < TOOLS.length && S.phase === 'play'; ti++){
            var want = 0;
            while (S.tools[ti] > 0 && S.phase === 'play' && want++ < 6){
              useTool(ti, TOOLS[ti].needsCell ? [2, 2] : null);
              out.toolsUsed++;
            }
          }
          if (S.phase !== 'play') continue;
        }
        var mv = bestMove(S.board);
        if (!mv){ out.stuck++; break; }
        trySwap(mv[0], mv[1]);
      }
      if (S.phase === 'win') out.wins++;
      for (var t = 0; t < S.trace.length; t++){
        var tr = S.trace[t];
        out.levelReach[tr.lv - 1]++;
        out.stepsLeft[tr.lv] = (out.stepsLeft[tr.lv] || 0) + tr.steps;
        out.cascades.push(tr.cascade);
        out.reshuffleTotal += tr.resh;
      }
    } catch (err){
      out.errors.push(String(err && err.message || err));
    }
  }
  var avg = function(arr){ if (!arr.length) return 0; var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return Math.round(s / arr.length * 10) / 10; };
  out.maxCascade = Math.max.apply(null, out.cascades.concat([0]));
  out.avgCascade = avg(out.cascades);
  for (var k in out.stepsLeft) out.stepsLeft[k] = Math.round(out.stepsLeft[k] / Math.max(1, out.levelReach[+k - 1]) * 10) / 10;
  out.winRate = Math.round(out.wins / Math.max(1, games) * 100);
  S.instant = wasInstant;
  return out;
};

})();
