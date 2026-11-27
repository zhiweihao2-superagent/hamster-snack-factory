/* Auto-generated WeChat WASubContext sandbox bridge — edit root game.js instead */
var __wxRoot = (typeof GameGlobal !== "undefined") ? GameGlobal : ((typeof globalThis !== "undefined") ? globalThis : this);
var window = __wxRoot.window || __wxRoot;
var self = __wxRoot.self || window;
var document = __wxRoot.document;
var navigator = __wxRoot.navigator;
var performance = __wxRoot.performance;
var localStorage = __wxRoot.__wxStorage;
try { if (!localStorage) localStorage = __wxRoot.localStorage; } catch (_e) {}
var Image = __wxRoot.Image;
var AudioContext = __wxRoot.AudioContext || window.AudioContext;
var webkitAudioContext = __wxRoot.webkitAudioContext || window.webkitAudioContext || AudioContext;
var HTMLCanvasElement = __wxRoot.HTMLCanvasElement;
var FinalizationRegistry = __wxRoot.FinalizationRegistry;
var CustomEvent = __wxRoot.CustomEvent;
var requestAnimationFrame = function (cb) { return (__wxRoot.requestAnimationFrame || window.requestAnimationFrame).call(window, cb); };
var cancelAnimationFrame = function (id) { return (__wxRoot.cancelAnimationFrame || window.cancelAnimationFrame).call(window, id); };
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


/* ============================================================
   dsh-game-studio 接入层（收编时追加，上面的原逻辑一行未改）
   ============================================================ */
/* ---------- 0. 工程清单：关卡、工具都从 game.json 的 rules 来 ---------- */
var GAME = (typeof window !== 'undefined' && window.GAME) || {};
var RULES = GAME.rules || {};

if (RULES.levels && RULES.levels.length){
  LEVELS.length = 0;
  for (var _li = 0; _li < RULES.levels.length; _li++){
    var _src = RULES.levels[_li] || {};
    LEVELS.push({
      name: String(_src.name || ('第 ' + (_li + 1) + ' 关')),
      steps: Math.max(1, +_src.steps || 6),
      target: Math.max(3, +_src.target || 40),
      want: (_src.want === undefined || _src.want === null) ? undefined : +_src.want,
      need: +_src.need || 0,
      hint: _src.hint || '',
      tip: _src.tip || ''
    });
  }
}

/* ---------- 1. 存档：最高关卡、最大单次进度、通关次数、音效开关 ---------- */
var SAVE_KEY = 'hamsterSnackFactory.save.v2';
var SAVE = { best: 1, bestGain: 0, plays: 0, wins: 0, mute: false };

function loadSave(){
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    var obj = JSON.parse(raw);
    if (obj && typeof obj === 'object'){
      if (obj.best) SAVE.best = Math.max(1, +obj.best || 1);
      if (obj.bestGain) SAVE.bestGain = Math.max(0, +obj.bestGain || 0);
      if (obj.plays) SAVE.plays = Math.max(0, +obj.plays || 0);
      if (obj.wins) SAVE.wins = Math.max(0, +obj.wins || 0);
      SAVE.mute = !!obj.mute;
    }
  } catch (e) { /* 隐私模式 / 微信未登录：只是不存，不影响玩 */ }
}

function saveNow(){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {}
}

loadSave();

/* ---------- 2. 音效：WebAudio 现场合成，不占包体，微信也能出声 ---------- */
var AC = null, AC_DEAD = false, SFX_GAIN = 0.11;

function audioCtx(){
  if (AC || AC_DEAD) return AC;
  try {
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor){ AC_DEAD = true; return null; }
    AC = new Ctor();
  } catch (e) { AC_DEAD = true; AC = null; }
  return AC;
}

function unlockAudio(){
  var c = audioCtx();
  if (!c) return;
  try { if (c.state === 'suspended' && c.resume) c.resume(); } catch (e) {}
}

function blip(freq, toFreq, ms, type, gain, delay){
  if (SAVE.mute) return;
  var c = audioCtx();
  if (!c) return;
  try {
    var t0 = (c.currentTime || 0) + (delay || 0);
    var osc = c.createOscillator();
    var env = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (toFreq && toFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t0 + ms / 1000);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || SFX_GAIN), t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(env);
    env.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.02);
  } catch (e) {}
}

function noise(ms, gain, lowpass){
  if (SAVE.mute) return;
  var c = audioCtx();
  if (!c || !c.createBuffer) return;
  try {
    var n = Math.max(1, Math.floor((c.sampleRate || 44100) * ms / 1000));
    var buf = c.createBuffer(1, n, c.sampleRate || 44100);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource();
    src.buffer = buf;
    var env = c.createGain();
    env.gain.value = gain || 0.05;
    var filter = null;
    if (c.createBiquadFilter && lowpass){
      filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      src.connect(filter);
      filter.connect(env);
    } else {
      src.connect(env);
    }
    env.connect(c.destination);
    src.start(0);
  } catch (e) {}
}

function sfx(name, opt){
  if (SAVE.mute) return;
  opt = opt || {};
  if (name === 'tap'){
    blip(660, 480, 70, 'square', 0.05);
  } else if (name === 'swap'){
    blip(520, 760, 80, 'sine', 0.07);
  } else if (name === 'invalid'){
    blip(220, 160, 110, 'sawtooth', 0.05);
  } else if (name === 'pop'){
    /* 消除：一声脆响 + 一点点噪声，连击越高越亮 */
    var step = Math.min(6, Math.max(0, (opt.round || 1) - 1));
    blip(560 + step * 90, 900 + step * 110, 110, 'triangle', 0.09);
    noise(55, 0.045, 2200);
  } else if (name === 'combo'){
    blip(520, 660, 90, 'triangle', 0.07);
    blip(780, 980, 110, 'triangle', 0.06, 0.06);
  } else if (name === 'tool'){
    blip(180, 940, 200, 'sawtooth', 0.08);
    noise(160, 0.06, 3200);
  } else if (name === 'pick'){
    blip(720, 720, 90, 'sine', 0.07);
    blip(960, 960, 130, 'sine', 0.06, 0.08);
  } else if (name === 'win'){
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) blip(notes[i], notes[i], 200, 'triangle', 0.08, i * 0.11);
  } else if (name === 'lose'){
    blip(400, 180, 320, 'sine', 0.08);
  } else if (name === 'reshuffle'){
    blip(300, 620, 160, 'sine', 0.06);
  } else if (name === 'hit'){
    /* 轻击：短促的"啪" + 一点噪声当冲击 */
    blip(320, 180, 70, 'square', 0.06);
    noise(40, 0.03, 2600);
  } else if (name === 'hitBig'){
    /* 重击：低频下坠 + 更长噪声尾巴 */
    blip(180, 90, 150, 'sawtooth', 0.09);
    noise(90, 0.055, 1800);
  } else if (name === 'crit'){
    /* 暴击/穿甲：金属裂开的两段音 */
    blip(900, 1400, 70, 'triangle', 0.08);
    blip(1400, 500, 140, 'square', 0.06, 0.05);
    noise(70, 0.04, 4200);
  } else if (name === 'break'){
    /* 破箱/破盾：干脆的一声脆裂 */
    blip(700, 260, 120, 'square', 0.07);
    noise(110, 0.05, 3800);
  } else if (name === 'shield'){
    /* 护甲吸收：闷闷的"咚" */
    blip(220, 150, 110, 'sine', 0.05);
  } else if (name === 'heal'){
    /* 治疗：上行三音 */
    blip(660, 660, 90, 'sine', 0.05);
    blip(880, 880, 90, 'sine', 0.045, 0.06);
    blip(1100, 1100, 120, 'sine', 0.04, 0.12);
  } else if (name === 'down'){
    /* 阵亡：下滑 + 噪声 */
    blip(300, 90, 280, 'sawtooth', 0.07);
    noise(200, 0.04, 900);
  }
}

/* ---------- 3. 美术槽：game.json 里有自定义图就用图，没有就沿用代码画的方块 ---------- */
var SLOT_OF_TYPE = ['snack_peanut', 'snack_cookie', 'snack_seed'];
var ART = {};

function loadArt(){
  var assets = GAME.assets || {};
  var slots = GAME.slots || {};
  var ids = ['hamster', 'snack_peanut', 'snack_cookie', 'snack_seed'];
  for (var i = 0; i < ids.length; i++){
    var id = ids[i];
    var meta = slots[id];
    if (!meta || !meta.custom || !assets[id]) continue;
    try {
      var img = new Image();
      img.__ready = false;
      img.onload = function(){ this.__ready = true; };
      img.onerror = function(){ this.__ready = false; };
      img.src = assets[id];
      ART[id] = img;
    } catch (e) { /* 微信旧基础库没有 Image，就留在代码美术 */ }
  }
}

loadArt();

var _drawTile = drawTile;
drawTile = function(x, y, size, t, dim){
  var img = SLOT_OF_TYPE[t] ? ART[SLOT_OF_TYPE[t]] : null;
  if (img && img.__ready && !dim){
    try { ctx.drawImage(img, x, y, size, size); return; } catch (e) {}
  }
  return _drawTile(x, y, size, t, dim);
};

var _drawHamster = drawHamster;
drawHamster = function(x, y, size, snack, bob){
  var img = ART.hamster;
  if (img && img.__ready){
    try { ctx.drawImage(img, x, y + (bob || 0), size, size); return; } catch (e) {}
  }
  return _drawHamster(x, y, size, snack, bob);
};

/* ---------- 4. 音效 / 存档挂点：包一层，规则不动 ---------- */
var _commitClear = commitClear;
commitClear = function(cells, round, log, rec, label){
  var gain = _commitClear.apply(null, arguments);
  if (gain > 0) sfx(round >= 2 ? 'combo' : 'pop', { round: round });
  return gain;
};

var _useTool = useTool;
useTool = function(id, cell){
  var res = _useTool.apply(null, arguments);
  if (res === 'used') sfx('tool');
  else if (res === 'off') sfx('invalid');
  return res;
};

var _reshuffle = reshuffle;
reshuffle = function(){
  var res = _reshuffle.apply(null, arguments);
  sfx('reshuffle');
  return res;
};

var _chooseUpgrade = chooseUpgrade;
chooseUpgrade = function(id){
  sfx('pick');
  return _chooseUpgrade.apply(null, arguments);
};

var _newRun = newRun;
newRun = function(seed){
  loadSave();
  SAVE.plays++;
  saveNow();
  sfx('tap');
  return _newRun.apply(null, arguments);
};

var _afterResolve = afterResolve;
afterResolve = function(){
  var res = _afterResolve.apply(null, arguments);
  if (S.phase === 'lose'){
    SAVE.best = Math.max(SAVE.best, S.level);
    SAVE.bestGain = Math.max(SAVE.bestGain, S.maxGain || 0);
    saveNow();
    sfx('lose');
  }
  return res;
};

var _finishLevel = finishLevel;
finishLevel = function(){
  var res = _finishLevel.apply(null, arguments);
  SAVE.best = Math.max(SAVE.best, Math.min(LEVELS.length, S.level));
  SAVE.bestGain = Math.max(SAVE.bestGain, S.maxGain || 0);
  if (S.phase === 'win'){ SAVE.wins++; sfx('win'); } else { sfx('pick'); }
  saveNow();
  return res;
};

/* ---------- 5. 标题页：存档回显 + 音效开关 ---------- */
function toggleMute(){
  SAVE.mute = !SAVE.mute;
  saveNow();
  if (!SAVE.mute) sfx('tap');
}

function drawMuteChip(){
  var w = Math.round(Math.min(96, W * 0.24));
  var h = Math.round(Math.min(30, Math.max(22, W * 0.072)));
  var x = W - L.pad - w, y = Math.round(Math.max(14, H * 0.022));
  rr(x, y, w, h, h / 2);
  ctx.fillStyle = C.panel2; ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = SAVE.mute ? C.line : C.amber;
  ctx.stroke();
  txt(SAVE.mute ? '音效 关' : '音效 开', x + w / 2, y + h * 0.66,
      Math.max(10, Math.round(W * 0.029)), SAVE.mute ? C.muted : C.amber, 'center', true);
  HIT.mute = [x, y, w, h];
}

var _drawTitle = drawTitle;
drawTitle = function(){
  _drawTitle();
  var fs = Math.max(10, Math.round(W * 0.03));
  var yb = Math.round(H * 0.68) + Math.round(Math.min(52, H * 0.07)) + 58;
  txt('最高第 ' + SAVE.best + ' 关 · 最大单次 +' + SAVE.bestGain + ' · 通关 ' + SAVE.wins + ' 次',
      W / 2, Math.min(H - 16, yb), fs, C.muted, 'center');
  drawMuteChip();
};

/* ---------- 6. 主绘制包一层：微信安全区整体下移 ---------- */
var _draw = draw;
draw = function(){
  if (SAFE_TOP || SAFE_BOT){
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H + SAFE_TOP + SAFE_BOT);
    ctx.translate(0, SAFE_TOP);
    _draw();
    ctx.restore();
  } else {
    _draw();
  }
};

/* ---------- 7. 输入补充：静音按钮（捕获阶段吞掉），键盘快捷 ---------- */
canvas.addEventListener('pointerdown', function(e){
  try {
    unlockAudio();
    var rect = canvas.getBoundingClientRect();
    var pt = [e.clientX - rect.left, e.clientY - rect.top - SAFE_TOP];
    if (HIT.mute && inRect(pt, HIT.mute)){
      toggleMute();
      if (e.preventDefault) e.preventDefault();
      e.stopImmediatePropagation();
    }
  } catch (err) {}
}, true);

