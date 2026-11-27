#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_a2c_all.py — A2c「硬像素」全套：四阶 × 5 帧。

固定路线（用户已确认）：
  固定 8 色调色板塌色（不做量化、不做中值）→ alpha 二值化 → 2px 描边 → 脚底/居中锚定
  身高统一 50px；hop-air 脚底 y=52，其余 y=61。

用法：
  python build_a2c_all.py            # 全部（已存在的帧才处理）
  python build_a2c_all.py --frames idle-1
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as P  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CHAR_FRAMES = ["idle-1", "idle-2", "action-windup", "action-strike", "hop-air"]
FOOT_DEFAULT = 61
FOOT_HOP = 52
CHAR_H = 50

CORE = [(0x8a, 0x8f, 0x96), (0xc4, 0xc7, 0xcd), (0xf0, 0x9c, 0xa8),
        (0xc8, 0x34, 0x2a), (0xe8, 0xc1, 0x4a), (0x3a, 0x24, 0x1e)]
WHITE = (0xff, 0xf8, 0xee)
EYE_RED = (0xe8, 0x40, 0x2c)
PAL = CORE + [WHITE, EYE_RED]      # 8 色（用户确认）


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default=None, help="只处理这些帧，逗号分隔")
    ap.add_argument("--tiers", default="1,2,3,4")
    args = ap.parse_args()

    frames = args.frames.split(",") if args.frames else CHAR_FRAMES
    tiers = [int(t) for t in args.tiers.split(",")]

    done, missing = [], []
    for tier in tiers:
        d = ROOT / f"A2c-foe-blast-{tier}"
        raws = d / "raw"
        if not raws.exists():
            missing.append(f"T{tier} (no raw dir)")
            continue
        for f in frames:
            src = raws / f"{f}.png"
            if not src.exists():
                missing.append(f"T{tier}/{f}")
                continue
            foot = FOOT_HOP if f == "hop-air" else FOOT_DEFAULT
            info = P.process(src, d / f"{f}.png", size=64, mode="char", foot=foot,
                             colors=24, palette="enemy", char_h=CHAR_H, snap_tol=0,
                             outline_w=2, denoise=0, white_thresh=0, fixed_palette=PAL)
            done.append((tier, f, info))
            print(f"T{tier}/{f:<14} {info['size']} cols={info['colors']} "
                  f"cov={info['coverage']}% foot={info['foot_row']} cx={info['cx']}")

    print(f"\n生成 {len(done)} 张；缺原图 {len(missing)}")
    if missing:
        print("  缺:", ", ".join(missing))


if __name__ == "__main__":
    main()
