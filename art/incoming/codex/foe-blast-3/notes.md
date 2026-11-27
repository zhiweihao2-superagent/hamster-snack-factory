# foe-blast-3 引信鼠（3 阶）— 美术说明

## 来源
- 本机 Codex CLI（codex-cli 0.149.0）非交互生成；提示词 `../_tools/p_a2_v1.txt`，脚本 `../gen_a2.py`，**无 seed**（确定性重绘）。

## 产物（5 帧全部挑用）
`idle-1.png` / `idle-2.png` / `action-windup.png` / `action-strike.png` / `hop-air.png`

## 3 阶叠加内容
三根炸药捆成一束 + 铆钉 + 更大火花 + 一颗裂牙（门牙处 1px 缺口）。

## 校验
`../_tools/validate_art.py char 64 64`（hop-air 用 `char_air`）全部 OK：64×64、RGBA、二值 alpha、脚底 y=61 / 腾空 y=51、居中、轮廓 `#3a241e` ≥24px、色数 12。

## 已知问题
1. 炸药束已经吃掉胸腹大面积，3 阶的"灰毛"只剩头部、四肢和尾巴可见 —— 若美术要强调"鼠"，可把炸药束收窄 1px。
2. 裂牙只有 1px 缺口，64px 下勉强能看出；要更明显需要把牙画大。
3. 姿势与 1/2 阶共用，动画可混用。
