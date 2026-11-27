# foe-blast-2 引信鼠（2 阶）— 美术说明

## 来源
- 本机 Codex CLI（codex-cli 0.149.0）非交互生成；提示词 `../_tools/p_a2_v1.txt`，脚本 `../gen_a2.py`，**无 seed**（确定性重绘）。
- 与 1–4 阶共用同一套 5 个姿势地图，仅通过 `decorate(grid, tier)` 叠加装备。

## 产物（5 帧全部挑用）
`idle-1.png` / `idle-2.png` / `action-windup.png` / `action-strike.png` / `hop-air.png`

## 2 阶叠加内容
两根炸药 + 胸口金属带 `#6e6e7d` + 引信加长（火花更大）。

## 校验
`../_tools/validate_art.py char 64 64`（hop-air 用 `char_air`）全部 OK：64×64、RGBA、二值 alpha、脚底 y=61 / 腾空 y=51、居中、轮廓 `#3a241e` ≥24px、色数 12。

## 已知问题
1. 与 1 阶的差别只在胸口中段，剪影宽度不变 —— 若关卡里同屏混排，2 阶靠"多一根炸药"辨识，远看偏弱。
2. 金属带压住了炸药高光，2 阶的红色比 1 阶略暗；如需更醒目可把 `R` 高光提亮一档。
3. 姿势、锚点与 1 阶完全一致，动画可直接混用。
