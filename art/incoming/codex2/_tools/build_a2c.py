#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_a2c.py — A2c「硬像素」路线：固定调色板塌色，不做中值、不做 16+ 色量化。

用法：
  python build_a2c.py                 # 出 7 色版与 8 色版各一张，供挑
  python build_a2c.py --adopt 8       # 把 8 色版定为 idle-1.png
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as P  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# 用户指定的 6 色
CORE = {
    "fur":     (0x8a, 0x8f, 0x96),
    "belly":   (0xc4, 0xc7, 0xcd),
    "ear":     (0xf0, 0x9c, 0xa8),
    "dyn":     (0xc8, 0x34, 0x2a),
    "fuse":    (0xe8, 0xc1, 0x4a),
    "outline": (0x3a, 0x24, 0x1e),
}
WHITE = (0xff, 0xf8, 0xee)        # 眼白高光（第 5 条要求）
EYE_RED = (0xe8, 0x40, 0x2c)      # 第 5 条要求「red eye」，与炸药红区分

PAL_7 = list(CORE.values()) + [WHITE]
PAL_8 = list(CORE.values()) + [WHITE, EYE_RED]

CHAR_H = 50


def build(tier: int, palette: list, tag: str) -> dict:
    d = ROOT / f"A2c-foe-blast-{tier}"
    src = d / "raw" / "idle-1.png"
    if not src.exists():
        raise SystemExit(f"缺原图 {src}")
    out = d / f"idle-1.{tag}.png"
    info = P.process(src, out, size=64, mode="char", foot=61, colors=24,
                     palette="enemy", char_h=CHAR_H, snap_tol=0, outline_w=1,
                     denoise=0, white_thresh=0, fixed_palette=palette)
    info["tag"] = tag
    info["palette"] = len(palette)
    return info


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", type=int, default=2)
    ap.add_argument("--adopt", type=int, default=None, help="把该色数版本定为 idle-1.png")
    args = ap.parse_args()

    for tag, pal in (("7c", PAL_7), ("8c", PAL_8)):
        info = build(args.tier, pal, tag)
        print(f"{tag}: {info['size']} colors={info['colors']} cov={info['coverage']}% "
              f"foot={info['foot_row']} cx={info['cx']} bbox={info['bbox']}")

    if args.adopt:
        tag = f"{args.adopt}c"
        d = ROOT / f"A2c-foe-blast-{args.tier}"
        (d / "idle-1.png").write_bytes((d / f"idle-1.{tag}.png").read_bytes())
        print(f"adopted idle-1.{tag}.png -> idle-1.png")


if __name__ == "__main__":
    main()