window.addEventListener('keydown', function(e){
  var k = e.key;
  if (k === 'm' || k === 'M'){ toggleMute(); return; }
  if (S.anim) return;
  if (k === 'Enter' || k === ' '){
    if (S.phase === 'title') newRun(Date.now() & 0x7fffffff);
    else if (S.phase === 'win') newRun((Date.now() ^ 0x5f3a) & 0x7fffffff);
    else if (S.phase === 'lose') startLevel(S.level);
    return;
  }
  if (S.phase === 'pick' && S.cand && S.cand.length){
    var idx = '123'.indexOf(k);
    if (idx >= 0 && idx < S.cand.length) chooseUpgrade(S.cand[idx]);
  }
}, false);

/* ---------- 8. 给 dsh-game-studio 的自动化接口 ---------- */
var PHASE_MAP = { title: 'title', shop: 'shop', play: 'playing', pick: 'playing', win: 'won', lose: 'lost' };

var _gameState = window.__gameState;
window.__gameState = function(){
  var raw = _gameState ? _gameState() : {};
  raw.phase = PHASE_MAP[S.phase] || 'playing';
  raw.phaseRaw = S.phase;
  raw.score = S.prog;
  raw.hearts = S.steps;
  raw.world = { w: W, h: H };
  raw.fps = 60;
  raw.tools = S.tools.slice();
  raw.arm = S.arm;
  raw.maxGain = S.maxGain;
  raw.best = SAVE.best;
  raw.muted = SAVE.mute;
  raw.safeTop = SAFE_TOP;
  return raw;
};

/* 无人操作时自己打：一次一个动作，等动画演完再下一步 */
window.__autoplay = function(){
  if (S.anim) return 'wait';
  if (S.phase === 'title'){ newRun(Date.now() & 0x7fffffff); return 'start'; }
  if (S.phase === 'win'){ newRun((Date.now() ^ 0x5f3a) & 0x7fffffff); return 'restart'; }
  if (S.phase === 'lose'){ startLevel(S.level); return 'retry'; }
  if (S.phase === 'pick'){
    if (S.cand && S.cand.length){ chooseUpgrade(S.cand[0]); return 'pick'; }
    return 'wait';
  }
  if (S.hintOpen){ S.hintOpen = false; return 'hint'; }
  for (var i = 0; i < TOOLS.length; i++){
    if (S.tools[i] > 0){
      useTool(i, TOOLS[i].needsCell ? [2, 2] : null);
      return 'tool';
    }
  }
  var mv = bestMove(S.board);
  if (!mv){ reshuffle(); return 'shuffle'; }
  trySwap(mv[0], mv[1]);
  return 'swap';
};

/* 侧栏缩略图：把代码画的角色单独渲染出来 */
window.__renderSlots = function(size){
  size = size || 256;
  var out = {};
  var ids = ['hamster', 'snack_peanut', 'snack_cookie', 'snack_seed'];
  for (var i = 0; i < ids.length; i++){
    var id = ids[i];
    try {
      var cv = document.createElement('canvas');
      cv.width = size; cv.height = size;
      var g = cv.getContext('2d');
      var keep = ctx;
      ctx = g;
      try {
        if (id === 'hamster'){
          drawHamster(size * 0.06, size * 0.02, size * 0.88, 0, 0);
        } else {
          drawTile(size * 0.08, size * 0.08, size * 0.84, SLOT_OF_TYPE.indexOf(id), false);
        }
      } finally {
        ctx = keep;
      }
      var url = cv.toDataURL('image/png');
      if (typeof url === 'string' && url.indexOf('data:image/png') === 0) out[id] = url;
    } catch (e) { /* 微信部分基础库没有 toDataURL，跳过即可 */ }
  }
  return out;
};

/* 微信转发文案 */
window.__wxSharePayload = function(){
  return { title: '仓鼠零食工厂 · 我已经开到第 ' + SAVE.best + ' 关了' };
};

/* 安全区变了（比如折叠屏/旋转）重新排一次版 */
resize();

/* ============================================================
   RPG 战斗层（M2）：三资源 → 仓鼠小队 / 尖牙帮
   ============================================================ */
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
  float: 13,       // 伤害飘字字号
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

/* ---------- 4. 敌方（尖牙帮） ---------- */
var FOES = {
  crate: { name: '纸箱鼠', hp: 18, charge: 3, atk: 8,  box: 1, cls: 'tank',  tier: 2, range: 'melee' },
  shell: { name: '抛壳鼠', hp: 22, charge: 3, atk: 10, pierce: 1, cls: 'blade', tier: 2, range: 'melee' },
  thief: { name: '拾荒鼠', hp: 26, charge: 4, atk: 0, cls: 'shot',  tier: 2, range: 'far' },
  boss:  { name: '质检机', hp: 90, charge: 4, atk: 18, boss: 1, cls: 'hex', tier: 2, range: 'mid' },
  glue:  { name: '喷胶鼠', hp: 30, charge: 4, atk: 4,  cls: 'care',  tier: 2, range: 'far' }
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

function floatText(text, x, y, col, big, kind){
  R.floats.push({ text: text, x: x, y: y, t0: performance.now(), max: 760, col: col || C.ink, big: !!big, kind: kind || '' });
  if (R.floats.length > 24) R.floats.shift();
}

/* 伤害飘字：按类型分色 + 同一目标短时间内的多次伤害合并成一个数
   —— 5v5 打起来一堆数字会糊成一片，合并后只看得到"这一下打了多少"。 */
var FLOAT_COLOR = { hit: '#ff9d8a', crit: '#ffd166', pierce: '#c7b6ff' };
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
      if (tgt.alive) applyUnitDamage(tgt, s.dmg, s.pierce);
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
    x: homeX(slot, false), yo: (slot % 2 ? 0 : -STAGE2.jitter),
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
  }
  return Math.max(1, Math.min(4, base));
}

