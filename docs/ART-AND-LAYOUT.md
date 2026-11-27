# 自己改：背景图 / 站位 / 美术

这份文档只讲"你想自己动手时改哪里"。三件事各自独立，互不影响。

---

## 零、不想写代码？用可视化编辑器

```powershell
node tools\editor\server.mjs
```

浏览器打开 **http://127.0.0.1:8791**（只监听本机，不对外网开放）。页面上能做的事：

| 区域 | 操作 | 写进哪里 |
|---|---|---|
| 左：舞台 | 拖动绿点（我方）/ 红点（敌方） | `game.json` → `rules.formation` |
| 左：舞台 | 拖动地面那圈金色边框的四条边 | `game.json` → `rules.floor` |
| 左：背景图 | 把 PNG 拖进虚线框 | `assets/stage_bg.png` |
| 右：关卡表 | 名字 / 特色 / 同屏 / 敌阶 / 血量倍率 / 攻击倍率 / 出手速度 / 停电 / 教学 | `rules.rpg.levels[i]` |
| 右：职业数值 | 生命 / 出手间隔 / 基础伤 / 充能需求 / 技能伤（肉盾·近战·远程·魔法·增益分页） | `rules.classes` |
| 右：精灵 | 我方 16 形态 + 敌方 20 形态，每格 6–8 个候选，点一下替换 | `tools/tessera/picks.json` → 重跑 `pick.py`（含敌方变体） |

每个区块都有自己的保存按钮，保存后**自动跑 `tools/compose.mjs`**（`game.js` 立刻更新）。

### 改完之后怎么交给我

**不用发文件**——编辑器直接写进本机的工程目录里。你只要在对话里说一句「我改完了，构建」，
我这边就会：`compose` → `game_studio_build` → `game_studio_export`（顺便跑一遍 `detcheck` / `rtcheck` 看平衡有没有被改坏）。

想确认自己改了什么，可以让我跑：

```powershell
node tools/_geom.mjs      # 地面矩形
node tools/stage2d.mjs    # 双方站位坐标
node tools/detcheck.mjs   # 胜率 / 均伤
```

编辑器不覆盖的地方（仍要手改或让我改）：关卡里的**波次构成**（`levels[i].waves`）、敌人表 `foes`、配件/证件的设计与价格。

---

## 一、背景图（舞台那块地板）

**文件**：`assets/stage_bg.png`（当前 660×336，不透明）
**声明**：`game.json` → `slots.stage_bg`（`size: [660, 340]`，`transparent: false`）

### 路线 A：用现成图片替换（最快）

1. 准备一张**同样比例**的图（660×336，或 330×168 的 2 倍都行）。
2. 覆盖 `assets/stage_bg.png`。
3. `node tools/compose.mjs` → 调 `game_studio_build`（会重新内联进 dist）。

> 注意：图片要放在 `assets/` **根目录**，不要建子目录——studio 构建会把子目录当文件读而报 `EISDIR`。

### 路线 B：改我写的像素生成器（风格跟着参数走）

**文件**：`tools/pixelbg.py`

```powershell
python tools\pixelbg.py --scale 4 --seed 11
```

- 逻辑分辨率写在文件顶部 `W, H = 165, 84`，`--scale` 是整数放大倍数（4 → 660×336）。
- 调色板在 `PALETTE` 附近的常量里（`MET1` 地板、`STEEL` 管道、`AMBER` 灯光…），改颜色就换风格。
- `horizon` 控制后墙高度；左侧传送带、右侧管道的位置都是硬编码的几行 `d.rectangle(...)`，照着改 x/y 即可。

### 路线 C：让 AI 生成

```powershell
# 需要你手动放行一次（会话里默认拒绝授权类操作）
```
调用 `game_studio_generate_asset`，槽位 `stage_bg`，提示词写清"像素风车间地面、中间留空、不要角色和文字"。
生成后 apply，再 `game_studio_build`。

---

## 二、角色初始站位

**文件**：`game.json` → `rules.formation`

```json
"formation": {
  "ally": [[0.03,0.10],[0.16,0.10],[0.03,0.50],[0.16,0.50],[0.03,0.90],[0.16,0.90]],
  "foe":  [[0.97,0.50],[0.84,0.50],[0.97,0.10],[0.84,0.10],[0.97,0.90],[0.84,0.90]]
}
```

- 坐标是**地面区域的归一化坐标**：`0,0` = 地面左上，`1,1` = 右下。
- `ally[0]` 是第一个上场的仓鼠，`ally[1]` 第二个……超出 5 只就循环取用。
- `foe` 同理，按刷怪顺序对应。
- 改完 `node tools/compose.mjs` + `game_studio_build` 生效。

