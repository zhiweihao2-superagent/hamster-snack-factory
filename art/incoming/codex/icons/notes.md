# 技能图标 11 个 — 美术说明

## 来源
- 生成方式：本机 Codex CLI（codex-cli 0.149.0），非交互 `codex exec -` 读 stdin 提示词。
- 提示词：初稿 `../_tools/p_b1_v1.txt`，可读性修正 `../_tools/p_b1_v2.txt`（drill / lucky / pierce 重画），
  浮点清理 `../_tools/p_b1_v3.txt`
- 生成脚本：`../gen_b1.py`（**确定性代码绘制，无 seed**，重跑一致）
- 复现：`python ../gen_b1.py`

## 产物（16×16 + 32×32 两档，共 22 个文件）
| key | 中文 | 16×16 | 32×32 |
|---|---|---|---|
| `drill` | 冲击钻 | ✅ | ✅ |
| `sweep` | 横扫切削 | ✅ | ✅ |
| `pierce` | 穿甲钉 | ✅ | ✅ |
| `guillotine` | 断头台 | ✅ | ✅ |
| `fireball` | 火球术 | ✅ | ✅ |
| `frostnova` | 冰霜新星 | ✅ | ✅ |
| `chain` | 闪电链 | ✅ | ✅ |
| `butterarmor` | 黄油护甲 | ✅ | ✅ |
| `overtime` | 加班冲刺 | ✅ | ✅ |
| `lucky` | 幸运签 | ✅ | ✅ |
| `sugar` | 糖分补给 | ✅ | ✅ |

`<key>_32.png` 是 16×16 的**最近邻 ×2**，不是重新绘制，所以两档像素完全对应。

## 校验（`../_tools/validate_art.py icon 16 16` / `icon 32 32`）
- 尺寸 16×16 / 32×32、PNG、mode RGBA、alpha 仅 0/255
- 居中（x/y 偏差 ≤3px）、覆盖率 28.9%–54.7%、色数 4–7、轮廓 `#3a241e` 34–328px
- **单一连通体**：每个图标都是一块连着的形，没有孤立浮点

## key 命名说明
`docs/ART-TODO.md` 只给了中文名、没给 id，这里按拼音/英文语义定的 id，接进 `artFromMap` 时需要把
`drill / sweep / pierce / guillotine / fireball / frostnova / chain / butterarmor / overtime / lucky / sugar`
映射到实际技能 id（现仓库 `game.js` 里还没有这 11 个技能的数据表，只有"冲击钻"一条注释）。

## 已知问题 / 待人工决定
1. **`chain`（闪电链）只画了闪电本体**，没有画"链"（两个目标之间的电弧）—— 16×16 画不出两点之间的连接，只能靠闪电造型暗示。如果要表达"链"，建议改成"两个小节点 + 中间折线"。
2. `butterarmor`（黄油护甲）现在读作"黄油块放在金属板上"，不完全是"护甲"。要不要换成"盾牌 + 黄油涂层"？
3. `sweep`（横扫切削）是一道斜向刀刃弧，没有画"横扫"的轨迹残影；和 `guillotine` 的金属色接近，同屏可能混。
4. `drill`、`lucky`、`pierce` 是第二版重画的结果（第一版在 16px 下读不出来）；第二版可读，但仍不是"一眼认"级别。
5. 全套 11 个的用色是"金属灰 + 琥珀 + 各自强调色"，和仓库里现有的 `buff-*` / `gear-*` 图标（偏冷紫灰）**色调不完全一致**，同屏并排会有色差。
