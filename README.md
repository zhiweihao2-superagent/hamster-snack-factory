# 仓鼠零食工厂 · dsh-game-studio 工程版

**在线试玩（手机可直接开）**：https://zhiweihao2-superagent.github.io/hamster-snack-factory/

原 `hamster-snack-factory-main.zip` 里的单文件 HTML5 三消（5×5、五关、礼盒三工具）已经收编成
[dsh-game-studio](https://github.com/ZSeven-W/dsh-game-studio) 的标准工程格式：
`game.json` + `game.js` + `assets/` + `dist/index.html`，并且在同一条流水线上补齐了
**音效、存档、微信小游戏工程化与安全区、美术槽位、数据驱动关卡**。

游戏逻辑一行没重写：`game.js` 由 `tools/adopt.mjs` 从原 `index.html` 抽出，做**可核查的**文本替换
（每条替换必须恰好命中 N 次，否则报错），再把 `tools/adapter.js` 接入层插在 IIFE 收尾之前。
原文件原样留在 `game.orig.js`，随时可以对照。

## 当前系统（v0.9.42）

- **战斗**：5 鼠 vs 5 鼠，2D 地板自由走位；连锁消除 → 倍率滚雪球（上限 ×3.2，掉血衰减）
- **养成**：五职业 × 四阶转职 + **天赋**（每只 1–3 条，可跨职业，三级递进）
- **经济**：金币 + **碎片**；补给站（货架/刷新）、**抽奖页**（仓鼠池 / 道具池，十连 540 / 180）、**炼妖页**（30 金币，槽1 固定）
- **随机**：关卡随机事件、稀有掉落、波间押注 —— 概率全部公示在 `docs/GACHA-ODDS.md`
- **文档**：设计见 `docs/TALENT-DESIGN.md`，提审见 `docs/WECHAT-REVIEW.md`，美术见 `docs/ART-SPEC.md`

> 历史文档（GDD-v2 ~ v6、shop-routing）保留作为演进记录，**以本节与 TALENT-DESIGN 为准**。

## 目录

```
hamster-snack-factory/
├─ game.json            清单：标题、竖屏、4 个美术槽、rules（关卡表 / 工具 / 开关）
├─ game.js              游戏本体（原逻辑 + 接入层）
├─ game.orig.js         收编时的原始脚本（只读参考）
├─ assets/              四个美术槽的占位图 + ASSETS.json（记录每张图来源）
├─ dist/index.html      构建产物（0.08 MB，零网络请求，侧栏/浏览器直接玩）
├─ export/              单文件离线导出版（发给谁双击都能玩）
├─ wx-minigame/         微信小游戏包（266 KB / 4 MB，含提审材料草案）
├─ .studio/             版本、playtest 截图、封面
├─ docs/
│  ├─ GDD-v2-rpg.md     RPG 改版大纲（三资源 / 步数即时间轴 / 尖牙帮）
│  ├─ GDD-v3-roster.md  仓鼠小队 + 商店构筑（部分被 v4 取代）
│  ├─ GDD-v4-shop-routing.md  品种树重画 + 商店获取路径 + 局内资源分流算法
│  └─ ART-SIZES.md      美术尺寸规范（舞台/卡/条/按钮/字号/出图框）
└─ tools/
   ├─ adopt.mjs         单文件 HTML → 工程 game.js（带命中校验；需要原始 index.html，收编后跑不了）
   ├─ compose.mjs       **分层合成 game.js**（game.orig + adapter + rpg + shop），改了任何一层都跑它
   ├─ adapter.js        接入层：音效 / 存档 / 美术槽 / 微信安全区 / 自动化接口
   ├─ rpg.js            RPG 战斗层：舞台 / 三资源分流 / 单位 / 敌方 / 技能 / 大招 / 关卡表
   ├─ shop.js           经济层：金币 / 转职证 / 抽卡 / 碎片 / 炼妖 / 天赋 / 编队 / 标题页
   ├─ studio.mjs        build / playtest / export / wx 四个命令，直接调 studio 引擎
   ├─ levelcheck.mjs    关卡表自检：逐关打印波数 / 同屏上限 / 修饰符 / 首个敌人血量
   ├─ detcheck.mjs      确定性配平回归（`__rpgSim`：最优交换 + 会放大招）
   ├─ sim.mjs           配平模拟器（__rpgSim：会用工具 + 满能量放大招）
   ├─ probe.mjs         逐回合打印资源与伤害曲线
   ├─ inspect.mjs       逐 tick 打印 act / phase / anim / 分流
   ├─ shots.mjs         定时截图（studio 的 mid 会被提前结束的一局跳过）
   ├─ batch.mjs         原 __testRun 口径的批量结果
   └─ regress.mjs       规则回归（跑原工程自带的 __testRun）
```

## 怎么跑

```powershell
cd D:\deepseek\杂项\hamster-snack-factory

node tools/studio.mjs build "改了点什么"      # 构建 + 存版本
node tools/studio.mjs playtest 20 web         # 无头 Edge 自打 20 秒，出标题/中局/结算截图
node tools/studio.mjs playtest 15 wechat      # 带微信胶囊安全区的模拟跑
node tools/studio.mjs export                  # 单文件离线 HTML → export/
node tools/studio.mjs wx wx1234567890abcdef   # < 4 MB 微信包 → wx-minigame/
node tools/regress.mjs 20                     # 规则回归：胜率 / 到达数 / 连击
```

**改了 `tools/adapter.js` / `rpg.js` / `shop.js` 之后**（分层源码）必须重新合成再构建：

```powershell
node tools/compose.mjs                        # 分层源码 → game.js（--check 只比对不写盘）
node tools/studio.mjs build "改了点什么"       # 再构建 dist/ 并存版本
node tools/levelcheck.mjs 12                  # 关卡表自检：6 关一轮 + 第 7 关起放大
node tools/detcheck.mjs                       # 确定性配平回归（不受实时战斗的墙钟噪声影响）
```

只改 `game.js` 本体的话直接 `build` 就行，不需要别的构建工具。

## 本次改动

### 1. 接进 dsh-game-studio
- 工程清单 `game.json`：标题、`orientation: portrait`、4 个美术槽（`hamster` /`snack_peanut`/
  `snack_cookie`/`snack_seed`），关卡与工具写进 `rules`。
- 构建产物内联脚本、内联图片，CSP 关掉一切网络请求；`export/` 里的单文件同理。
- `window.__gameState()` 现在同时满足 studio 的自动试玩契约（`title/playing/won/lost`、
  `score`、`hearts`），原字段（`board`/`steps`/`prog`/`seed`…）全部保留，老回归脚本不受影响。
- 新增 `window.__autoplay()`（真打：开桌 → 关提示 → 用工具 → 走 `bestMove` 最优交换）
  与 `window.__renderSlots()`（把代码画的仓鼠和三种零食单独渲染给侧栏当缩略图）。

### 2. 音效（原来是"还没做"）
WebAudio 现场合成，**不占包体、不引外部文件**：交换、无效回弹、消除（连击越高越亮）、
工具（打包机/仓鼠/大礼盒共用一声机械感）、三选一、胜利琶音、失败下滑、重排、点按。
首次触屏自动 `resume()` 解锁，微信里用适配层给的 `AudioContext`，拿不到就静默降级。
标题页右上角「音效 开/关」可点，键盘 `M` 也能切，开关写进存档。

### 3. 存档（原来是"还没做"）
`localStorage` 存 `best / bestGain / plays / wins / mute`，标题页回显
「最高第 N 关 · 最大单次 +X · 通关 Y 次」；进关、过关、失败、重开都会落盘。
隐私模式或被拒时只跳过存储，不影响玩。微信里走 `wx.setStorageSync` 适配。

### 4. 微信小游戏工程化（原来是"还没做"）
- `node tools/studio.mjs wx` 出 `wx-minigame/`：`game.js` 入口、`weapp-adapter.js`、
  `js/game-assets.js`、`js/core-game.js`（就是本工程 `game.js`）、`wx-config.js`、
  `game.json`、`project.config.json`、`images/`（SVG 已栅格化成 PNG）、
  `WECHAT_SUBMISSION_DRAFT.md`（提审/资质说明草案）。
- **右上角胶囊安全区**：`layout()` 的可用高度扣掉 `statusBar/capsule` 下移量，绘制整体
  `translate(0, SAFE_TOP)`，指针坐标同步减去，所以「第 N/5 关」和「步数」不会再被胶囊压住
  （见 `.studio/playtest/*-wechat` 截图；模拟器里 `SAFE_TOP = 91`）。
- 包体 **223 KB / 4 MB（5.3%）**，其中代码 116 KB、图片 107 KB，后续加图还有很大余量。
- 分享文案：`window.__wxSharePayload()` 返回「仓鼠零食工厂 · 我已经开到第 N 关了」。

### 5. 美术槽位（原来"先用方块占位"）
四个槽已经挂进 `game.json`，玩法侧是**有自定义图就用图、没有就沿用代码美术**：
`tools/adapter.js` 里包了 `drawTile()` / `drawHamster()`，只在
`GAME.slots[slot].custom === true` 且图片加载完成时切换。当前 `assets/ASSETS.json` 里四个槽
标的是 `template`（占位），所以你现在看到的仍是原来那套代码画的方块 + 符号；
一旦用 studio 生成/应用一张图（或直接把图覆盖到 `assets/*.svg|png`），游戏立刻换皮，不用改代码。

### 6. 关卡数据化
两套表各管一件事，互不干扰：

- **`rules.levels`**：三消侧的模板（`name` / `steps` / `target` / `tip`）。RPG 改版后步数被
  `stepsMax = 0`（无限步）接管，这张表只剩「棋盘模板 + 关卡名」。
- **`rules.rpg.levels`**：**RPG 战斗侧的关卡表**（关卡名 / 波次脚本 / 同屏上限 / 工具次数 /
  `mod` 修饰符）。`levelCfgFor(level)` 取 `(level-1) % 表长`，第 7 关起回到第 1 关并把
  `hpMul` / `atkMul` 整体 ×`rules.rpg.roundScale`（1.15）——所以关卡是**无尽**的，不是 6 关封顶。

```json
{ "name": "凌晨补货", "onField": 2, "tools": [1,1,1],
  "mod": { "hpMul": 0.9, "chargeMul": 0.75, "armorMaxDelta": -10,
           "yieldMul": { "parts": 0.4 }, "noUlt": false, "stealBonus": 0, "note": "凌晨补货：警报迟钝" },
  "waves": [[{"type":"crate"}], [{"type":"crate"},{"type":"shell"}], [{"type":"boss"},{"type":"thief"}]] }
```

改完用 `node tools/levelcheck.mjs 12` 直接看 12 关的实际配置，别靠猜。

## 回归数据（`node tools/regress.mjs 20`，Edge 无头，同一批种子）

| | 胜率 | 到达关数 1/2/3/4/5 | 平均连锁 | 卡死 |
|---|---|---|---|---|
| 带工具 | 60% | 18/18/18/16/12 | 4.8 | 0 |
| 不用工具（对照） | 15% | 18/17/9/6/3 | 5.4 | 0 |

和收编前一致（逻辑没动），三样工具的选取分布也均匀：打包机 24 次 / 打包仓鼠 22 次 / 大礼盒 24 次。

## 可选：把侧栏插件装进 DSH

本工程是用 studio 的同一套引擎（`src/*.ts`）headless 驱动的。想要**侧栏里直接玩 + AI 出图 +
一键发 GitHub Pages**，把插件装进 DSH 的 web profile，然后重启 DSH：

```sh
dsh plugin --profile web add @zseven-w/dsh-game-studio@latest
```

装好后 15 个 `game_studio_*` 工具就能直接对 `D:\deepseek\杂项\hamster-snack-factory` 操作
（`game_studio_list` 会把它列出来）。

## 继续开发的现成入口

0. **RPG 改版（新）**：[docs/GDD-v2-rpg.md](docs/GDD-v2-rpg.md) —— 上方礼盒图案区改成车间战斗舞台，
   下方三消给上方仓鼠送能源 / 护甲 / 零件，对手是「尖牙帮」鼠群。含数值骨架、敌人表、章节结构、
   状态机与函数改造清单、M1–M5 里程碑。
1. **换美术**：`game_studio_generate_asset`（或 `codex`）给 `hamster` / 三种零食各出 2–4 张，
   选一张 apply，`build` 后即生效；`revert_asset` 可回退。
2. **加关卡/调难度**：只改 `game.json` 的 `rules.levels`，`regress.mjs` 看胜率曲线。
3. **微信发布**：`wx-minigame/` 用微信开发者工具导入（`project.config.json` 里先填真 AppID），
   提审材料看 [docs/WECHAT-REVIEW.md](docs/WECHAT-REVIEW.md)（按当前代码实况写的：金币来源、补给站货架概率、
   五大系统说明、隐私口径、截图避坑；`wx-minigame/WECHAT_SUBMISSION_DRAFT.md` 是导出时自动重写的通用模板，别在上面改）；
   装了插件后可 `game_studio_upload_wechat` 直接传体验版。
4. **赚钱**：微信入口已把 `GAME.watchRewardedAd(slot, cb)` 挂好（未满 100 UV 时
   `noAdFallbackMode: "free"`，直接发放奖励），接「失败复活 +3 步」只需在结算卡片里加一个按钮。
5. **上线**：`game_studio_publish`（GitHub Pages，需本机 `gh auth login`）或 `game_studio_export_wall`
   把几个游戏打成一面墙发朋友。

## RPG 战斗层（v0.3.0 · M2 逻辑版）

上方礼盒图案区已换成**车间战场**，下方三消给上方送三种资源。美术全部是代码矢量图，
尺寸规范见 [docs/ART-SIZES.md](docs/ART-SIZES.md)（参数集中在 `game.js` 的 `SZ` 里）。

```
花生 ⚡ 能量   → 私有槽（技工/医务单位） + 公共大招池（满 60 点「爆产」）
饼干 🛡 护甲   → 全队共享盾，伤害先扣盾再扣血（不分配给具体单位）
瓜子 🔧 零件   → 私有槽（装配单位） + 公共炮台（满 8 打一发 7 伤害）
```

- **我方**：铁皮鼠（吸引 20% 伤害、自身减伤 30%）+ 炮筒鼠（6 零件一发）。品种表另有 8 只，
  数据已进 `game.json`，等商店开口（M3）。
- **敌方**：纸箱鼠（第一下只破箱）/ 抛壳鼠（穿甲）/ **拾荒鼠（每 7 秒改写盘上 3 格）**/
  **质检机 Boss（110 HP，第 5 波）**。5 波：`crate` → `crate+shell` → `crate+thief` → `shell+thief` → `boss+crate`；
  同屏 2，其余进「增援」队列。
- **双方全自动战斗**：敌我双方都按各自的秒表出手（敌方 4.5s、炮筒鼠 2.6s），你不动手两边照样互殴；
  你要做的是给我方加压——补护甲续命、攒零件打强化弹、攒能量放大招。
- **三资源 = 强化弹**：私有槽灌满后，下一次出手用强化值（炮筒鼠 4 → 12）；没资源也能打，只是打得弱。
- **输赢只看小队**：没有核心血池，**我方仓鼠全灭 = 输**，敌人全灭 = 赢。
- **没有步数限制**：想消几次消几次，顶栏只显示 `消除 N 次 · 无限步`；死掉一只仓鼠不影响继续消除。
- **技能**：液压冲压（单体 10）/ 仓鼠加餐（能量 +40）/ 开箱爆裂（全场 15）/ 全厂爆产（能量 60，全场 22）。

实测（`node tools/diag.mjs 1400 90` / `node tools/idle.mjs 70`）：

| 场景 | 用时 | 结果 | 存活 | 击退 |
|---|---|---|---|---|
| 一直消（真人节奏） | 53.6 s | 胜（中途阵亡一只仍能继续消） | 1/2 | 8 |
| 完全不操作 | 70 s | **负**（全队阵亡） | 0/2 | 1 |

**挂机不会白赢**——这是自动战斗能成立的前提。详见 [docs/GDD-v5-realtime.md](docs/GDD-v5-realtime.md)。

调节入口全在 `game.json` 的 `rules.rpg`（敌人 HP、波次、产出、上限、步数、工具次数）。

## 商店 / 养成（v0.7.1 · M3）

每赢一关进**补给站**：三个固定类目 + 刷新（8 金币 ×3）+ 选中仓鼠的属性面板 + 「开工」进下一关。

| 位置 | 类目 | 内容 | 价 |
|---|---|---|---|
| 1 | **转职**（工种证） | 钳工→铁皮鼠 / 装配→炮筒鼠 / 调试→速滑鼠 / 医务→扳钳鼠 / 仓管→收集鼠 | 40 |
| 1 | 专精证（同格升级） | 液压 / 瓜子狙击 / 爆产 / 医护 / 仓库鼠，**须同一只鼠已有二级** | 70 |
| 2 | **碎片包** | 碎片 ×2（用于换抽卡：道具 5 / 仓鼠 12） | 10 |
| 3 | **招募**（白板仓鼠） | 买了可选一条线再转职；有编队空位会自动补上 | 35 |

- **编队**：点仓鼠 = **只选中**（金框）；**再点同一只** = 上下场，标题行显示「上场 2/3」。
  **上场上限 3 只**（竖屏容量：3 我方 + 3 敌方 = 6 张 48px 卡刚好铺满 318px）。
  买了第 3 只鼠会自动补空槽；超出 3 只进待命区，点两下换人。
- **金币**：12 + 存活仓鼠×6 +（护甲 ≥80% 时 +8）。存档记金币、仓鼠、编队、最高关。
- **关卡递增**：每过一关敌人 HP ×1.18、攻击 ×1.10 —— 商店就是拿来跟这条曲线的。
- **输了也进店**：全灭后点结算卡进补给站（按钮「重打本关 ▶」），保底收入 `8 + 击退×3 + 波次×4`，
  免得卡关变成"没钱→更打不过"的死循环。
- **证按关卡解锁**：1–2 关只出钳工/装配，3 关开调试，5 关开医务，7 关开仓管；第 4 关起才出专精证。
  保底格 **60% 给"选中鼠同线的专精证"、40% 给"别的线的二级证"**，既保证买得到用得上，又不会永远同一张。

## 波间补给（三选一）

**触发**：清空当前波全部敌人（含增援）→ 不是最后一波 → 且 `(波次) % pickEveryN === 0`。
默认 `pickEveryN: 2`，所以 5 波的一局只弹 **2 次**（第 2 波后、第 4 波后）；`1` = 每波都给，`0` = 关。
选卡期间战斗**暂停**，所以频次故意压低。

每清完一波弹 3 张**本关有效**的临时卡，选完才进下一波（键盘 `1/2/3` 也能选）：

| 卡 | 效果 |
|---|---|
| 加固车间 | 本关护甲上限 +20 |
| 整箱饼干 | 护甲立刻补满 |
| 磨快牙口 | 本关我方伤害 +25% |
| 上足发条 | 本关我方出手快 15% |
| 备用电瓶 | 能量 +50 |
| 零件补给 | 零件补满 |
| 紧急修理 | 全队恢复 25 生命 |

它和商店的分工：**这里管"这一关怎么扛过去"，商店管"长期构筑"**。

```powershell
node tools/shoptest.mjs     # 进店 → 买两件 → 开工，出 shop-1/2/3.jpg
node tools/checkbuild.mjs   # 测量前必跑：dist 是否比源码新
node tools/gachafusecheck.mjs # 抽卡 20k / 炼妖 5k 的分布实测
node tools/talentwin.mjs 6 3 5 # 0/1/2/3 条天赋四档胜率对比
node tools/shopclick.mjs    # 点仓鼠：只选中 / 再点才上下场
node tools/winflow.mjs      # 赢一局 → 金币到账 → 点结算卡进商店 → 第 2 关仍有两只
node tools/shoplose.mjs     # 输一局 → 保底金币 → 进商店 → 重打本关（关数不变）
node tools/batch-run.mjs 8 2 # 批量实时模拟 8 局 ×2 倍速：胜率 / 存活 / 卡关波次
node tools/thieftest.mjs    # 拾荒鼠是否真的改写了盘面
node tools/waveshots.mjs    # 第 3 波（拾荒鼠）/ 第 5 波（Boss）截图
```