### 怎么"看见"这些数字

游戏里按 **`G`** 键（或在控制台执行 `__grid(true)`）打开**站位标尺**：

- 淡蓝色 0.1 网格，四边标了 `0.0 / 0.1 … 1.0`；
- 绿色圈是 `formation.ally` 的落点（标注 `ally0`、`ally1`…），红色圈是 `foe`；
- 对着格子读数字，直接往 `game.json` 里填。

再按一次 `G` 关闭。

### 地面区本身在哪

`tools/rpg.js` 的 `floorRect()`：

```js
top:    L.giftY + SZ.title + 52,     // 标题+战况条之下
bottom: L.giftY + L.giftH - 46,      // 护甲/零件条之上
left:   L.pad + 12,  right: W - L.pad - 12
```

想让地板更大/更小，改这四个数（当前是 `145..362`，高 217）。`formation` 的 0/1 永远贴着这块矩形的边。

---

## 三、角色美术

**文件**：`art/tessera/picks/`

| 文件 | 用途 |
|---|---|
| `<职业>-<阶>@4x.png` | 我方精灵，64×64（= 16×16 放大 4 倍） |
| `<职业>-<阶>-foe@4x.png` | 敌方同轮廓变体（去饱和压暗 + 红眼） |
| `<职业>-<阶>.png` | 16×16 原始像素（备查） |

职业键：`none`（白板）、`tank`、`blade`、`shot`、`hex`、`care`；阶 `1..4`。
例：`tank-4@4x.png` = 堡垒鼠，`shot-2-foe@4x.png` = 抛壳鼠。

### 敌方贴图

敌方在 rt/tessera/picks/foe-<type>-<tier>@4x.png（type = crate / shell / thief / boss / glue，tier 1–4），
由 python tools\tessera\gen.py --foes 生成、python tools\tessera\pickfoe.py --set ... 挑选。
游戏查询顺序：oe-<type>-<tier> → <cls>-<tier>-foe（我方换色）→ <cls>-<tier>，缺图会自动退回。

### 手改一张（最直接）

1. 用 Aseprite / Photoshop 按 **16×16 网格**画（或直接改 64×64，但保持 4 倍像素块对齐）。
2. 覆盖对应文件，透明底保留。
3. `node tools/compose.mjs` → `game_studio_build`：构建时会把 32 张全部 base64 注进 `game.js`（`window.UNIT_ART`）。
4. 敌方变体：改完我方后跑一次
   ```powershell
   python tools\tessera\pick.py
   ```
   它会用同一套轮廓自动生成 `-foe` 版本（去饱和 + 压暗 + 眼睛转红）。

### 重新生成一批（模型出图）

```powershell
# 16 形态 × 8 候选，出对照表
python tools\tessera\gen.py --forms --count 8

# 看图挑：art/tessera/forms/_sheet.png（16 行 × 8 列）
# 按顺序填 16 个序号（1 起），生成 picks/
python tools\tessera\pick.py --set 3,4,7,3,8,4,5,3,3,4,6,4,4,4,5,3
```

想换提示词：改 `tools/tessera/gen.py` 里的 `FORMS` 列表（每条 ≤24 token 最稳）。

### 尺寸与像素感

`game.json` → `rules`：

| 键 | 作用 |
|---|---|
| `unitSize` | 精灵显示尺寸，16 的整数倍：**32**（默认 16×2）/ 48 / 64 |
| `artPixelScale` | 没贴图时的矢量绘制像素化倍率（2 = 32 网格；1 = 关掉回矢量） |

改 `unitSize` 后站位间距、交战距离会自动跟着变（`pitch = 0.82×`、`reach = 1.1×`）。

---

## 常用命令速查

```powershell
node tools/compose.mjs            # 分层源码 → game.js（改完 rpg.js / shop.js 必须跑）
node tools/detcheck.mjs           # 数值回归：胜率 / 均伤 / 卡死
node tools/rtcheck.mjs 1 3 2      # 实时胜率：关卡 1、3 局、2 只鼠
node tools/stage2d.mjs            # 打印双方 (x,y) 与缩放
node tools/_geom.mjs              # 打印舞台盒与地面矩形
python tools\pixelbg.py --scale 4 # 重画背景
python tools\tessera\pick.py      # 重出我方 + 敌方变体
```

改完记得 `game_studio_build`，再 `game_studio_export` 出单文件 HTML。
