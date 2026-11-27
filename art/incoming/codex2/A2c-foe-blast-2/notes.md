# A2c · 引信鼠「硬像素」版（foe-blast 1–4 阶）— 20 帧完整

> 起因：用户否了 A2b 的观感——「全糊到一起了」。诊断结论不是体型/朝向，而是**像素不干净**：
> 眼睛糊成一坨、脸是灰雾、没有硬描边。A2b 的原图本身没有 2px 硬边特征，降采样后中间调全留着。
> A2c 改为**提示词逐条写死硬像素 + 后处理直接塌成固定色**，用户已确认风格通过。

## 产出（20 帧完整）

四阶 × 5 帧，全部 64×64、身高 50px、2px 描边、7–8 色、alpha 仅 0/255。

| 阶 | idle-1 | idle-2 | windup | strike | hop-air |
|---|---|---|---|---|---|
| 1 | 35.3% | 35.0% | 41.7% | 37.6% | 32.9% **y52** |
| 2 | 30.3% | 30.8% | 34.3% | 31.9% | 29.6% **y52** |
| 3 | 36.5% | 36.1% | 39.8% | 39.6% | 32.8% **y52** |
| 4 | 36.0% | 37.4% | 38.5% | 40.9% | 30.5% **y52** |

脚底 y=61（`hop-air` y=52）、cx=31.5–32.0。`validate.py`：**20/20 OK**（全库 110/110）。

## 用户已确认的两个取舍

1. **描边 2px**：`32×32 grid, every pixel as a 2×2 block` ⇒ 网格里 1 pixel = 画布上 2px。
2. **8 色**：6 色 + 白 `#fff8ee`（眼白/牙齿）+ 亮红 `#e8402c`（眼睛，与炸药暗红区分）。

## 第三轮改动（用户逐条点名）

| 项 | 问题 | 改法 |
|---|---|---|
| T2 的嘴 | 粉鼻下留着一个深棕「⊥」 | 加 `WARNING` 段：鼻子与白牙之间只许浅灰，禁止任何深色标记；重出 |
| 炸药朝向 | T2 是竖向两根，其余横向 | 改成 `lying HORIZONTALLY, one directly above the other, stacked like two short logs`，并写 `NOT standing upright, NOT vertical` |
| T4 的引信 | 顶部一条黄色横条，像「金色封条」 | 改成 `SHORT VERTICAL STICK: a narrow 2-block-wide upright column of yellow`，并写 `NOT a horizontal yellow band, NOT a gold seal` |

## 剩余 16 帧的做法

沿用已验证流程：**逐帧单独生成 + 以本阶 `raw/idle-1.png` 为锚点图**（每轮同时挂 `foe-shell-2/idle1.png` 定风格）。
提示词由 `make_a2c_frame_prompts.py` 从一份模板生成 16 份，模板里含：

- 7 条硬像素规则（32×32 网格 / 每格 2×2 / 平面色 / 1 格描边 / 2×2 红眼含 1px 白高光 / 不许小于 2×2 的细节 / 只借参考的描边与平涂）
- `=== DO NOT BREAK THE SHAPE ===`：头保持同直径圆形、身体不压扁、高度变化 ≤10%、耳朵不变形
- `=== THE MUZZLE ===`：只许粉鼻 + 两颗白牙，禁止深色嘴形
- `=== THE TAIL ===`：2/3 大小、根部贴屁股、尾尖离右边界 ≥3 格
- 按帧的姿态描述；`strike` 额外要求"闭嘴、耳朵不变形、不压扁、引信火花更大更亮"

## 提示词索引

| 文件 | 用途 |
|---|---|
| `p_A2c_idle_T{1..4}.txt` | 四阶 idle-1 初版 |
| `p_A2c_idle_T2c.txt` | T2 修正版（横向炸药 + 禁深棕嘴形）——**采用** |
| `p_A2c_idle_T4c.txt` | T4 修正版（竖火苗引信）——**采用** |
| `p_A2c_{frame}_T{tier}.txt` | 16 帧（`make_a2c_frame_prompts.py` 生成） |

## 后处理

`_tools/build_a2c_all.py`：固定 8 色塌色 → alpha 二值化 → 2px 描边 → 锚定。
关中值、跳过量化（`pipeline.quantize_fixed()` 把每个像素直接塌到调色板最近色，中间调全消失）。

## 已知问题（未修，供验收判断）

1. **引信长度在四阶之间不统一**：T1 的引信短、位于炸药右侧；T3/T4 的引信是竖条，从炸药顶一直延伸到胸口上方，观感偏长。提示词里加了「最多 2 格高、火花点紧贴炸药顶」的限制，但模型没有完全遵守。
2. **T3/T4 的 `action-windup` 眼睛偏「怒」**：红色变成斜条状，与 anchor 的 2×2 圆红眼不一致。
3. **T4 的 `action-windup`/`action-strike` 覆盖 38–41%**：炸药包本来就大，蹲伏时体块重叠更多。
4. `action-strike` 的前倾在 64px 下不明显（前倾 15° 只体现为重心的轻微偏移），动感需要靠位移/特效补。

## 对照表

- `_tools/sheet-A2c.png` — **4 阶 × 5 帧完整表**
- `_tools/sheet-A2c-idle-10x.png` — 参考 + 四阶 idle-1，10 倍
- `_tools/sheet-A2c-outline.png` — 参考 / 1px / 2px 描边对比

## 版本备份

每阶 `_candidates/` 下有 `idle-1.v1.png`（第一版）与 `raw-idle-1.v1.png`；
T2 另有 `idle-1.7c.png`（严格 7 色）与 `idle-1.8c.png`（1px 描边）两个候选。
