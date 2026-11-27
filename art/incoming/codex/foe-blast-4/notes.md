# foe-blast-4 引信鼠（4 阶）— 美术说明

## 来源
- 本机 Codex CLI（codex-cli 0.149.0）非交互生成；提示词 `../_tools/p_a2_v1.txt`，脚本 `../gen_a2.py`，**无 seed**（确定性重绘）。

## 产物（5 帧全部挑用）
`idle-1.png` / `idle-2.png` / `action-windup.png` / `action-strike.png` / `hop-air.png`

## 4 阶叠加内容
整件炸弹背心（环绕躯干一圈炸药）+ 肩带 + 发光红缝线 + 最大火花。

## 校验
`../_tools/validate_art.py char 64 64`（hop-air 用 `char_air`）全部 OK：64×64、RGBA、二值 alpha、脚底 y=61 / 腾空 y=51、居中、轮廓 `#3a241e` ≥24px、色数 12。

## 已知问题
1. 4 阶的红色已经占据躯干大部分面积，整体偏"红块"；如果游戏里要做"超载"变色，建议直接改调色板而不是加特效。
2. 肩带与轮廓 `#3a241e` 同色，容易和外形轮廓混在一起；远看剪影仍清楚，但内部结构会糊。
3. 与 1–3 阶共用姿势地图，动画可混用；建议 4 阶配 `../fx-blast/frame-3.png` 的自爆预警。
