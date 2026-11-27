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

/* ---------- 像素字体（12px 点阵，构建时以 base64 注入 window.PIXEL_FONT） ----------
   目的：整个 UI 的文字也变成像素风。字体是「缝合像素字体 Fusion Pixel 12px」的 zh_hans 子集，
   只保留游戏里真正用到的 1199 个字符（约 36 KB woff2），许可证 SIL OFL 1.1（见 tools/_font/x/OFL.txt）。 */
var PIXEL_FAMILY = 'px12';
var PIXEL_FONT_OK = false;

function loadPixelFont(done){
  try {
    if (typeof window === 'undefined' || !window.PIXEL_FONT || typeof FontFace === 'undefined'){
      if (done) done(false);
      return;
    }
    var face = new FontFace(PIXEL_FAMILY, 'url(' + window.PIXEL_FONT + ')');
    face.load().then(function(f){
      try { document.fonts.add(f); } catch (e) {}
      PIXEL_FONT_OK = true;
      if (done) done(true);
    }).catch(function(){ if (done) done(false); });
  } catch (e) { if (done) done(false); }
}
loadPixelFont();

/* 文字统一走像素字体：字号取整（配合 2× DPR，笔画正好落在整数设备像素上） */
var _txtBase = txt;
txt = function(str, x, y, size, color, align, bold){
  if (!PIXEL_FONT_OK){
    _txtBase(str, x, y, size, color, align, bold);
    return;
  }
  var px = Math.max(7, Math.round(size));
  ctx.font = (bold ? '700 ' : '400 ') + px + 'px ' + PIXEL_FAMILY
    + ',-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, Math.round(x), Math.round(y));
};

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

/* 调试口：逐个音色试一遍，确认合成器不抛错（无头环境听不到声音，只验通路） */
window.__sfxProbe = function(name){
  try { sfx(name); return 'ok'; } catch (e) { return 'ERR ' + e.message; }
};
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

  } else if (name === 'elite'){
    /* 精英登场：低音冲击 + 金属尾 */
    blip(140, 90, 260, 'sawtooth', 0.10);
    noise(200, 0.07, 1600);
    blip(520, 780, 160, 'triangle', 0.06, 0.10);
  } else if (name === 'gachaFlip'){
    /* 翻牌：短促的"唰" */
    noise(60, 0.035, 5200);
    blip(880, 1200, 60, 'sine', 0.05);
  } else if (name === 'gachaGold'){
    /* Ⅲ 级：上行琶音 + 长尾泛音 */
    var gnotes = [784, 988, 1175, 1568];
    for (var gi = 0; gi < gnotes.length; gi++) blip(gnotes[gi], gnotes[gi], 220, 'triangle', 0.09, gi * 0.075);
    blip(2093, 2093, 420, 'sine', 0.05, 0.28);
  } else if (name === 'fuseClash'){
    /* 撞合：两段下坠 + 噪声 */
    blip(620, 180, 180, 'square', 0.08);
    noise(140, 0.06, 2400);
  } else if (name === 'fuseWin'){
    /* 炼妖成功：宽厚的大三和弦 */
    var fnotes = [523, 659, 784, 1047];
    for (var fi = 0; fi < fnotes.length; fi++) blip(fnotes[fi], fnotes[fi], 260, 'triangle', 0.07, fi * 0.09);
    blip(1568, 1568, 520, 'sine', 0.04, 0.3);
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
