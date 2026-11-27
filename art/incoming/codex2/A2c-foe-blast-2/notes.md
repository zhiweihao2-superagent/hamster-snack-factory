# A2c · 引信鼠「硬像素」版（foe-blast 1–4 阶）— 当前只有 T2 的 idle-1

> 起因：用户否了 A2b 的观感——「全糊到一起了」。诊断结论不是体型/朝向，而是**像素不干净**：
> 眼睛糊成一坨、脸是灰雾、没有硬描边。A2b 的原图本身没有 2px 硬边特征，降采样后中间调全留着。
> A2c 改为**从提示词就要求硬像素 + 后处理直接塌成固定色**。

## 产出（当前）

| 文件 | 尺寸 | 色数 | 覆盖率 | 身高 | 描边 | 状态 |
|---|---|---|---|---|---|---|
| `A2c-foe-blast-2/idle-1.png` | 64×64 | 8 | 34.0% | 50px | 2px | ✅ 待确认 |

脚底 y=61、cx=32.0、alpha 仅 0/255。`validate.py`：OK。

候选（未采用，在 `_candidates/`）：
- `idle-1.7c.png` — 严格 6 色 + 白 = 7 色；炸药是暗红 `#c8342a`，但**眼睛也变成暗红**（不够亮）
- `idle-1.8c.png` — 同上但描边 1px（被否：偏细）
- `idle-1.8c-w2.png` — **采用版**（= `idle-1.png`）

## 关键决定：描边 2px

第 4 条写的是 `1-pixel dark brown outline`，但第 1 条同时要求 `32×32 grid, every pixel drawn as a 2×2 block`。
**32 格网格里的 1 pixel = 64px 画布上的 2px**。所以按 2px 落地，才是「1 像素描边」的第 7 条（copy the outline thickness of the reference）的真意。
1px 版留在 `_candidates/idle-1.8c.png`，想换回去直接覆盖即可。

## 关键决定：8 色（6 色 + 白 + 亮红眼）

用户第 3 条要 **exactly 6 colors**，第 5 条又要 **red eye + one white pixel**，两条自相矛盾。落地为：

| 槽位 | 色值 | 用途 |
|---|---|---|
| 1 | `#8a8f96` | 灰毛 |
| 2 | `#c4c7cd` | 肚子 / 吻部浅灰 |
| 3 | `#f09ca8` | 粉耳 / 粉爪 |
| 4 | `#c8342a` | 炸药红 |
| 5 | `#e8c14a` | 引信黄 |
| 6 | `#3a241e` | 描边 |
| 7 | `#fff8ee` | 眼睛高光（第 5 条明确要求） |
| 8 | `#e8402c` | 眼睛红（第 5 条 `red eye`，与炸药红区分） |

如果不许第 8 色，用 `_candidates/idle-1.7c.png`：炸药保持暗红，代价是**眼睛也变暗红**、红眼不醒目。

## 提示词

全文：`_tools/p_A2c_T2_idle.txt`。逐条硬约束（照用户给的 7 条 + 角色描述）：

1. `hard-edged pixel art on a 32x32 grid, every pixel drawn as a 2x2 block`
2. `flat colors only — NO gradients, NO shading, NO anti-aliasing, NO soft edges`
3. 固定 6 色（+ 眼白）
4. `1-pixel dark brown outline #3a241e`（在 32 格网格里 = 2px）
5. `eyes: 2x2 solid red block with exactly one white pixel as highlight, clearly separated from the head outline`
6. `no fine details smaller than 2x2 pixels` —— 最关键的一条，明确禁掉 1px 的牙/爪/胡须/腮红/毛丝
7. `copy the outline thickness and flat-color style of the reference, not its pose`

参考图：`art/frames/foe-shell-2/idle1.png`。

## 后处理（`_tools/build_a2c.py`）

按用户要求，与 A2b 的做法不同：

| 步骤 | A2b | **A2c** |
|---|---|---|
| 中值滤波 | 关 | **关** |
| 量化 | MEDIANCUT 24 色 + 吸附 | **固定调色板最近色塌色**（`quantize_fixed`） |
| 描边 | `enforce_outline` 1px | `enforce_outline` **2px** |
| alpha | 二值化 | 二值化 |

新增 `pipeline.quantize_fixed()`：把每个不透明像素直接映射到调色板里最近的一色，
原图的抗锯齿中间调因此被**全部塌成平面色**，边缘自然变硬——这是「不糊」的关键。

## 已知问题

1. **尾巴偏大**：原图尾巴占了右侧约 1/4 宽度，接入后会让角色显宽。若要收小需要重出原图。
2. **嘴部是一个深棕「⊥」形**（鼻+嘴合并），不如 `foe-shell-2` 的「粉鼻+白牙」清楚。这是第 6 条「不许小于 2×2 的细节」的必然结果。
3. 头部与身体的交界处没有内部描边分隔（参考有），剪影略平。
4. 8 色版里炸药被映射成亮红 `#e8402c`（与眼睛同色），暗红 `#c8342a` 只剩 7 个像素——因为原图炸药像素更接近亮红。想严格保留暗红炸药请用 7 色候选版。

## 对照表

- `_tools/sheet-A2c-10x.png` — foe-shell-2 / A2b（否） / A2c（新）十眼对比
- `_tools/sheet-A2c-4x.png` — 同上的 4× 版
- `_tools/sheet-A2c-outline.png` — 参考 / 1px 描边 / 2px 描边 三者对比
