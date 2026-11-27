"""生成舞台背景（像素风车间地面），输出 assets/stage_bg.png。

    python tools/pixelbg.py            # 165×84 逻辑像素，×4 → 660×336

纯 Pillow 逐像素画，不依赖任何模型：省包体、可控、可复现。
画面分三层：后墙（上）→ 金属地板（中下）→ 四周暗角；中间留空给角色站位。
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "stage_bg.png"

W, H = 165, 84

# 封闭调色板：深紫底 + 冷灰金属 + 暖琥珀灯
DARK0 = (18, 14, 26)
DARK1 = (28, 22, 40)
DARK2 = (40, 32, 56)
WALL = (34, 27, 48)
WALL_HI = (46, 37, 62)
MET0 = (46, 42, 58)     # 地板最暗
MET1 = (58, 53, 70)     # 地板
MET2 = (70, 64, 84)     # 地板亮
MET3 = (86, 79, 100)    # 地板高光/铆钉
STEEL = (74, 78, 96)
STEEL_HI = (102, 106, 126)
AMBER = (232, 172, 80)
AMBER_HI = (255, 217, 138)
WOOD = (110, 74, 52)
WOOD_HI = (140, 100, 68)


def make(scale: int, seed: int) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new("RGB", (W, H), DARK0)
    d = ImageDraw.Draw(img)

    horizon = 13

    # ---- 后墙 ----
    d.rectangle([0, 0, W, horizon], fill=WALL)
    d.rectangle([0, horizon - 1, W, horizon], fill=WALL_HI)
    for lx in range(16, W, 36):
        d.rectangle([lx, 3, lx + 7, 4], fill=AMBER)
        d.rectangle([lx + 1, 5, lx + 6, 6], fill=AMBER_HI)
        # 灯光往下洒一小片
        for i in range(3):
            d.line([(lx + 1 + i, horizon + 1), (lx + 1 + i, horizon + 4 + i)],
                   fill=(52 + i * 4, 46 + i * 3, 62))

    # ---- 金属地板：两行大钢板 + 细缝 ----
    plate_h = (H - horizon) // 3
    row = 0
    for y in range(horizon, H, plate_h):
        base = MET1 if row % 2 == 0 else MET0
        d.rectangle([0, y, W, H], fill=base)
        d.line([(0, y), (W, y)], fill=DARK0)
        # 每块板之间的竖缝（错开）
        off = 0 if row % 2 == 0 else 30
        for x in range(off, W, 60):
            d.line([(x, y), (x, min(H, y + plate_h))], fill=DARK0)
            # 铆钉
            d.point((x + 2, y + 2), fill=MET3)
            d.point((x + 2, y + plate_h - 2), fill=MET3)
        row += 1

    # 中间一块暖光（顶灯照亮的地面），让角色站位区更亮一点
    cx, cy = W // 2, horizon + (H - horizon) // 2
    for r in range(30, 6, -6):
        shade = tuple(int(c0 + (c1 - c0) * (1 - r / 30) * 0.55)
                      for c0, c1 in zip(MET1, MET3))
        d.ellipse([cx - r, cy - r * 0.5, cx + r, cy + r * 0.5], outline=shade)
    d.ellipse([cx - 8, cy - 5, cx + 8, cy + 4], fill=MET2)

    # ---- 左侧传送带 + 木箱 ----
    belt_y = horizon + 18
    d.rectangle([0, belt_y, 36, belt_y + 11], fill=STEEL)
    d.rectangle([0, belt_y + 2, 36, belt_y + 8], fill=STEEL_HI)
    for bx in range(2, 36, 6):
        d.rectangle([bx, belt_y + 4, bx + 3, belt_y + 6], fill=MET3)
    for cxx, cyy, cw, ch in ((3, belt_y - 10, 13, 10), (21, belt_y - 8, 11, 8)):
        d.rectangle([cxx, cyy, cxx + cw, cyy + ch], fill=WOOD)
        d.rectangle([cxx, cyy, cxx + cw, cyy + 1], fill=WOOD_HI)
        d.line([(cxx + cw // 2, cyy), (cxx + cw // 2, cyy + ch)], fill=WOOD_HI)
    # 传送带支脚
    d.rectangle([6, belt_y + 11, 9, belt_y + 16], fill=DARK1)
    d.rectangle([26, belt_y + 11, 29, belt_y + 16], fill=DARK1)

    # ---- 右侧管道 + 漏斗 ----
    d.rectangle([W - 14, horizon + 2, W - 8, H - 10], fill=STEEL)
    d.rectangle([W - 13, horizon + 2, W - 11, H - 10], fill=STEEL_HI)
    d.rectangle([W - 26, horizon + 26, W - 14, horizon + 31], fill=STEEL)
    d.rectangle([W - 24, horizon + 31, W - 16, horizon + 39], fill=DARK2)
    d.point((W - 20, horizon + 40), fill=AMBER)

    # ---- 地面零星小件 ----
    for _ in range(10):
        px = rng.randrange(44, W - 34)
        py = rng.randrange(horizon + 8, H - 6)
        d.point((px, py), fill=rng.choice([MET3, MET2, AMBER_HI]))

    # ---- 暗角（逐层收边） ----
    for i in range(7):
        k = i / 7
        shade = tuple(int(c * (1 - (0.10 + 0.12 * k))) for c in DARK0)
        d.rectangle([i, i, W - 1 - i, H - 1 - i], outline=shade)

    return img.resize((W * scale, H * scale), Image.NEAREST)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()
    img = make(args.scale, args.seed)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"{OUT}  {img.width}x{img.height}  {OUT.stat().st_size} B")


if __name__ == "__main__":
    main()