function foeMake(type, tier){
  var def = FOES[type] || FOES.crate;
  var t = Math.max(1, Math.min(4, tier || enemyTierForLevel()));
  var tm = foeTierOf(t);
  var chargeMs = def.chargeMs || ((def.charge || 3) * 1500);
  var mod = R.mod || {};
  var hpMul = (mod.hpMul || 1) * tm.hp * (FOE_SCALE.hp || 1);
  var atkMul = (mod.atkMul || 1) * tm.atk * (FOE_SCALE.atk || 1);
  var chargeMul = (mod.chargeMul || 1) * tm.charge;
  return {
    type: type, name: foeNameOf(type, t), baseName: def.name,
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
  var list = (CHAPTER.waves || [])[idx] || [];
  var onField = CHAPTER.onField || 2;
  R.enemies = [];
  R.queue = [];
  for (var i = 0; i < list.length; i++){
    var foe = foeMake(list[i].type);
    if (R.enemies.length < onField) R.enemies.push(foe);
    else R.queue.push(foe);
  }
  for (var j = 0; j < R.enemies.length; j++){
    R.enemies[j].slot = j;
    if (typeof R.enemies[j].x !== 'number') R.enemies[j].x = homeX(j, true);
    if (typeof R.enemies[j].yo !== 'number') R.enemies[j].yo = (j % 2 ? 0 : -STAGE2.jitter);
  }
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
    var mult = (CFG.cascade[r - 1] !== undefined ? CFG.cascade[r - 1] : CFG.cascade[CFG.cascade.length - 1])
             + (R.cascadeBonus || 0);
    addYield(cnt, mult);
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

function hurtFoe(foe, dmg, pierce){
  if (!foe || !foe.alive) return;
  var left = Math.round(dmg * (R.buffDmgMul || 1));   // 波间补给：本关伤害加成
  if (foe.box > 0 && !pierce){          // 纸箱：第一下只破箱
    foe.box--;
    floatText('破箱', stageXOf(foe, true), stageYOf(foe, true), C.amber);
    juice('break');
    return;
  }
  foe.hp -= left;
  R.dmgDealt += left;
  foe.flash = performance.now() + 180;
  damageFloat(Math.round(left), stageXOf(foe, true), stageYOf(foe, true),
              left >= 20 ? 'crit' : (pierce ? 'pierce' : 'hit'), left >= 10);
  juice(left >= 20 ? 'crit' : (left >= 10 ? 'hitBig' : 'hit'));
  if (foe.hp <= 0){
    foe.alive = false;
    R.kills++;
    pushLog(foe.name + ' 被击退');
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
  u.actFlash = now + 220;
  var act = u.act || null;
  var dmg = empowered && act ? act.dmg : (u.baseDmg || 0);
  if (dmg <= 0) return;
  if (act && act.kind === 'heal'){
    var ally = weakestAlly();
    if (ally){
      var before = ally.hp;
      ally.hp = Math.min(ally.hpMax, ally.hp + dmg);
      if (ally.hp > before) floatText('+' + Math.round(ally.hp - before), stageXOf(ally, false), stageYOf(ally, false), '#8ee0a8');
    }
    if (empowered && act.armor) R.armor = clamp(R.armor + act.armor, 0, R.armorMax);
  } else if (act && act.kind === 'aoe' && empowered){
    var list = aliveEnemies();
    for (var i = 0; i < list.length; i++) hurtFoe(list[i], dmg, false);
  } else {
    var foe = weakestEnemy();
    if (foe) hurtFoe(foe, dmg, !!(act && act.pierce));
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
function unitTick(dtMs){
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (!u || !u.alive || !u.atkMs) continue;
    ensurePos(u, i, false);
    /* 抬手/冷却的算法不变，但近战必须先走到够得着；够不着时时间照样走，
       只是不进入抬手 —— 走位由 walkTick 负责，所以不会白等太久。 */
    var budget = dtMs * (R.buffAtkMul || 1);
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

function applyUnitDamage(u, dmg, pierce){
  var left = dmg;
  if (!pierce && R.armor > 0){
    var absorb = Math.min(R.armor, left);
    R.armor -= absorb;
    left -= absorb;
    if (absorb > 0){
      floatText('盾 -' + Math.round(absorb), stageXOf(u, false), stageYOf(u, false) - 10, '#9fc6ff');
      sfx('shield');
    }
  }
  if (left <= 0) return;
  u.hp -= left;
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

function walkTick(dtMs){
  var step = STAGE.speed * dtMs / 1000;
  function move(o, isFoe, idx){
    if (!o || !o.alive) return;
    ensurePos(o, idx, isFoe);
    if (o.range === 'far') return;                  /* 远程守在主阵地，不追 */
    var t = targetOf(o, isFoe);
    if (!t){                                        /* 场上没敌人就往前压一点，别站着发呆 */
      o.x = clamp(o.x + (isFoe ? -step : step) * 0.6, 10, W - 10);
      return;
    }
    var need = STAGE2.reach * (o.range === 'mid' ? 1.5 : 1);   // 近战就停在"刚好够得着"的位置
    var d = unitX(t) - unitX(o);
    if (Math.abs(d) < need * 0.86){                 /* 贴太近了：退半步，两个身位不能叠在一起 */
      o.x = clamp(o.x + (d > 0 ? -step : step) * 0.5, 10, W - 10);
      return;
    }
    if (Math.abs(d) <= need) return;                /* 已经够得着：站住打，不追着跑 */
    o.x = clamp(o.x + (d > 0 ? step : -step), 10, W - 10);
  }
  for (var i = 0; i < R.units.length; i++) move(R.units[i], false, i);
  for (var j = 0; j < R.enemies.length; j++) move(R.enemies[j], true, j);
}

function realtimeTick(dtMs){
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
      foe.timerMs += dtMs;
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
  var need = STAGE2.reach * (o.range === 'mid' ? 1.6 : 1.5);
  return Math.abs(unitX(t) - unitX(o)) <= need;
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

function checkBattleEnd(){
  // 唯一的失败条件：我方仓鼠全部阵亡
  if (!aliveUnits().length){ loseTeam(); return; }
  var foes = aliveEnemies().length + R.queue.length;
  if (foes === 0){
    if (R.wave + 1 < R.waveTotal){
      if (shouldPick()) openPick();          // 波间三选一：按 pickEveryN 的间隔给
      else spawnWave(R.wave + 1);            // 不给卡就直接进下一波
    } else if (S.phase === 'play'){
      S.phase = 'win';
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
    txt(b.name, pad + 14, y + Math.round(ch * 0.38), Math.round(W * 0.04), C.ink, 'left', true);
    txt(b.desc, pad + 14, y + Math.round(ch * 0.7), Math.max(9, Math.round(W * 0.027)), C.muted, 'left');
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
var STAGE2 = {
  sprite: 64,      // 角色基准尺寸（以后接美术就换这个尺寸的贴图）
  pitch: 52,       // 同侧相邻站位间距（5 只铺到 x≈33–201，给交火区留出位置）
  reach: 70,       // 近战贴到这个距离就能打（≈ 两个身位，交战时不会互相叠住）
  groundPad: 150,  // 地面线距舞台底部的距离（下面留给战况/资源条）
  jitter: 18       // 前后错开的深度差：奇偶站位分成前后两列，5 只才不糊成一片
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
  if (typeof o.yo !== 'number') o.yo = (idx % 2 ? 0 : -STAGE2.jitter);   // 前后两列，避免完全重叠
}
function unitX(o){ return (o && typeof o.x === 'number') ? o.x : W / 2; }

/* 兼容旧调用（浮字 / 弹道锚点都走这两个） */
function stageXOf(u, isFoe){ return u ? unitX(u) : W / 2; }
function stageYOf(u, isFoe){
  var gy = groundLine() + (u ? (u.yo || 0) : 0);
  return gy - STAGE2.sprite * 0.45;
}
/* 伤害飘字的锚点：单位卡中心 / 敌方卡中心 */

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
  txt('波 ' + (R.wave + 1) + '/' + R.waveTotal + ' · 我 ' + allyCount + ' / 敌 ' + foeCount,
      x + w - 12, y + SZ.title + 6, SZ.title, C.muted, 'right', true);

  /* 地面线：双方都站在这条线上，中间是交火区 */
  var gy = groundLine();
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 10, gy + 2); ctx.lineTo(x + w - 10, gy + 2); ctx.stroke();
  drawFactoryBackdrop(x, y, w, h, gy, now);

  /* 我方空位的脚印：没有卡片，就用地面上的虚线椭圆提示"这儿能站人" */
  for (var e = 0; e < (CFG.slots || 5); e++){
    if (R.units[e]) continue;
    var ex = homeX(e, false);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(130,120,155,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(ex, gy + 1, 15, 5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /* 所有角色按前后深度排序后一起画：靠后的先画，靠前的压上去 */
  var list = [];
  for (var i = 0; i < R.units.length; i++){
    var u = R.units[i];
    if (!u) continue;
    ensurePos(u, i, false);
    list.push({ o: u, foe: false });
  }
  for (var j = 0; j < R.enemies.length; j++){
    var foe = R.enemies[j];
    if (!foe) continue;
    ensurePos(foe, j, true);
    list.push({ o: foe, foe: true });
  }
  list.sort(function(a, b){ return (a.o.yo || 0) - (b.o.yo || 0); });
  for (var k = 0; k < list.length; k++) drawUnitSprite(list[k].o, list[k].foe, now);

  drawShots(now);

  /* 排队条：改到舞台右下，横排，不再和敌方卡抢右边缘 */
  drawQueueRow(x + w - 12, y + h - SZ.stripH - 26);

  /* 底部：护甲 / 零件 / 大招 */
  var stripY = y + h - SZ.stripH - 18;
  var stripW = Math.round((w - 36 - SZ.ult) * 0.5);
  drawStrip(x + 10, stripY, stripW, '护甲', R.armor, R.armorMax, '#9fc6ff');
  drawStrip(x + 10 + stripW + 8, stripY, stripW, '零件', R.parts, R.partsMax, '#c7b6ff');
  drawUltButton(x + w - SZ.ult - 10, stripY - Math.round((SZ.ult - SZ.stripH) / 2), now);

  /* 战况面板：压住中段的空白，也给"刚刚发生了什么"一个交代 */
  drawBattleLog(x + 10, y + h - 92, w - 20, 1);   // 两排制：战况只留最新一行，别和中排抢空间

  /* 飘字 */
  for (var f = R.floats.length - 1; f >= 0; f--){
    var ft = R.floats[f];
    var age = now - ft.t0;
    if (age > ft.max){ R.floats.splice(f, 1); continue; }
    var p = age / ft.max;
    ctx.save();
    ctx.globalAlpha = 1 - p * p;
    txt(ft.text, ft.x, ft.y - 26 * p, ft.big ? SZ.float + 3 : SZ.float, ft.col, 'center', true);
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
      var ty = groundLine() - STAGE2.sprite - 18;
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

function drawStrip(x, y, w, label, val, max, col){
  var v = Math.round(val);
  txt(label + ' ' + v + '/' + max, x, y - 3, SZ.log, C.muted, 'left');
  rr(x, y, w, SZ.stripH, SZ.stripH / 2);
  ctx.fillStyle = C.panel2; ctx.fill();
  var ratio = clamp(val / Math.max(1, max), 0, 1);
  if (ratio > 0){
    rr(x, y, Math.max(SZ.stripH, w * ratio), SZ.stripH, SZ.stripH / 2);
    ctx.fillStyle = col; ctx.fill();
  }
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
  var ty = L.giftY + Math.round(L.giftH * 0.32);   /* 放在敌我两排之间的空档里 */
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
   有贴图就画贴图（NEAREST），没有就退回下面那套代码绘制的像素化渲染。 */
var UNIT_ART = (typeof window !== 'undefined' && window.UNIT_ART) || {};
var ART_IMG = {};

function unitArtKey(o){
  var line = (o.cls && o.cls !== 'none') ? o.cls : 'none';
  return line + '-' + (o.tier || 1);
}

function unitArtImg(key, isFoe){
  var k = isFoe ? (key + '-foe') : key;
  if (!UNIT_ART[k]) k = key;
  if (!UNIT_ART[k]) return null;
  var img = ART_IMG[k];
  if (!img){
    img = new Image();
    img.__ready = false;
    img.onload = function(){ img.__ready = true; };
    img.onerror = function(){ img.__ready = false; };
    img.src = UNIT_ART[k];
    ART_IMG[k] = img;
  }
  return img.__ready ? img : null;
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
function drawUnitSprite(o, isFoe, now){
  var s = STAGE2.sprite;
  var gy = groundLine() + (o.yo || 0);
  var x = unitX(o) + lungeDX(o, isFoe);
  var dead = !o.alive;

  /* 本体：优先用 Tessera 出的像素贴图（64×64，NEAREST）；
     没贴图（或还没加载完）就退回代码绘制的像素化矢量 —— 两条路视觉上都还是像素风。 */
  var art = unitArtImg(unitArtKey(o), isFoe);
  if (art) drawArtImage(art, x, gy, s, dead);
  else drawSpriteArt(o, isFoe, now, x, gy, s, dead);
  /* 纸箱鼠还没被破箱时，头上顶个纸箱（贴图统一后靠这几笔保住识别度） */
  if (isFoe && o.type === 'crate' && o.box > 0 && !dead) drawCrateTag(x, gy, s);

  /* 头顶：血条 + 出手/充能条（保持矢量清晰，不做像素化） */
  var bw = Math.max(28, Math.round(s * 0.8));
  var bx = x - bw / 2, by = gy - s * 0.98 - 12;
  bar(bx, by, bw, 3, o.hp / Math.max(1, o.hpMax), isFoe ? '#d96d55' : '#79c98a', 'rgba(0,0,0,.5)');
  if (isFoe){
    var ratio = CFG.realtime ? (o.timerMs / Math.max(1, o.chargeMs)) : (o.charge / Math.max(1, o.chargeMax));
    bar(bx, by + 4, bw, 2, ratio, ratio > 0.72 ? '#ff8a5c' : '#e8ac50', 'rgba(0,0,0,.5)');
  } else if (o.atkMs){
    bar(bx, by + 4, bw, 2, o.timerMs / Math.max(1, o.atkMs), 'rgba(255,255,255,.45)', 'rgba(0,0,0,.5)');
  } else if (o.need){
    bar(bx, by + 4, bw, 2, o.charge / o.need, o.empowered ? '#e8ac50' : '#c7b6ff', 'rgba(0,0,0,.5)');
  }

  /* 强化就绪：脚下一圈光 */
  if (!isFoe && o.empowered){
    ctx.save();
    ctx.strokeStyle = 'rgba(232,172,80,.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(x, gy + 1, s * 0.32, s * 0.1, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /* 名字：我方写在脚下、敌方写在头顶上方 —— 交战时两边不会叠字。
     后面跟职业标签（肉盾/近战/远程/魔法/增益），敌方也能一眼看出分工。
     名字底下一层半透明底，压住背景/飘字，小字号也读得清。 */
  var clsTag = CLASS_NAME[o.cls || o.line] ? ('·' + CLASS_NAME[o.cls || o.line]) : '';
  var label = dead ? '退场' : (o.name + clsTag);
  var lx = x, ly = isFoe ? (by - 8) : (gy + 13);
  var lw = Math.min(96, label.length * 7.2 + 8);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(20,16,28,.85)';
  rr(lx - lw / 2, ly - 8, lw, 11, 5);
  ctx.fill();
  ctx.restore();
  txt(label, lx, ly, 9,
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
    return { name: o.name, x: Math.round(unitX(o)), yo: o.yo || 0, range: o.range || '',
             windup: Math.round(o.windup || 0), hp: Math.round(o.hp), alive: !!o.alive };
  };
  return {
    ground: groundLine(), box: { y: L.giftY, h: L.giftH },
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

/* ============================================================
   商店层（M3）：金币 → 工种证 / 配件 / 编队
   ============================================================ */
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
function maxSameLine(){
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

function shopSave(){
  try {
    localStorage.setItem(SHOP_KEY, JSON.stringify({
      version: 2,
      coins: SHOP.coins, level: SHOP.level, best: SHOP.best,
      rats: SHOP.rats, squad: SHOP.squad
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
}

shopLoad();

function ratId(rat){ return VARIANT[(rat.line || 'none') + '-' + (rat.tier || 1)] || 'worker'; }

function ratLabel(rat){
  var id = ratId(rat);
  return (ROSTER[id] && ROSTER[id].name) || '工鼠';
}

function ratLineLabel(rat){
  var base = LINE_NAME[rat.line] || '白板';
  return base + ' · ' + (TIER_LABEL[rat.tier || 1] || '白板');
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
applyUnitDamage = function(u, dmg, pierce){
  if (u && u.defMul) dmg = Math.max(1, Math.round(dmg * u.defMul));
  return _shopApplyUnitDamage(u, dmg, pierce);
};

/* ---------- 5. 关卡递增：改为读关卡表（applyLevelCfg）的修饰符，别再按关数硬乘 ----------
   原来这里按 (1 + 0.18 × 关数) 放大，会和关卡表里的 hpMul 叠加两次；现在数值全部由
   levelCfgFor() 统一给出，这个包装只保留占位，方便以后加"某些关卡特殊敌人"的逻辑。 */


/* ---------- 6. 货架：三个固定类目（转职 / 属性 / 招募） ---------- */
var SHOP_SECTIONS = [
  { key: 'gear', label: '转职（工种证）' },
  { key: 'mod', label: '属性（配件）' },
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

  var modKeys = Object.keys(MODS);
  var m = modKeys[Math.floor(Math.random() * modKeys.length)];

  SHOP.offers = [
    { kind: 'gear', line: g.line, tier: g.tier, price: g.price, sold: false },
    { kind: 'mod', mod: m, price: MODS[m].price, sold: false },
    { kind: 'rat', price: 35, sold: false }
  ];
}

function offerTitle(o){
  if (o.kind === 'gear') return (LINE_NAME[o.line] || '') + (TIER_LABEL[o.tier] || '') + '证';
  if (o.kind === 'mod') return MODS[o.mod].name;
  return '新仓鼠（白板）';
}

function offerDesc(o){
  if (o.kind === 'gear'){
    var id = VARIANT[o.line + '-' + o.tier];
    var nm = (ROSTER[id] && ROSTER[id].name) || '';
    if (o.tier >= 3) return '升到四级前必须逐阶转（' + nm + '）';
    return '转职为 ' + nm;
  }
  if (o.kind === 'mod') return MODS[o.mod].desc;
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
  var scene = SHOP.codex ? drawCodex : drawShop;
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

function drawCodex(){
  HITS = [];
  var pad = L.pad;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  txt('图鉴 · 五职业 × 四阶', pad, 42, Math.round(W * 0.045), C.ink, 'left', true);
  txt('点任意处返回', W - pad, 42, Math.max(10, Math.round(W * 0.028)), C.muted, 'right');
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

function drawShop(){
  HITS = [];
  var pad = L.pad;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  /* 顶栏 */
  txt('第 ' + SHOP.level + ' 关 补给站', pad, Math.round(H * 0.072), Math.round(W * 0.043), C.ink, 'left', true);
  txt('金币 ' + SHOP.coins, W - pad, Math.round(H * 0.072), Math.round(W * 0.04), C.amber, 'right', true);
  txt('最高第 ' + SHOP.best + ' 关 · 本关收入 +' + SHOP.earned, pad, Math.round(H * 0.072) + 22,
      Math.max(10, Math.round(W * 0.031)), C.muted, 'left');

  /* 图鉴入口：五职业 × 四阶，看看每条线升到四级长什么样、拿什么武器 */
  var cbw = 54, cbh = 24;
  var cbx = W - pad - cbw, cby = Math.round(H * 0.072) + 8;
  rr(cbx, cby, cbw, cbh, 12);
  ctx.fillStyle = C.panel2; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232,172,80,.45)'; ctx.stroke();
  txt('图鉴', cbx + cbw / 2, cby + 16, Math.max(10, Math.round(W * 0.03)), C.amber, 'center', true);
  shopHit(cbx, cby, cbw, cbh, function(){ SHOP.codex = true; sfx('tap'); });

  /* 货架：三个固定类目，各占一格 */
  var cardX = pad, cardW = W - pad * 2, cardH = Math.round(H * 0.083), gap = Math.round(H * 0.012);
  var y = Math.round(H * 0.132);
  for (var i = 0; i < SHOP.offers.length; i++){
    var sec = SHOP_SECTIONS[i] || { label: '' };
    txt(sec.label, pad, y + i * (cardH + gap + 15) - 5,
        Math.max(10, Math.round(W * 0.029)), '#8f86a6', 'left', true);
    drawOfferCard(cardX, y + i * (cardH + gap + 15), cardW, cardH, SHOP.offers[i], i);
  }

  /* 我的仓鼠：3 列 × 2 行，最多 6 只全看得到（原来只画 4 只，第 5 只永远点不到） */
  var ratsY = y + 3 * (cardH + gap + 15) + Math.round(H * 0.012);
  var onCount = squadOnCount();
  txt('我的仓鼠 ' + SHOP.rats.length + ' 只 · 上场 ' + onCount + '/' + fieldCap() +
      '（点一下选中，再点一下上下场；同线最多 ' + maxSameLine() + ' 只）',
      pad, ratsY - 6, Math.max(9, Math.round(W * 0.025)), C.muted, 'left');
  var COLS = 3, MAXRATS = 6;
  var gx = 6;
  var slotW = Math.round((cardW - gx * (COLS - 1)) / COLS);
  var slotH = Math.round(H * 0.098);
  var gy = 6;
  for (var s = 0; s < SHOP.rats.length && s < MAXRATS; s++){
    var col = s % COLS, row = Math.floor(s / COLS);
    drawRatCard(cardX + col * (slotW + gx), ratsY + row * (slotH + gy), slotW, slotH, s);
  }
  var rows = Math.max(1, Math.ceil(Math.min(SHOP.rats.length, MAXRATS) / COLS));
  if (SHOP.rats.length < MAXRATS){
    var eCol = SHOP.rats.length % COLS, eRow = Math.floor(SHOP.rats.length / COLS);
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
  var b1w = Math.round(cardW * 0.42), b2w = cardW - b1w - 10;
  var bx1 = cardX, bx2 = cardX + b1w + 10;

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

  rr(bx2, by, b2w, btnH, btnH / 2);
  ctx.fillStyle = SHOP.advance === false ? C.panel2 : C.amber;
  ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = SHOP.advance === false ? C.amber : C.amber; ctx.stroke();
  txt(SHOP.advance === false ? '重打本关 ▶' : '下一关 ▶', bx2 + b2w / 2, by + btnH * 0.64,
      Math.round(W * 0.042), SHOP.advance === false ? C.amber : '#241d2e', 'center', true);
  shopHit(bx2, by, b2w, btnH, function(){ sfx('pick'); startNextLevel(); });
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

  var nameSize = Math.max(11, Math.round(W * 0.036));
  txt(offerTitle(o), x + 12, y + Math.round(h * 0.34), nameSize, o.sold ? '#5b5374' : C.ink, 'left', true);
  txt(offerDesc(o), x + 12, y + Math.round(h * 0.64), Math.max(9, Math.round(W * 0.027)),
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
    ['配件', rat.mod && MODS[rat.mod] ? MODS[rat.mod].name : '无']
  ];
  var colW = Math.round((w - 34) / 2);
  for (var i = 0; i < left.length; i++){
    var ly = y + 42 + i * 17;
    txt(left[i][0], x + 12, ly, fs, C.muted, 'left');
    txt(left[i][1], x + 12 + colW - 10, ly, fs, C.ink, 'right', true);
    txt(right[i][0], x + 22 + colW, ly, fs, C.muted, 'left');
    txt(right[i][1], x + w - 12, ly, fs, C.ink, 'right', true);
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
  drawHamsterArt(x + 8, y + Math.round((h - artS) / 2), artS, { line: rat.line, name: ratLabel(rat) });

  var tx = x + artS + 14;
  txt(ratLabel(rat), tx, y + Math.round(h * 0.3), Math.max(10, Math.round(W * 0.032)), C.ink, 'left', true);
  txt(ratLineLabel(rat), tx, y + Math.round(h * 0.52), Math.max(9, Math.round(W * 0.026)), C.muted, 'left');
  var modName = rat.mod && MODS[rat.mod] ? MODS[rat.mod].name : '无配件';
  txt('配件：' + modName, tx, y + Math.round(h * 0.74), Math.max(9, Math.round(W * 0.026)), '#8f86a6', 'left');
  txt(onSquad ? '上场中' : '待命', x + w - 10, y + Math.round(h * 0.3),
      Math.max(9, Math.round(W * 0.026)), onSquad ? '#79c98a' : '#5b5374', 'right', true);

  shopHit(x, y, w, h, function(){
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
    } else if (squadLineCount(rat.line || 'none') >= maxSameLine()){
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
  } else if (o.kind === 'mod'){
    rat.mod = o.mod;
  } else {
    if (SHOP.rats.length >= 6){ sfx('invalid'); return; }
    SHOP.rats.push({ line: 'none', tier: 1, mod: '' });
    // 买了白板鼠：编队有空位就直接补上，省得玩家以为没买到
    var newIdx = SHOP.rats.length - 1;
    if (squadOnCount() < squadSlots() && squadLineCount('none') < maxSameLine()){
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
    drawHamsterArt(x + 8, y0 + 6, 26, { line: rat.line, cls: rat.line, tier: rat.tier, name: ratLabel(rat) });
    drawWeapon(rat.line, rat.tier, x + 34, y0 + 26, 24, 1, 0, false);
    txt(ratLabel(rat), x + w / 2, y0 + 50, 8, C.ink, 'center', true);
    txt((TIER_LABEL[rat.tier || 1] || '白板') + (rat.mod && MODS[rat.mod] ? '·' + MODS[rat.mod].name : ''),
        x + w / 2, y0 + 59, 7, C.muted, 'center');
  }
}
/* 标题页显示最高关 */
var _shopDrawTitle = drawTitle;
drawTitle = function(){
  _shopDrawTitle.apply(null, arguments);
  drawTeamStrip();
  /* 原标题页那行写的是"五关订单"；关卡表改成 6 关一轮 + 无尽轮次之后这行就不准了，
     底图是纯色，直接盖一层底色再重写，比改原逻辑安全（game.orig.js 一行不动）。 */
  var bh = Math.round(Math.min(52, H * 0.07));
  var y = Math.round(H * 0.68) + bh + 34;
  var fs = Math.max(10, Math.round(W * 0.031));
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, y - fs, W, fs * 2);
  txt('6 关一轮 · 三选一强化 · 通关后无尽轮次', W / 2, y, fs, C.muted, 'center');
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

/* 像素贴图（构建时从 art/tessera/picks 注入，64×64） */
window.UNIT_ART = {
  "blade-2-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACN0lEQVR4nO3bz4eVURgH8O/7deQa1bpFiUZjXCoiNbrG0CKGMtvZJpLESKRhtIgSyZAxm/QXtEgxtEjJ5G5GxqVcw0T/QOmHNCZzo93zXN7jOPedGb7vx9087/n1bs55z3nu+xbI1Dve6pWVF53lIneMKscjxBHiCHEhdw4+unDJlK9+XLH1//8G5/qJcRM3R46VjhdbEwhxhDhCXMjtYGPjT2n53PgUBunxu+cmXnRrQCpCHCGOEFf453rqXtq3H/Scj7nr1oT6LJCIEEeIC1eaZ7L20rE5+fb2oolfv3+VdIPnzp7Pah9DiCPEEeJC69SEuTD960fSeX5p5qGJJ+dvmnji/lUT/3b1Y2Lt51z9Oh+QiBBHiAv79u4faId+TfC6659Ky0eHm0n9jZ1sla4J6CyXtifEEeIIceGne+5X7cbLp6XlsTmfKpbvIMQR4ghxIXcfsPa5a+KRI6PbOsdzEeIIcYS4MLUwa69cu2djXx7R6a6auLGngSrF1hz/P4XPFxDiCHGEuOD3xr2F2aR3erZ6Wyb+9v2riYcPHzXxwQOHSvvzOcVbY5Ol/cXyA+0PdT6gFCGOEBdyO/A5vL7zfjvvLPCgvWTbnx7sWYIQR4gjxBWp7+N78xcvJ+3Nt5vfV9Q5QYcQR4gLsQr+ewD/nF//sobdzJ4k+hHiCHGEuOAv9OUHIu8Ibf7dNPHMiyeoks8PDDWGTHznzTMT198MRRDiCHHFbv9WuOrxCXGEOO70Dey0f5b2o7e3MmE4AAAAAElFTkSuQmCC',
  "blade-2": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACcUlEQVR4nO3bP2hTQRwH8G++nK2FQsVAh6JZEgcdRKH+GVqQGnARRARBpARBtCDFujiIOtTqVFQoiI5SRBTtUAO12MFNBZWCUC2kS5TqYIKDS0VT599D7ny8F2v59rN93937vWS44+7ykkFyy4H2TArPaNrzCHGEOEJcJukYrN28YxrL09dNLk3NI01PT3ab3NN7yeT20qFY35EQR4gjxLmkBfjti7e9enEH0nTm3keTe3qT1SPEEeIIcZk/rK3jrg2WmznmQ3Ijs9FLa3uBOAhxhDhXGrxtLtwdG0g0J0THZKPx0+RPl+1aPmTT8OtE94cQ4ghxhDhXOmX3z/WvFZOf3B/1nsF9ry2Y3J7Nm0w6b/+Q0P1VHDE5NzIbaw4jxBHiCHEul21JtWBojC+Nz3jbW/uLseptPPc4NCd47yfEEeIIca5a++HtUCjsMblSeZXogQeu2XP8tsaSyVP9b5Ey77qAEEeII8S50DqgraXD2z43UzZ5W/Ggt//z9y/wPyHEEeIIca7QlTUXKos1kw8Xj8UqOP/olsm/NuTQTKE5J/o7RfS8gBBHiCPEuejauNCVNWOku7PTWyD/eb3Jix/s3iLfZ+eAxv7t3no7t+wyeeLo8Ui9PlsvcD5Qv2HPB6IIcYQ4QpxLWiB6hndiq93vY+JBrL1Aa8OO6rPlhyZPXh1CmghxhDhCnEtaIHoekHS//3LhDf7lO0SEOEIcIc6FOkxfuGJydui0yfVn4ybPYXUhxBHiCHGZv+jjPR8Y3bvb5H2Tdl2QtncDgybn1m02uWPsfPSWtXeEfAhxhLjMKvivcFOfT4gjxHGlP8BK+w2AkZGJk7G2TgAAAABJRU5ErkJggg==',
  "blade-3-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACaUlEQVR4nO2bvWsVQRTFzx7mPxA/UHyxsBCLECyEQJQUVmmMhYISC60MoogINlppoaAiNopFRBEtDX48tDJKMGghQVAbERM0oI3iH+AT7OYoM07mPVKc/NjmztyPbe7du3d3GlTS6R/qpPabN9NNN/3X+lMIcwhzCHNCbU5e3X042l/4+iXW/3MtnqMDw0l/tTWBMIcwhzAndNvh3OePkXx6+2iR/Znnk5F8ZXYKvewjCHMIcwhzQm1vr8/lhcKcV7RmaE3Q+Dt3jEXxJ799ivTvHDwVyZ2Js5E+YQ5hDmFOuHXxYZQTe5/eTxpozudyVsn1BWqv+hr/eGtj7EBqwKvZF5G8T+IR5hDmEOaEWgeDW4YiuS3yyOUTSf33H97G9scuxPoST/1fEv/KyhWrk/uEOYQ5hDlh/81z0UK7tTmS786/qwqgOX373o1I3rZ1OLk/tutA0v/oqg1IvQv8+Pk9aU+YQ5hDmBNy7/e5HJt5PZ18ziua09on9EnNUFT/utyf0r9pIF54+TgSCXMIcwhzQk5Bcz7H/MJckf61PUfihUL7HNrnLH8XEAhzCHOCLvzVF8h3gtxMr9P5ldxvGhbZP3n2KJIPJa3/ES/z/wBhDmEOYU6odaBzfP1nSHNY+wrtA1S/1xDmEOYQ5oRSg3Vr1idnfuPyvj4u9przrbV9yRqh8whF9Uv/GyTMIcwhzAnddqg1QWmVzgemHqCXEOYQ5hDmhFoHpTPAUnIzyeXzApUQ5hDmhJxC7tvhycGRpP35mfbi7+4//NeeISLMIcwhzGlKDXLnCXp9drjb/glzCHO41Dew1PwGh0XK3l2ppT4AAAAASUVORK5CYII=',
  "blade-3": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACbklEQVR4nO3bP2gUQRQG8G8/xk6CmMpGArELARvBQxAUIZWkUwRtBMFGQkCQiGJjcgiKRZpDIRoQRDDFYRqbCP7hiiCKR7CIQbEwhPNEwkosDGf9hmOGvVlN8d2vezcz710zmzezlwzpOpHxrOT8qfkMQhwhjhCXpe7JfL5uBn+s3jDx/pvvkeLN+RETH5lbQZnPBEIcIY4Q58pO+OLtlom/XjtYaH2tvmHiicUW/mUfQYgjxBHishJ6+07Kno/p0keY+lOVIVO/2vhiJj9f+2niseE9JibEEeIIcW6puW720N2ZO8EFzx7fDu75WO8fe0b467vkN/W3x66b8QOteyZ+OfcwWI8QR4gjxLnUBHsnF0ycT9rx3YPDwflbD5bt+vahYD0//4lxe//g2zVyNDhOiCPEEeLc8dF95oOTZy6b+OPyq6QCeXvNxI/Gr5j47IVz4fH6rWD+Y9uvTVz9ZM8Cfz5/CK4nxBHiCHFZl89Mrz1VGULovO336v7f+Ri/T/CfGbH5se+31Fw3sf/MI8QR4ghxLjbh+297zx+z2XhSaP63xZmk9TH+nu+/F/AQ4ghxLtYb3H+3Uejef6Bt3+f7NgdXCq2frk0gUfD3A4Q4QhwhzqUm8O/x83kE97Dfq/t9QAl7vhBCHCGOEOcKLzh8ysR5eyF4Xvf5e36gctrE1cbV4Hnf97TZSvrdICGOEEeIc2UnjN3pxfjPiNlp+77ft5r/SqpHiCPEEeJcaoKy7/B8/tmhi/7/C6QgxBHish7WmDvC5sVLwcmjtdkeSiTl758FiiDEEeKyHtZ0/kONIvX6fUAKQhx3+gvstL/BWqk6JK0XQAAAAABJRU5ErkJggg==',
  "blade-4-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACJ0lEQVR4nO3asWsUQRQG8G++nb9BTNAihRARQtIIErEL2BzYKIelhRGCUWzEBCuxsBHUImphJxwWIlypRZBAwEYJiEJA0cOg/0GsIti9V8wwznpXfPvjmje7O7vNezdvdgOcg7nTB0gIO1shddxfnzs/p/Z5cghxhDhCXPQDm7c2TLz364c94frZohzNHc+5feaciXe/frbz//39e00gxBHiCHHR5+hm5oLSnPY5XMrn/GBk41qEOEIcIS76Af+/P3zz0sQXMV7HZmbtgKsBXS9QiRBHiIu1E/j/+TtvXyXjtcWeiZumSZ6fu1/XC1QixBHiYtsTPrlw1cTLLx6Z+Mv33aK1vZ8PP0fJmlJaEwhxhDhCXPQ58tzlUM7J+VPJ48PVeyYePLxp4qf9ayaeOjRtYhsB04ePmPjdh20T94/OFtUEQhwhjhAXJ/0AlwcPkjWj7f0DjxBHiCPEhdp3d97dpT7Gaf/3ftV7BUIcIY4QF/2AX0uXvotbfz1otSb4+TzfS4z2vhXNT4gjxBHiou+Pff+cs3F+xcRNY8vKeuFav5fZL8j1EqXfIxDiCHGEuOAH2u4Navt7XxNy8/s9wq4XyCDEEeJC7oTSmuDX/nPHFzBOO5/eJ3uJ7r2AQ4gjxIXaCXI1Ytx7hLmc9whxhDhCXKjN+Ssn0t8HPP5o1+Ztu9+7lDx+Y/jMxN06wCHEEeJC6QWlvUHt9/z/+/6EOEIcJ/0Ak/YHMvy6Vwg1pAoAAAAASUVORK5CYII=',
  "blade-4": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACjklEQVR4nO2bT2gTQRTGv/0YENuigpVc1AoKHsQ/CF5Eonio2ENBCoJePIlRENOjUASxxZM2RdFi8WpBLIQKRetFFm9iDhEFD0WjKEYSwdAGKSF6flOZcdg0Pbz8bt+8N2/m8r3d2WEjrIB/4KQZueP2fF++j6T78VSHcgjlEMqJ7IFmsyE89+Ljooif2Lkpcnn0yp6UiE68Kyfa4OeRfULPxb+EzsSlRD2BUA6hHEI5xv+ctQnLtz0ciu35W4UfaCWEcgjlEMqJbE8/X/gpEu6OjAr9dPo22tkDbLaPFq2RzlkgEYRyCOWYpAVsj9setXVleLfQ9e51zvz/WC/R9wdCOYRyCOWYVhdcmu8Xurt/Xugnb34Lna/WgupV4+/OntI7/iGoJxDKIZRDKMf8wyNB5/3ey/ec8Xr5mtB7dw0K/fbhlJxwNOVeb7/UlTuXhJ5M9wmdiUvOnkAoh1AOoRzT7gUPG2nJs8MXhH5UyCeqP5DeKAdidz6hHEI5hHKiHdsOOJ/7y8sNZ4Fv5fdCz0zdRDs5VJp2xn13iYRyCOUQyjGfvhSd79LPFpaEzn+tCH186xah41xO6HQ2m2iDdr1aoyn0yRuTQleK14PqE8ohlEMox9jnY/v8fHBDj7PA7NgDobleerTr9JDQ9fIrZ72u1BGZ/3jGnW/VD72LJJRDKIdQjklaoOfcKWfc53lfvt0TfPn2N0IfhHII5RDKMSuH5HtBobYYdE/Q6u8BoT3kdd8ZoTPxVSujcy8gIJRDKMf4U8L+EbLP7+1m6Lzb8zaEcgjlEMqJwqdIz78cHHBmH5udw2pSzd13xjdnL1ojnfcAAaEcQjlR+JTQf4yS/ju8uusTyiGUw7XewFrzFzhHvT0BOBZrAAAAAElFTkSuQmCC',
  "care-2-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACcUlEQVR4nO3bzUtVQRgG8Oc8HJIwbhbRIrCoRKIwkiTT6vaF6SLoiwxc3VrYF7VrIWSLDNwX0ccm2ghRRi6CSIiyIqMiKbXg7vsnDAxa9U4w0zAHDJ77427eMzPvPZt3zszcc7NjPSfn8YfRZ/cyJJjfvNPkc2Vf3vxX+QlxhDhCXJ6aIFSTqf1dg+XD/vy/P/8+JxDiCHGEuPzRj6q5UDl6wdTQ/cc3kp7blaZWEzeuWpOSDt+q0ybe2rItKR8hjhBHiMtCz+nYtbU7PvTcTjU08cTEtb1AJEIcIS4Pdbh5dcTU9PkrfZmv5l8O3DLjh4bPImZO2L+j28R7IsfHIsQR4ghxeewAt+bHL1037V1OzcZya95Vbt9n4kH3/mrnAXEIcYS4PNTh7YdXJj4X6O/OCa5l36eSxheNEEeII8TloQ5zP+cK/cLP0x+97S0btiTld/cKoXUBIY4QR4jL3Avu+wJ7O7pMe2lJycRj46MmrltU5127p1q3usnbPvH+RdSZISGOEEeIy90L7m+FvZN2mlixfKWJ6xfXm7izreytyViV4/1J4/s3bveuCwhxhDhCXJb6Ds/lXYdMPFv9auLu3QdNfPqB3e+fam4zcXtrp73BzP/T5NrG9d72h09HTHx3dtLEhDhCHCEudy+4a+XQnHDt9ZiJ75y4GHUDS0sN3vapmU8mPtLTiyIR4ghxhLg81CH0zk3qu78hRde8ixBHiCPEZUUndOeE2HVB0dy9R+1M0EGII8RlRdf8mU0d3v63Z94lfd/wgT5v+8Bzu/+v/WcogBBHiMtTE/x1fuCcu4f6xyo6PyGOEMeFvoGF9guuUqXf3EA/QQAAAABJRU5ErkJggg==',
  "care-2": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACxklEQVR4nO2bTWhTQRDH/zt5tSJIrfagtaRERZReLBRRBD00IIJKFHKx4MHPgAUFlQpW60fqB36ACEVRe6uXKgSFolDx41QkNxGLWLQFi4dKEYVU2yRenQnsY30PK8z73f47s/uWF2ayO7vPJFNHy/iDwdw1g0DMZeNVMvVfjU9QDkE5BOV4wYfgMXm4qdbqfePtpE8M2xnrXGW1x7PDZZecQFAOQTkE5RgZw+k9l5hDf+8RawzFqIb1b189j9nTixYwHd9Y/fezBXD/yVKmD25dy3TtmYuiR5QDrBCUQ1COkQ0xM5/FdLH83XHtznOK3/92UOLZYdES7QWcICiHoBxPNhTL00xfzo+ymO5oaTS2mC+VfjBrVYzvDT6eXG6dUMO5fKD+rhCUQ1AOQTmeawe5TvhZeGONWVf8+td35pgeQ4rpqB7gCEE5BOV4fg7J3VuY7hDrBInMCZJvt5769N+MfwlBOQTlEJTj+TlMFwqhPvD5g36rPZUJlgNk/SHRPWKtbxCUQ1AOQTlGNsj7AgcO7WP2usW8zn/h1FWmJxauZ/pOWwlh0ryBnwNIxrN8b5DoHmE6ygECgnIIyjGVTbzGN5RYwqwNK2uYnvrC1wmT188zvb8v2DvO97Q4+csc8P4dn1/y4SjTBOUQlENQjvHLAVfq+Xn8h1+87n961w6mXw28ZnrF7RNM78z0ML2mNcPHS/PfpOlrlWX6wJztzVb7iza+t4hygICgHIJyvMomfr5+fPyz9V7f3Zt9TA8N3nOaQHXjMtHyiamB3COmU71dCBOCcgjKISjH83ex37kplhHo7q8fYce8hKAcgnIIyjFhDyjvD7iuC8JmXXIv01FNUEBQDkE5JuyYf7Ztk9W/9fHLQM+b6Dpmtded5ecUfnedCcohKIegHBP2gDInSNy/P/D7dnhG2Geib4ddICiHZnsCs81vGCWxzujL3ZEAAAAASUVORK5CYII=',
  "care-3-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACX0lEQVR4nO3az0uUQRgH8O/73YG9RnTJIEMzTEO8BBFbQiB1KCnIDnUIIrx40epqhzoFVnYKJL0FFUGRIeyxEOrQJaNktTaNLYP+CINOzRPMNLyv7uG7H/byvDPzzF7m5/tmSLTRV9kIlWeLC1lqzs3Mb/PZ9oQ4QhwhzqWOofvDo+H6f37/P2Zt/vPtvbny23zVq3f99rfHvXJCHCGOEOfyJvj+s+HFE0dPB8esZetjbQVF+lB778XHTTkhjhBHiMtSG9h1dnjXPq+8u7MHRbr5+jlS1v07py559a/MzQbbE+IIcYQ4lzeBHfN2zJ7dudeL93cdCOZbri958UjPIb/C4kJ4Tkg8ixDiCHGEOBerYNfZf/buEU/XP3vxRGQOeNyoIXSen/70NjjGY/uE1j7AIMQR4lzeBJWDA15cNXH9mz8HtEXy2TvHDlOeet8wPzbp15+61roT/BshjhDn7AO7bo72Vbzy7YkddOz2zwJPXj4M1j938kLSnDPd1u7FI4/uefFqox7MR4gjxBHi3FZ3OFN7FyyvRuYAy4752P2ARYgjxBHisui6v21HcB3ebEsrH7147MWDQr9JIsQR4ghxLlYhdczb83/sbBBrXy6Xk/qP3QFahDhCHCHOFZ3wy5o/hkulUtIcsNr4mqv/6wNnkPKukBBHiCPEOfuga093roSDR07kan/s8GDwLBBz49UzL27tAyIIcYS4LLaXnhq6jGYq+vxvEeIIcYQ4F6uw/utHsPzWm/ki/w8udvYH49TvAGMIcYQ4QpyzD1LfrRW9Lm91f4Q4Qhyb/Qea7TdFwMEDfO1jVwAAAABJRU5ErkJggg==',
  "care-3": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACU0lEQVR4nO2bPWhUQRSFz5w8ESWIlcEfokEF8SdBEavASrALgnHBmMrCxiqQygQEm4BFQCEkIaUBCy2MVbSR6IIoCCoGJIgLQaOloLIIElDr+5QZLvuSV5z9urP3Z15z5859bzbADf/E7b+DP+d65s/ns/GEOIQ4hDjBW0ONuQdR7/ZLA86atflne89Hva88m0/kt/nWGq+NdVP7CesNcQhxCHGyZhN8f/XI6E/Xuo3uHF+K9vW8/8OnKJSp5etROyEOIQ4hTvCH2D470XvEWAdPt6FIOseXXH1/bHHFWG/0dUXjCXEIcQhxgj/E1tx/+r7R584OGT3Z8y6afWT5qNEdHXaPmZkZc80WqVmEEIcQhxAnNFvz6b5t8can5nnv+4bWOSAHIQ4hTtZsgp2jt41eG7X2X/c/uvI15uJ27/uGL99+GL17+zbjT4hDiEOIk6X65vMhexb3srm61+ha/2TUv7Iw7Npzfnbb+X/rharRd+pfo/kIcQhxCHGyjV7wTM3W8PCOXUZXEN8D8uRrPn/Wv3qyK3pOIMQhxCHECam+v2d/W7QPrzdvFmpGnxocKfROEiEOIQ4hTpZy8NZ8av7Pzwap+MPY51q/9V3ACSEOIU5WdMKbq++NHvi8avSh6uVo/MqLx02tf3HR3jO82zff+i4QgxCHECfk++bLe7eMw/H+CsrEPwu07ge4IMQhxAn//hTfEzaaouf/PIQ4hDiEOFnKYcuTetR+bHa6yOdBvedgVB94+8F1DzAFIQ4hDiFOKP+/wuWuR4hDiMOyH6Bs/gJqGZ34gyYg2QAAAABJRU5ErkJggg==',
  "care-4-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACCklEQVR4nO3bvWsUQRgG8GceJn9EQK8QhUQ0WAhGEi7BKwQL9UqDEpCgpLMLKaxSiF3AIk06C7GzUQgixGCwSAwXNVzENIKNIkHUNncBu5lih5fZuwSe/XHNOx/vTDOzO7t7Dpm6I+Pdonr38Z3LHaOX4xHiCHGEOJ+7Bm/Vhovb//+VJx7vVO1M4XipPYEQR4gjxPncBPVLV4J45e3LIH5Yv4kyuW9fg/jE4MmsfIQ4QhwhzuUmiO8Lyl7zKQtrL4K4OgsYEeIIcd563s5do7HUnmHtX50FjAhxhDgXr/l7Z0eDBlM3pns6gfbe58L64dPnCuvfrK8EcWPsahBPPpotvE8gxBHiCHE+Luh0DoL4027LlPD80AVT+5+/fmTtAfGatyLEEeIIcT4uGPADfZ3AxGij8Lq9GtWnpK77MUIcIY4Q5+KzwJPm/ayE2+2tIP777w/66fn3L0Fc7QEJhDhCnE+tYavbzbum9ktPFwvrZ+88MOVb3PlgekZIiCPEEeJ8XLC8u2FKsDq/ZHrGl7puW/OlnhekEOIIcYQ4b32fnnp3uP97P2tC65tr6CdCHCGOEOfLTjh2sW7r8PpZXv9MhDhCHCHO5yZoRedvc//rM2FBZj4rQhwhjhDnchPEZ4O5y9eC+sfvX6FMcf5YPF71XiCBEEeIc9YO1m+Jq/8OH3OEOB71BI7aIa5Rkqmps4TDAAAAAElFTkSuQmCC',
  "care-4": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACOUlEQVR4nO3bMWgUQRQG4H//zKVQQsBCFKJ4oAYbSRHBCHY2YmMlShAOi7SKkCbFFYceYixyhaAickFBQQQbrSwEkRSecAop5IqApNFCsFARL2r9pphhmNUE/v26t/PmzTb72Jm9K5BphNv/hMY3fn8rctf4l+sR4ghxhLgi9xlcPLEzmD//4jPK5K93fPqYiY9ee5rUEwhxhDhCnMstMDe7ZOKrty6aeG3hAMr0/OV+Ex+aPONl2B4QQ4gjxBHiitwC/ntB2c98TL09MHG1F0hEiCPEudT9du4z6ov1jNT59fbA3H+1F4ggxBHinP/Mr86cNgkHXy1nLfCrFR7/fv9ZeP7wVHB8vTnt5X81cc2NB3sCIY4QR4hz/oWx4TsTf+l2kwruaDSS8jd6H8IJ58M9YKLVQw5CHCGOEOf8C6Oj4XP+so11Lpv40q59Jl7yxmNqbtzE1V4gghBHiCv8vcCnu52sgj9v2+8EJydn8T+tPrhi4qoHRBDiCHGF3wM+HqlnFdy90k/Kn2osBsf73fmker3HN008c27BxNV5gIcQR4hz/oW9b9aSCvhncLEzPt/IYN3Eb193kupti5wXxBDiCHGEOJf6PT327fBGbU/SDQx/2B7QevTeJkTqNZGHEEeII8S5sgs2zx5Oyn9yPW9+LkIcIY4QV6RO8N8DVh62sZVV5wERhDhCXJFbwO8J/bkLZnzqzj2Uya/v89ervgtEEOIIcUXqhNTfElf/Hd7iCHHc7BvYbH8BYAOcJkzlfcEAAAAASUVORK5CYII=',
  "hex-2-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACO0lEQVR4nO3bv0uVURgH8O/5cmyLmoMIE+3WRYOcLqg4OLkUROEUREE/IGhorMnVQXAoiLaGIAInp4YQQWgRrVQwhZr6B2zoBgZNPY/0Phzea0rf++EuD+c5z/suzznnvfe9Cf+ZvaGRvT/jtLaUqvIJcYQ4Qlz+1z1XWs/z9X3+/cERW+/35+/zCXGEOEJcLp3ge+7J2JXKnivl67XbPzpa3yPEEeIIcblugd3vuyZ+PHrZxCmVHQumF+dN/ODiWGW+3/ebA4N23OX7NYQQR4gjxOXSCfvO4q6n/D5eys+fc2uC7/lzZ8+buDkwZOITx0/aC3xYMiEhjhBHiMudfhbw+7gXrRF+/rVT/SZ+7Xr45fAo6iDEEeIIcbluz3sLD2dMPDn7yMStS3Yf38etATev37Hjrt7O188m7uk5ZuL1rY+VlyPEEeIIcSnq+anTDTPe39so62ln+8tW5XjfGbvvR/wa478/mFtdNHH3dwGHEEeIy6UTSns+6nHfw/4c4fl8z/d8hBBHiCPEpYPe9w9atCZ43XOAQ4gjxOUoIer5F6+emni8NWHi9s+2iRt9F4qeFdY2V0z8fOM9OokQR4gjxOW6BW5N3atcE7xoDXi3/NbEb75to857g913hQOEOEJcip4Fbly9jaN89q/7bjIhjhBHiMvROz+zO5s4SiY7XI8QR4gjxKUowZ8T7jZblfnPPi3XuqGofnS90nMBIY4QR4jLUUJ0TojyS5X+J6j7LFATIY6HfQOH7ReoHqfMTN73/QAAAABJRU5ErkJggg==',
  "hex-2": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACa0lEQVR4nO3bT0hUURQG8O9+PGqiwv5QCCFRLSrIjZt2E4NRFFG0KkLJTQt3BS0iXE7iQigIKjCiqE1EyIQQA5rYqn2JDFGMBNFABhVTQohtOze4l8sbM/z87T7eeWeei3PvfTjjsMI4rFv8My/ipwvVE+IIcYQ4969nLrWfz+/v1384utfUd1RrwfsJcYQ4QlyWeoM/c7MDduYejn421wem55L6+/3aGmtM3jTyOrhGpCLEEeIIcVneBs16p8l93etN7j39KqnfnUrD5OLBHcF6f9/f3N9ur3v1HdWaWUMIcYQ4QpzL3yB8Lshr17V3Js8e2WNy1rfP5O1nHpn8a7rH5EJnxWRCHCGOEJe1eua7ht+b3PTur13eHey/s2zf38ul9uD7/fywXQNSEeIIcYQ41+p9fsulpyZv3HrA5O9zb4L3x+r961/K9lyw4dwhk7/efGHytut1kwlxhDhCXBab+dtFuw/HZt7nz/B8ZTKpPnbdXxOe1wsmH7trZ371/wIeQhwhLku9ITbzMYVTJZOv7rf79qB33efPvO/e1Mek5yHEEeIIcVls3z9ebFvSBxicmUqqj50DUhHiCHGEuCzvvj90os/kixfOm+y+LZi8tvdwsJ//rjBRvWXy2cczSEFn/8QF79sFhDhCHCEuy9vgytj94JrwV31kDbgx8sDkRvNHsN5/v3/yFqvfFU5BiCPEudi7QM/oOP4n/tk/73eTCXGEOEJc5s9Q/8tPZk3oGh/DSkaII8QR4ly8wJ4TJk92B+tLzyZyPVCsf+zzUs8FhDhCHCHOLfXv+lrdv9WfR4gjxHG5H2C5/QaOh6nl42x0NQAAAABJRU5ErkJggg==',
  "hex-3-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACYElEQVR4nO2bsWtUQRDGv/exJ6ithgQkpAgkQXNYKCKIhZBGUYNgcYXBwkpQJCJqoYUKKmlEWwmiRQpBogGbAwsRRLhCE2MuQVFEQfwnIlhl5sJbl70kwnc/XvPtzs6+ZmZnd98rEGG5emB5pZ45d9f0H31wuXR8MfumiM1RNl+qPz8+Zk+IQ4hDiBNiMfTs7C3TfyIS89cOjlp/f59/58r+w0ZXKpuS/NV6h0rtfU4gxCHEIcQpYut8Y+6d0f19A0afenTb6NGuPqOHB3cnvdBc873R07+/ISXmh/p3Gb3w+aPRU98XjCbEIcQhxAm+Yelr0+g9w/uSav/UmI+Oj+QAH9O1SL+HEIcQhxAn+Iafv34Y3bWtO6l2v/N62uiLe0eM3rJ5q9E3nX3U/9uXpfaxmPcQ4hDiEOIEvz9u2W836lkTVELF6B09vVn+bhw6afT1V09L9wY+J3TOAxyEOIQ4Re45ff3S/az9fu7eYWTifGn/k9NXjR4bP9I5E1wJIQ4hTljvCcdnJo2uD6blkKnnj422O41V6gB3Zjnm7AlxCHEIcUJs3ffraPf2ntKYrB33UZZXN3j/k0sNtBNCHEIcQpwQM5hf/FB6FwgX0z5mc2nJKRPlOaBzJpgIIQ4hTogZNL98SnIYqwNS6wbPvWNnjL7w4iFyIMQhxCHECes9YWrMrzWEOIQ4hDjBN7TcFVbLv82dX5w1eudAtX1vt4r/3HXfQ4hDiEOIU+TeDcZq9VzaHfOd7wMchDiEOEW7c8D/TicHOAhxCHGK1AG5//au9Xydf4cTIcThRr/ARvMHBzO0MRRea74AAAAASUVORK5CYII=',
  "hex-3": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAC60lEQVR4nO2bTUhUURTHzzs+/CieQ6iZHwTSmLkwsc0YRK3EIkKiRe0iqLHARYm6KajNhEwQEYXZsiBsJUYENUkhfTw3Sc2mTIlACiu1aaBUmqat/7u4t8uMuTjvt/u9+7k55565b55DBgocL7vSJ9KT0N7ibdWOz2TTjmkN3Xq286njTf2ZhMMkHCbhuKYY8mdnoL3FqwU/UF0CfvVYNXhdbFob0yrzxxvBU5XLVvNdaisH702QNicwCYdJOEzCcU3n/P3bz8EHZjAnDEWwDhgY/Q7+4ewWqw31j34BTwyXkU3Mt7dtU3q81eYEJuEwCYdJOI6aA/ZNTEOHi+GMVe1vG/Mm6mK4H5Vw6QbwzkgBePLjT/Bbk+hMwmESDpNwXPVBZvQbuF9Ro50g2d0AXhd7B95/vhP88O/H4EfvYt0wNjWnnb/pMs4/9WMBfHAccwJRkeJBDgCYhMMkHFf9ffyoJwJ1waab63JaYH/6KXj57r3gY7Hr4JlsWjvfm/gu8O19z7R1QG8Cc1pwH6DAJBwm4TimDg2hzVndubv0K2m1YOrGQ/DQyXbKhaKSJvD62nrwbv8JeLQmFNwJroRJOEzCcU0dvKJFq3PaxMYzPeBLljng4Glf2x5txBx1qhbfY6gwCYdJOEzCcdUH6h1hdOI9tPtlC9qYHL7Sql3Qtm5Q538weILyCZNwmITDJBzHlAPUO7kL9z6B30m+sDqnbVFzilr776nB+4rFPx74+OdZ8OA+QIFJOEzCcUw5oK8V38/H/bm8nuumukHl1cgI+M4j58AjVZXgQQ4wwCQcJuG4/3tB25hfbZiEwyQcJuG46gO1Vo77+L8607m8o6Mjf7v7h3NfZXk5pDzB3wIqTMJhEg6TcFzbAYfCnjYmXw7lvind/CYKC1NW/ZmEwyQcJuG4tgOq1heDdzUX5xSzJrqaK7Tt115/BZ8vKFV6BHWAFibhMAnHsR2Q67e9q71e8O2wJUzC4bXewFrzF20X5YxJRZyIAAAAAElFTkSuQmCC',
  "hex-4-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACVklEQVR4nO2bP2tUQRTFzztOEkz8ABqiYDAxy5plDUlAIlpZBmwEG0tbmy0UwcpGizS2dsYujWAjpBNBjAhhRaORmCLgB1CisrJEsPLexRmGt3HFsz+2OTN37p3m3vn3tsB/xl7t7N7vumg+K2L2hDiEOIQ4odc5WNaf72/MXbDjf/3+PJ4QhxCHECeUzWFvf7UyH83BXK6M16L+fM6frs4a3fDzdeMJcQhxCHGCz+GbC4tZ66jn/saa0bfOXSw1weWnj6L9k8enjB47cszo4YMj0ZpAiEOIQ4gTOtbRiVNGN1rfs9b1S6MTRtsMLb8PWP7YzBr/9dtutJ8QhxCHECf4Br9uLsyetwYvV6MOp05Ujb7t1vHUviBp72rA5va7qPYsufkT4hDiEOIE3/Bl97PR7XY76sDn6Hz9jDVwOR0O2JAz03NR+1S8pYS9p38n6CDEIcQp/H1ALo+v3c2yb26sG12r1MuEx+K969H+/ttgAkIcQpyQOs+vfPpg9OWj9oRf33xtdHVyOhqwbM6/cfEeuPl6+m+DCQhxCHFCx3u7u/PrqAk79rx9x73F+Ry98eRhqQn6vb+/L0jVrBSEOIQ4hDiFb8g9GyTvAxzbO1tGDw0MGT16eMzotfXnRo8MH8qqMf2zQAJCHEKc4BtS3+F5fE56BgcGjT45Xonat360ojXF7zM8ud8lEuIQ4hDihJRBbk1I5fS/BiEOIQ4hTijr4P3WW/xNXjVfdNUfIQ4hDiFOkTug7FviftM/C2RCiEOIE/Y7QLf/N9ht/4Q4hDjs9QR6zU95xba852fbLQAAAABJRU5ErkJggg==',
  "hex-4": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACmUlEQVR4nO2bP2hUQRDGv/fdOwwmJhDCiUhEQVGxiIVaBVSCjVoEtZA7YmHlH9TuCpEUFkFsQhTUysYkiqKIJCKIhWiT1EI4FASDnLnE4tRIJOTO1hlhl+Wdnjjv1307M7sLx8y+nfcuwn9Ghq31X/VKbTFy+RPGIYxDGCdqdg4mnU/bK4VuEZ8bm4UrnjAOYRzCOHHSHM5mOoX/6LGNwp5/UBL2UK4dXi/0+YmPzpxvK+4UuqLmy43NinjCOIRxCOPEOufnLmwQDmtHPjhrQq3+Q/iPvPoi9PuLWxJt8Pjtb057y4CsOdkdo0K3D58SuoLXQhPGIYxDGCf+7Rw92SN0ZaHuPEc1h7auNHJ/KOySv9HURFh8reyuIYRxCOMQxok+D2wTOd0+3OsMaMndddr1ub9p6K3TrvH5a7uuYT50f4AwDmEcwjixHlh+1ykH6jPOCXSOdp27IR2GDgjZUc0Lnb3U6/T3rZdTNcFH2hNUEMYhjBPpfkAoX8vPg/yvvmgRuti3lGR5rFnnrhnpu0EPhHEI40S6BlzemxMOk6WM0Cc2y/v+7sIRobf3H8WfZObxQ6Gf3Xvk9B98Kd8MpM8BCsI4hHEiPeCrCTqnpm/Kvrvm7J25RBu8v++Nsx/gq1lTn8pCpzVAQRiHME7kqwH5DvnsPl5dCusHKCan24Q+uKooN9QzKPTC9TNCz3f3Cb3n9C3neuldwANhHMI4sS9nxqtw9gt0TnYpe7Z1tdD9+2vK44pQy4vfnTVlXt0FNKHfJRLGIYxDGCf2Ofi+zfWhc/pfgzAOYRzCOHHSCUpPn+Bv4usBhkIYhzAOYZwoNMDXL9Do/kEoofOnd4FACOMQxolCA0LvAo3+32Cj5yeMQxiHzd5As/kJJEjWHHTFR9QAAAAASUVORK5CYII=',
  "none-1-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACGElEQVR4nO3av0tWURgH8O/9ehyqOUmEfk01JFKTotHs8rr0JwhJS0NL0DsluBgUDfo3iEMtQUhoZjS4hEYK2Q+jMGpv0MGg7XmEe3q4V1/hez+8y/Oec57nLOe85577Fgja7x/ej/Qv1laKaI2jrEeII8QR4lJ0Dc7cvG3at79/MfHmpw9uPEJr2HvcGjfx4tsFE1+5NGDr/fv8/55AiCPEEeJSdEBXlx2SUnfpmmy7OGrdrfnk6q9vvquUnxBHiCPEFdEB/lzQvj6Go7Tx8b2J53e2TNw8CwQR4ghxqWqCB8tPTbx0b8bEL9+8qDXfAW4PiCLEEeIIcSn6u//8zrRpH31018Q3piZM/Mf1z3J7QC5f28+3uQ+IIcQR4oromt/+Ye8AvXN9F0rb/Z7h83vRej5/cyeYQYgjxKXogNwar9th1yPEEeIIcUWuQ+5c0Gn+vuHhqn2P0JwDMghxhLgUvfcfdP1//t4pLXDmdG9oQtF8J0+cMvFYz/nS/yf4PYEQR4gjxKWqCT5/26p1D4jmG7w6bOK9vV074NfX0nyEOEIcIS7lOhxYU87QtZE651N7vhxCHCGOEJdyHXYze0Cnray+qjSeEEeII8Ql/4V/Xvbv22cvXsZxcrbPPv/fmnti4uZOMIMQR4grogP8neH9kZZpn3z9DIcpV6/5r3AQIY4Ql6omqLoGo/y5pCpCHCGOnZ5Ap/0F1UWdYV7PT/YAAAAASUVORK5CYII=',
  "none-1": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACGklEQVR4nO3bz0tUURQH8O/99qKF4AOljaEwqzYtRPwDWiZICC0i6E9o4yICTV0YQgtp46aNivRrE5S0sJ2BghAMEe0HLIOQEivQ8Me4PnfxLod5zQjf99kd77nnvs09431zJ8DpAvOmJ//kdD9412jneoQ4QhwhLvPuwf2lFTO+/XnWxG8+/DDxVB2uPRzbeT5i4sX5TRPfvdFr4tpco+npCYQ4QhwhLnh7wJ9Xy2Z8b+O9iU+6t1CmZ2s/TXwxXDHxUXPHxFP13/Z5qh5QjBBHiAveCXFPaEzU0E4v1mwPmKxvmLg6CzgR4ghxoezz+dGx/dz+Nj3sql+ba7jqxflVD3AixBHigvt9wG7djOeXhwrnx/kp3nq/ntxqqScQ4ghxhLjg3fN496W44ug11x5P9gjnenH9qgckEOIIcZl7RmKPp1zty9u6XgohjhBHiAuphOT/BR3WeGjPAoNPq7OACyGOEJe1+t7/36f1wvFLg9ddD+Stl9vrAZgd6i68nxCfDQhxhDhCXNZqgcO3H0vtAd56PeOvTTx2cLvwvkCMEEeII8RlqYS/BzalJxrPZ+6X+kBl10shxBHiCHFZKuH76bGJB3C+HD4atX9gl2s+IY4QR4gLqYT4/cDX1Qc4z/pvPjZx9d1gAiGOEBe8E+KesH3vjhkfWHiJ/ym1XnVP0IkQR4gLZd8VbvW3wu1enxBHiGOnH6DTzgCeDKwzTMtquQAAAABJRU5ErkJggg==',
  "shot-2-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACL0lEQVR4nO3bPWtUQRQG4Hdf5h8IUSKiEoRgQPxoDIT8gFQRDDYBO41IJEWaFFvZWiyIrAs2ARtRMEQIWERUDBHE+IEfiBoTvwL+AFNEiGB3jjDDODcb4d2HbQ535twp9szO3LlbQ6HNQwObseu1l49q/3N+QhwhjhAXSmuyOXLeXH/weN62//P5d2cOHjfxkb5j0fy5cwIhjhBHiAtVJ9y9a4+J6/t7i/LtdPGLN0uoEiGOEEeIC7kd/O+s/x2uDw5jK119vRgdTy5CHCGOEBdK9wK+5i8+nDHx/ammiecX7kbzp/rX/Xg6e4EyhDhCXC235ucmLkXbDzUmo9fb3T+1TiDEEeIIcaHqhKkaXf32qah/1QhxhDhCXGj3Dd8tvzXx8uoHE4+NXmjreAhxhDhCXMh+BtiYNHuD1qm8mm08vWfi5kl7tvhl7XNWvq+u/VBWb3S+AYQ4QlwoTeBr0D/TSzl360r0+uUTZ03cs/dA9P65CHGEOEJcKE3QtcOf4MeNdNsavvn9fbT9+O1WdE7oPzpg4jkX+3WLX9cQ4ghxhLhQei4wnniO72382shqf7rnsImn3ZxQ+gyREEeII8SF3A437ly3satRb/rj86Ka3+pzA0IcIY4QF0rfC0wZ7tqXNaDUnNFaGzTx+vpPE0/MXjNx5/2ABEIcIS7k7gXG+vqz3uWd+bGCKj179aTSfIQ4QhwhLlS9DvirvZtDiv9LnHn/FEIcIY7bPYDt9htw+KyTTqxXTgAAAABJRU5ErkJggg==',
  "shot-2": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACWElEQVR4nO3bT4hNURwH8O/9dpQ/r4yGZoHZTCIsLIRSQikyzSwoCwuSwsKfQpqSBcNIWdjY+JPR2IgFhiwwmpUy9NKMKaXRi6QGGzI0Zqx/Z3Gu65zeU9/32X3fOed3712c++49994M8SZz2rP/uT4hjhBHiMti5+S37jumsefKIZP39o8gxqMtC01e1XbO5NKO9qhjIsQR4ghxLnXB1UtmmlxZsyxp/YHbl5LWI8QR4ghxWYIa5rqgcjztnPc1d5b9n+r3AjEIcYQ4l3rO+3N0YmLc5PcnlgeL542vwI5v7iz76wX1e4EiCHGEuKzw/f/nt8HOpcaWYHsNxgePkRBHiCPEudQF8+YoegfjxidGiCPEEeJctTf46uGAyR/6r5u8qfVJVfeHEEeII8S5v+hjrqVLjS3m3uD545uFNnjgjT0HnO8+a/Jw+UWhek19ZxCDEEeII8S52AL+HDx1/2Ow/9DwD5N7jr4M9u/af9rkqe3rTP7ShyiEOEIcIS77hzHmOmD06mXTuOHYkeDgrUtnmXxr8Guw/4KG6SZf7DgZPCcUXSMkxBHiCHEu9rlA3jq+b+NYg8m/5iwyeej1M5MXb95n8uxdu5OuIRLiCHGEOFd0wJ7D9n9/+86OYP8b17qC7f6cz6uX+rkBIY4QR4jLUn/Ds35ek8kr508LFnswNtfk8Z+/g+cIfw1yctSuP6zYdtDfRP39gBBCHCHOFZ3zT9tag53X3u01ecYUe064N/LJG/EORXy/YJ8lxiLEEeIIcVkVvuWNepc3wfaDCHGEONZ6B2rtDxeOkJ40J6szAAAAAElFTkSuQmCC',
  "shot-3-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACLUlEQVR4nO3bP2tUQRQF8PMO4zeQuLiKChYGMYhdIPED2JgmFnY2QTCKYOy0SmGhhahgsLGzsEoR0qRTiZWNhdiIJhgLa/FfCCvYzQnMZZzIBk5+bDNv7rszW9xhZ97bDo0GYxODUn/39lW3m/MT5ghzhLnUWpOPp69k/a/fvMzj/37+3e2zU1n74IF+MX/tmkCYI8wR5lJrgvWNtaz949fPYg3Xev/hXXENaEWYI8wR5rrW394a31rzkfkXi1XzURpPmCPMEeaS1szUyNEsYPHrp6yt8Ss3H2T983evoWVN0BpXmi/aa+j3GYzl8YQ5whxhLumFkf29rK0VrGvC5ubv4gDjZyaqJrQcxI/rBVkztOb1+0DmT5gjzBHmuui3s9bUzMXZpgHXNj4W+4/0jzXlf/LsUXHNUoQ5whxhrtMLtXuD5ev3qgY8d3+u6f4oXzTfvfMAQZgjzKXWBOtf8ucCl58/LMZvq1Gp4Ui0ZkQ1rwhzhDnCXBcF1O4VamnNRvlOnTjd9NxAEeYIc4S5VHvDwoWrWXvy+7esfWPpafH+qMZ1TdB3kKLzg4Xe4ap3iAhzhDnCXGpNMHr8ZN3+Xs7sNF7P9PatrmTtS9Mz2EmEOcIcYS5hl2l97lCLMEeYI8x1tTfo+YDuDYZNzyT3zgMChDnCXKqt+VuT57P+rc/58/47q0v4n3T8fu9QUz7CHGGOMJeigG3v4wfv5rb+lzey0+MT5ghzHPYEhu0Pqk2x5EcmQmwAAAAASUVORK5CYII=',
  "shot-3": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACcUlEQVR4nO3bQUhUQRwG8O99vAJFKIwObRCReevQIkEdQwiDjTp0F0+1F8FDgeYlsMIuRSARneqUgaCwUERSt61THaIMlCJyiySotBVC3a79B5nHOEu78O3v9jnzZt4e/m/fzLgJ4tUy2pNmHp8QR4gjxCWxNblyb8Y0Tj24aHL/o/fO5amT17yTfRo9bHJn92WTO/pPR30mQhwhjhCXxg6wPPvW5G/L2701HGry+brJxW7UFSGOEEeIS+rw7l2rZ81n2Tf2Ouh+NmH6E+IIcYS4xK2Z4WP7TYfH8z9MfrVkc3V11eT2tjbEPBM2qXHveG7//O6dJvcdtPla+aPJhDhCHCEudWvmZ/6cyX24430GbFQr3gk6h6aCbujPhQWb17r8F4x1eWve/Tz5+XGTCXGEOEJckvXu7L4XXCrNxs1YeuNvLxyKGv5Kodfk6y+XTF7f+G0yIY4QR4hLQ9fTHbvs9+7Kd/u9ncXdxw+9Put+3GeWW/Ot/QAHIY4Ql8YO8Ks8afLZ8Rfe/m6NnjgzFDTfk+kb3nZ3vZ91VkiII8QR4pLsLmnNd57v1nSoZ4tVk4/vbff2L/ba9f4Wzg0MQhwhjhCXZnexNV8pXTV529wBk0/dGjR57qvdQyz25LztC87/F3y4ORG0f1A5at9LcoURd23TOhv8FyGOEJfGDtA2cMTkpwPloD27z1/eedtv3x01uTgzjXoixBHiCHEpmkz0uUMgQhwhjhCXbOGamm9t0Gi5woj7p9Z+gA8hjhCXhtb84uB505g8tCW25/5w1G+Esrjz7+g5GTUeIY4QR4hLmvC3wv91fkIcIY6NvoFG+wuS7ZkaCFfMNwAAAABJRU5ErkJggg==',
  "shot-4-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACEElEQVR4nO3bwUtVQRQG8G++N/lPCFIEKQQmIsKDl7hpIxgu27RKWomJBC6iVZuCCBNXYgt3LqOgTRtRCRIXFYTGIxKlf6HaGbSbE8xwvPfq4ns/3ubce2bmbea8mXn3BjidDndOc/fDl93g7fM8+7cIcYQ4Qlz0zsm1Ow/y+f8+zSnViBJbQwhxhDhCXKy7w8cTM6787o/DJN48SWPrUWc6iYeuXk/ij58+JPHvP7+yNYoQR4gjxAXv2tvme+d8ybUrQ658O+dXP2+72hPiCHGEuHhvcKzRtf2T7dfw1Iy7G0+TeO7GBJpEiCPEEeLiq2/7rgbvFp4ncdvcn1p+mG3fHu3kBzA1o2mEOEIcIS6UEkp7BVsTvHb2tpL45vikq6ZURYgjxBHigr1Q2u/btX3VGtBqtbL3D7pfk3jhzXql8Xr/CxiEOEJcsBe8Z362Jngt356t1N7WBO/zA4Q4QhwhLtbdYen5gfubL2v9XV9qT2XPMEs1gRBHiCPExVLC+Ig99TPMOuD451ESD/RfzjZ/O/8siadXlrI1xdaQqghxhDhCXCjtBewcLbFz2PL25x2vtxdwIsQR4mLVDvou9TU6x63vR91a+yPEEeIIcfG851xVVc8ALUIcIY4QF0oJdm+wOHYrm/9i/30NX+vs4/X2Ak6EOEJcLCX8975A4dnhut/tbXo8Qhwhjhf9BS7aX4uDl/I3ef3fAAAAAElFTkSuQmCC',
  "shot-4": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACa0lEQVR4nO3bT0hUURgF8PMObxCmXJSS0iICiegfRAuLoTY1EBIEQYwuinCVQVPZ2oWLCVs1haEtQpFcpBBJUVEkpYZI7fpLGAStMogwQWg1bfsewx3vvHEMzvx2593v3Xtnce/MfTMTwF+hRHtQRp/V7N8gxBHiCHGB75pcHr/vLE5mTsSaUOf2Jmf78OeFir5mQhwhjhAXVrrDbz17veofTy+a3DX91Vnfl79t8v70MZMnRu+avPj7p8kjgzmzpxHiCHGEuKCMz96FOGu+lC/tT7zqo2t+8uGY7W9+3uTU1nqTCXGEOEJceOZcj7Mg+r6Z2bbZWT+06ZrJvRcOw2fPaNu32+Szl93z8/Uj0WwyIY4QR4gLRwZz5sKunQecNwzNzTjb+5pbTa5LNJi8sfue8/4/uRZUEyGOEEeIC1ZQYz4HpA4dN43PJvKxJrDUPW5yfT5j8vqGFq89qpQPH+dMJsQR4ghxYZFrzvN+x1RlJ9A40Ba5smTS67EbJre2X4w7ZO17gX8R4ghxQZFrXs/8Oqa2xJrA9fNHYt1fZE/w+v0AIY4QR4gL43ZQ9/2tyY+uuM8G6f5hky/dnPQab3bmgcnvurIm77nVX/DZEwhxhDhCXFiqoDE74Gx/kUuZ/OvVU5M3HDzqXMPLC7Mmp09eNfl5ttPkZOT+uAhxhDhCXFDyd4GRNVpKssnuCVG+/ZUxXu0s4IMQR4gL43aQWJdc1TUe9f7lm4r2R4gjxBHiwmqvubjiPgOMIsQR4ghxwQpqzNng06nTzuIdo3dQSWWMVzsL+CDEEeKC//2/vas9HiGOEMe1nsBa+wuqbIZ5y5uhzQAAAABJRU5ErkJggg==',
  "tank-2-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACNUlEQVR4nO3bu2tUQRQG8O9+TGxFC1lIxFchIqQQCwNrtFCENAYV2V4EjYgptBAUCRY2FgvBB1pZCCoKKWTBJ1EXtFFQLLQIIhHxHzCWEezOidxhnMENfPtjm3Nn58yF5Zz72lsh0+Jwc7FuvPrQrZZzfkIcIY4QF3Jr8kbrlBmf//7Vfv/P59+Nr1lv4sHGUG3+1J5AiCPEEeJC6YQLv36a+PzoeFa+mZczJp7auh0lEeIIcYS4KjeBPy/IrfmYi64n9K8FMhHiCHGhdM37GvViPcLPnz17zc73+9O/FshDiCPEhdSa70xeNuMjfkKkB4xsa9Yv6ObvvnTcxAtu/dyeQIgjxBHiqtwekOrxq46JN2/cYuJ1gxuy8o+1T5u43wMiCHGEuJBbY16sR7TfPjfx7eEd6CVCHCGOEFfFjvs3W5Nm/Mv8nIlXrVxt4jOdWyh53pDq9btu0j1EQhwhjhAXYjV/9E47KeGFXQdMPOXOG64fPpmUj7S/0VBjrYkHBlYk5VuSH+IIcYS44Df447x39dAJE0/cv1J0h47dm0bdf5Cedh+ZeE9zX/09x8g9SkIcIY4QF1InvHjzzMQTJffmL+cJT2Yfmnjv6FjR9QhxhDhCXEidcPfbp9rxj5/fo6QjLftssDRCHCGOEFf5Df7+wMHGpqSED37MZV3/l76W6D8bjCDEEeKC3+BrJvbOz7md++0G1wN8TeZasl4mQhwhjhBXLbd3ef/3+oQ4Qhx7vQO99huLZ6B51MddFwAAAABJRU5ErkJggg==',
  "tank-2": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACQklEQVR4nO3bP2gUQRgF8DePrUQhaJCQkBCwUZRgYaNtiogkBGMnWNioiPgHRImIqEQrwSginhYGLAKBRI6I4UBtFLSJaKwsBDFoZURBUsnF+huW2Swz+QNvf93bmfl2r5jZ2V3OId5SQbtbz/UJcYQ4QpyLnZOLE09N48+5ayZ3jXxAjOG93SYPdG8yed/4p6jfRIgjxBHistQF/yzY/O3y7qh6N178Nnln6xGvx4Wo+oQ4QhwhziWosZRyzhfJ2VdUzwIxCHGEuCz1nC/a+xetEf74ZvOfHY89fn//fUH1LFAGIY4Q55bRx8yxvwtfgp03btkWbE89/tftQ1H7BEIcIY4Q51KvAUXmTo2Z3LPf3tfRvyuqfs4aUq0BIYQ4QlxWdkDsff7obN3k6eFek9uxughxhDhCXFZ033/+5rNp/PjuvclbOzuCa4S/Jsy+td8SU8t5PxF8X0CII8QR4rKiOV8/3xcs8NXLo/eeBNeEH89ulrrAlsUdJjd7e0zmhridAyGOEEeIy/wD/n3eN3h9yuT6laGkFzR0ctTkV7dqJs+fuWpy5x2bN5+btAVHws8uhDhCHCEuKzug9sjOybaUVwNg6v5Zkw/WZkx+fNzuC2IR4ghxhLis7IC2+UawfabxGilNjl3ESiLEEeIIcS7nmHk/0DdwrFTBxvTDqOf/WO39l/xD1bfBEEIcIc4to49ZE7a3dpnGl4cPmNxx9wFW0vfTJ4LtOeev1oAQQhwhzq3D/wqv6vkJcYQ4rvUFrLX/7taEdVxzghYAAAAASUVORK5CYII=',
  "tank-3-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACK0lEQVR4nO3bsWpUURAG4P/+nIcQVDSiJhAMWlkYAwopLJQQFPMAaUQIaWyEEHTBJk0QJM0+gKKIaCkohFhYCQsikRQKIigWig+QQLoZ4Q7juTHIvx/bzJ57zj3NzJ5Z7m2QtD0xud023gw2muya/3J9jxBHiCPElWxOrl272X797ufvzR44ZuLp85da16+tCYQ4QhwhrmQnfP/xzcSDD+9M/HVqpmpDT9efmXgNe4sQR4gjxDXZCf5csFSZ85GeqwnDXqBjhDhCXMnm/NzhMTN+IshZL6oZfv7D+SW7n35v2At0iRBHiCtRzvv+fHzE1oCpsxftAkEN+ON6z82f6/dM/PLWfbvflYWqmkCII8QR4kp0wfjJiVQO+xz1tj5ttt8wmN81QhwhjhBXshPW377K/a47Nx4/qKohXSPEEeIIcU3Y77uzfyRbE6ZXFlprgB+v5XsFQhwhjhBXshOyOf5+c9A+fmXexItBzl8/NGriU2OnTXzk4IiJtz5/tAsMNkxIiCPEEeJK7QJhfx9YfN5H2zNIvnd49MXdz8W3z1028b03L0x8192fEEeII8SV2gWOHx1Nne2jc4F/BqlrvvchxBHiCHHF98f+WdzVM5OpBbP/6a26XmDZnQv2GiGOEEeIK/6LsCa4nP3fDP8TdAhxhLiSnfDr98/W8eXXT2r2gzsXrlat5/v/6JkhQhwhjhBXshOinKx+dzh4LzB6tziLEEeI435vYL/tAFd8owLY56PvAAAAAElFTkSuQmCC',
  "tank-3": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACUklEQVR4nO2bMWiUQRCF3z5WjIp6iCjGQixUIqhgoQhG0FhowLRGrrE9YhHQJsYijVhoYSFoaWdi5amlVh5oIJxooWgarYJXBYRTkXjWs8Uuy/4xyLuve7f/zD/Nm9v52XXIxLmNvdh6r9d1uTn/Zf4QQhxCHEIcl+vJ7w8fRZ/ffPlSUUEPDu02un71TjR/aU8gxCHEIcTxuQErC5+Mvr3wzOiv0/uLCro21zG6jtWFEIcQhxDHZQcE+4JSz6fYc/Oz0f1ZoGIIcQhxfK7n7w/vzPJsSKpnhPHtj4tGHx3aZ+rpzwKFEOIQ4riU58P5/PzYJqMHbzwxet2Gg9EX/v7xIbqeGx8+n9sTCHEIcQhxfOqBlOdzPf5z7l1RfNUQ4hDiEOK40nk/1RNCGsfOGb2+s8Xou18eZ+Xr7wMKIcQhxHGpeX/01NashLk9IfRwaq+f4sTJs0a/br2IzgqEOIQ4hDg+NyDX4+1mM7o+P3sr6vnQ07t22H3DmZEpo4eGtxn9pvXW6OuNUaMJcQhxCHF8aYLUfI+B+PLp+jRiZ5D2Tk4YvVSz3yeWOrYHXOjaM0TPm/EzTYQ4hDiEOL40wcDFI0aPHR4x+un7l9F9QXflT/QMUtWEsw8hDiEOIY4P5+PGq2/GI/MTkyZgMJEw9HyKcBaojdv/9e01u7evGkIcQhxCHB/+EPaE4+NTtifM4r+i/00wASEOIY7PDTjQ+hVdr92bKakHy1dmsvItLreNtrcX0meGCHEIcQhxXOld3tW+Oxzmq7oeQhxCHK51AWvNX+7DtSgzJwkxAAAAAElFTkSuQmCC',
  "tank-4-foe": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACLUlEQVR4nO3bv2sUQRQH8O9+b9IYGzFIDMQf6JFTOPUPkBSCjYVYKMTePyCFXYiFYpcitdh7oJWFhcIVEkICQkCS89CoYEDFStGkiXCC3XvCLJPZJcL3PlzzdnbebnEze/tmrkDFBucuDmLtxeul4n/KT4gjxBHiQm4CPyZnJlumvXnSxoO/n73z+c8229H8ZXMCIY4QR4gLVSfsbPVNPOPa7166Ee1/+NCYiUMYsScsPzfhj5/fkYMQR4gjxBVVJyz7rT4/fc3EI26M7/7ejbZ7d7qPTTx8F0hEiCPEhbovsHj1lonvPX2Yle/Z7II94OaAVIQ4QhwhLqQ+x3P5Mdx/3zNx88SUiRuNRp23A/lvACGOEBf+remdiXZot85H208db5p43LWvbbwy8dyLTvw577xc7Zr4CvIQ4ghxhLjgD3S23sR7lLRfP3raxE++bJr4/mVfJbTefrA1xZW1peg6Qy5CHCGOEBeqTjh64CDq9O5jP1pjHK4NJiLEEeJC1Qm3d35l9e9trkef+34OyEWII8QR4kLVCcePTNgD7l2gzIPeSnRPkN9/ABf7esJg8XZ0zxAhjhBHiAtVJ/z67XNWfz/m260LSWM+FSGOEEeIK+peG/Q1wNR1gFS+pjjr9iMMfwc4hDhCXFF2QuraYdk6g98zVLWyMe8R4ghxhLgitUPde4hS3Txm56RHn+ycM5wDShDiCHFFboLUOaHu/w6nXo8QR4jjft/AfvsD/WSY4eJfqQcAAAAASUVORK5CYII=',
  "tank-4": 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACjElEQVR4nO3aP2gUQRQG8G8+Vgn+IR7hFDEcGm08UigGQYsUQQQ12Ci5ShARFEEUS0kTPK5TtFAsLAJWORRFjEVIJRijhBhBIhbqcRo4OOSMf4KJgra+Z5h1sxsSePvrvp3dt7vFzu7OjEPyfoe0u+VUnzCOMI4wziVQQzyTNzu3iMaDnc0i54oTsU6m6xf2rxY50/sq0j0SxhHGEcYFSRcsv5vxtjeK7d72le2tIs81bRN5oDQo8sepeLdAGEcYRxjnFqGm+C7oat0gGvuPbxR5bdMvkb/+CLztWtT3vkYYRxhHGOcWuw94PnBNNO4unItV/NuntyKvadmqd0n7gCgI4wjjggWMuSX6DM/eHhZ56uRhkdtm/f8WcRHGEcYRxjn9zB89ct57QNehbm/7nr3bve1PR16LfObEPm8foVVLBZHzl8f0Lul3QBSEcYRxgd5QqbwRuVaTz+zo6H2RW9ZvEnno3maRx8afiHzx0i3vBU0OPxR5/PpV7zxDXIRxhHGEcUHSBTPNsg8AZB8Q16PH0yJXe3eInCtO6H+ZdG7QhzCOMC7QGxo/s2qL/A4I05iuxLqgL+Ub3ve+7gPiIowjjCOMC/SGzIq6yLWIBXP5Du+/QJjSs88i99TnRB78IMcIy/0zYfMG3u8CwjjCOMK4IOmC1cl/xugi6WlbJXL22GmRv/ddEfnBy5FY5yOMI4wjjHPzbBPvzY5dB7xjhHpMUDt1ti/WPEBUekxxnvUI6XfA3wjjCOPcf+wTae5Qu3NXjuvrNUNJC3vmNcI4wjjCOLeAY7xriHZm13kPflGX//tR6bXH3Xn573Bh6L0+JO0DfAjjCONcAjWirit0y+l8hHGEcVzqC1hqfwBKT5QJIW0DMAAAAABJRU5ErkJggg=='
};

})();

