# MANIFEST — art/incoming/codex（Codex CLI 产出）

生成工具：本机 **Codex CLI codex-cli 0.149.0**，非交互调用
`cmd /c "codex exec -C <本目录> --skip-git-repo-check -s workspace-write --color never - < 提示词"`
（PowerShell 直接调 `codex` 被执行策略拦，全部走 `cmd /c`；未进入 REPL）。

**注意**：Codex CLI 是代码代理、不是图像模型 —— 这里的每一张 PNG 都是 Codex 写出的
**确定性像素绘制脚本**（`gen_a1.py` / `gen_a2.py` / `gen_a3.py` / `gen_b1.py`）渲染出来的：
32×32（图标 16×16）ASCII 像素地图 → 最近邻放大 → 自动脚底/居中对齐 → 二值 alpha 落盘。
因此**没有 seed**（重跑结果逐像素一致），提示词全文在 `_tools/p_*.txt`，每个资产另有 `notes.md`。

校验脚本：`_tools/validate_art.py`（尺寸 / mode RGBA / alpha 仅 0-255 / 脚底行 / 居中 /
轮廓 `#3a241e` 像素数 / 连通体数量 / 覆盖率）。**最终全量复核：52 个文件 OK，0 FAIL。**

## 清单

| 资产 ID | 文件数 | 尺寸 | 校验结果 | 状态 |
|---|---|---|---|---|
| `none-1`（A1 白板鼠，我方朝右） | 5 | 64×64 | OK 5/5：RGBA、二值 alpha、脚底 y=61（hop-air y=51）、居中 32±3、轮廓 452–532px、单连通体 | ✅ 完成 |
| `foe-blast-1`（A2 引信鼠 1 阶，敌方朝左） | 5 | 64×64 | OK 5/5：同上，轮廓 556–660px、色数 12 | ✅ 完成 |
| `foe-blast-2`（A2 引信鼠 2 阶） | 5 | 64×64 | OK 5/5：轮廓 556–660px、色数 12 | ✅ 完成 |
| `foe-blast-3`（A2 引信鼠 3 阶） | 5 | 64×64 | OK 5/5：轮廓 632–740px、色数 12 | ✅ 完成 |
| `foe-blast-4`（A2 引信鼠 4 阶） | 5 | 64×64 | OK 5/5：轮廓 672–772px、色数 12 | ✅ 完成 |
| `fx-blast`（A3 爆炸/引信特效） | 5 | 32×32（原生，未放大） | OK 5/5：RGBA、二值 alpha、居中 ±4px、覆盖率 12.7%–58.2% | ✅ 完成 |
| `icons/*`（B1 技能图标 11 个 × 2 档） | 22 | 16×16 + 32×32 | OK 22/22：RGBA、二值 alpha、居中、覆盖率 28.9%–54.7%、单连通体 | ✅ 完成 |
| **合计** | **52** | — | **52 OK / 0 FAIL** | — |

## 文件命名

- 多帧角色（5 帧，与 `docs/ART-TODO.md` 第三节一致）：
  `<资产ID>/idle-1.png  idle-2.png  action-windup.png  action-strike.png  hop-air.png`
- 特效帧：`fx-blast/frame-1.png … frame-5.png`（顺序：点火 → 爆闪 → 火球 → 冲击环 → 余烟）
- 图标：`icons/<key>.png`（16×16）+ `icons/<key>_32.png`（16×16 的最近邻 ×2）
- 每个资产目录内 `notes.md`：提示词出处、挑帧说明、已知问题

## 接入提示（给主 agent）

- 多帧角色目录名已经就是资产 ID（`none-1`、`foe-blast-1..4`），按现有流水线
  `art/frames/<key>/` 的命名规则搬运即可（注意本目录用 `idle-1`，仓库现网 `art/frames/*` 用 `idle1`，
  搬运时改名）。
- 图标 key 与中文名对照见 `icons/notes.md`；`game.js` 里目前还没有这 11 个技能的数据表，
  key 是本次新定的语义名，需要主 agent 决定映射。
- `art/tessera/picks/<key>@4x.png` 需要 64×64 版本时，用 `icons/<key>_32.png` 再做一次最近邻 ×2 即可
  （或直接用 `icons/<key>_32.png` 命名 `@4x`）。

## 未做（超出本次 P0→P1 指令范围）

`A4 职业纹章`、`B2 天赋图标`、`B3 道具/转职证图标`、`B4 敌方预警图标`、`B5 关卡背景`、P2 全部。
本次只按要求做了 A1 / A2 / A3 / B1。

## 本目录结构

```
art/incoming/codex/
├─ MANIFEST.md                  ← 本文件
├─ gen_a1.py  gen_a2.py  gen_a3.py  gen_b1.py    ← Codex 产出的生成脚本（可重跑复现）
├─ none-1/            5 png + notes.md
├─ foe-blast-1..4/    各 5 png + notes.md
├─ fx-blast/          5 png + notes.md
├─ icons/             22 png + notes.md
└─ _tools/            提示词原文 p_*.txt、validate_art.py、sheet.py、Codex 末条消息 last-*.txt、对照图 sheet-*.png
```

未改动仓库任何既有文件（`tools/`、`game.js`、`game.json`、`docs/`、`art/frames/`、`art/tessera/` 全部原样）。
