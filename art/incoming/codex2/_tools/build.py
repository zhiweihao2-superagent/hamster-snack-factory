#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build.py — 把 <资产ID>/raw/*.png 批量过 pipeline，生成交付用的最终 PNG。

  A1-*       64x64  我方（朝右）   5 帧，脚底 y=61（hop-air 抬到 y=52）
  A2-*       64x64  敌方（朝左）   5 帧，同锚点
  A3-*       32x32  fx             5 帧，居中
  B1/B2/B3   16x16 + 32x32 图标    居中

用法：
  python build.py            # 全部重建
  python build.py --only A1  # 只重建某个前缀
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as P  # noqa: E402

CHAR_FRAMES = ["idle-1", "idle-2", "action-windup", "action-strike", "hop-air"]
# 细高图标缩到 16px 时主体只剩几像素，改用方框取景把主体撑满画布（cy, side_frac）
ICON_CROPS = {
    "xingyun": (0.42, 0.92),
}

FOOT_DEFAULT = 61
FOOT_HOP = 52          # hop-air 故意抬高 9px，画面里才有离地感


def assets(root: Path) -> list[dict]:
    out = []
    for d in sorted(root.iterdir()):
        if not d.is_dir() or d.name.startswith("_"):
            continue
        if d.name.startswith("A1"):
            out.append(dict(dir=d, kind="char", size=64, palette="ally",
                            frames=[(f, FOOT_HOP if f == "hop-air" else FOOT_DEFAULT, f) for f in CHAR_FRAMES]))
        elif d.name.startswith("A2"):
            out.append(dict(dir=d, kind="char", size=64, palette="enemy",
                            frames=[(f, FOOT_HOP if f == "hop-air" else FOOT_DEFAULT, f) for f in CHAR_FRAMES]))
        elif d.name.startswith("A3"):
            out.append(dict(dir=d, kind="fx", size=32, palette="fx",
                            frames=[(f"frame-{i}", 0, f"frame-{i}") for i in range(1, 6)]))
        else:
            out.append(dict(dir=d, kind="icon", size=16, palette="ally", frames=None))
    return out


def crop_size(src: Path) -> tuple[int, int]:
    """原图按 alpha 裁边后的宽高，用来给整组动画定一个统一缩放倍率。"""
    import numpy as np
    from PIL import Image
    arr = P.cutout_background(np.array(Image.open(src).convert("RGBA")))
    x0, y0, x1, y1 = P.robust_bbox(arr)
    return max(1, x1 - x0), max(1, y1 - y0)


def group_char_h(raws: Path, frames: list, target_h: int = 52, max_w: int = 62) -> int:
    """按 idle-1 定标：整组共用"目标高度"，超宽时整组等比降一档。
    现网 art/frames 的 5 帧高度稳定在 47–55；逐帧单独适配会让蹲伏/前冲帧缩水。"""
    ref = raws / f"{frames[0][0]}.png"
    if not ref.exists():
        return target_h
    _, h0 = crop_size(ref)
    scale = target_h / h0
    widest = 0
    for stem, _, _ in frames:
        p = raws / f"{stem}.png"
        if not p.exists():
            continue
        w, h = crop_size(p)
        widest = max(widest, w * scale)
    if widest > max_w:
        scale *= max_w / widest
    return max(8, int(round(h0 * scale)))


def group_key(name: str) -> str:
    """同一个角色跨资产共用缩放倍率：四个阶段的引信鼠是同一只鼠，必须同高。"""
    if name.startswith("A2b"):
        return "A2b"              # 重画版，单独一组，锁 50px
    if name.startswith("A2"):
        return "A2"
    return name


# 组目标身高 / 宽度上限。A2b 按用户要求锁 50px、不为单帧压整组（max_w 极大 → 走裁剪兜底）
GROUP_TARGET_H = {"A2b": 50, "A2": 48}
GROUP_MAX_W = {"A2b": 9999}


def group_char_h_multi(raws_list: list[tuple[Path, list]], target_h: int = 50,
                       max_w: int = 64) -> int:
    """按整组（可能跨多个目录）的 idle-1 定标，取最宽的帧压进画布宽度。"""
    h0 = None
    widest = 0.0
    for raws, frames in raws_list:
        ref = raws / f"{frames[0][0]}.png"
        if not ref.exists():
            continue
        _, hh = crop_size(ref)
        if h0 is None:
            h0 = hh
        scale = target_h / hh
        for stem, _, _ in frames:
            p = raws / f"{stem}.png"
            if p.exists():
                w, _ = crop_size(p)
                widest = max(widest, w * scale)
    if not h0:
        return target_h
    scale = target_h / h0
    if widest > max_w:
        scale *= max_w / widest
    return max(8, int(round(h0 * scale)))


def build_one(src: Path, dst: Path, size: int, kind: str, palette: str, foot: int,
              char_h: int | None = None) -> dict:
    icrop = ICON_CROPS.get(src.stem) if kind == "icon" else None
    if kind == "char":
        # 引信鼠是灰毛 + 细肢，降采样后麻点最重，角色帧统一走 3×3 中值
        dn = 3 if "foe-blast" in str(src) else 0
        return P.process(src, dst, size=size, mode="char", foot=foot,
                         colors=24, palette=palette, char_h=char_h, snap_tol=10, outline_w=1,
                         denoise=dn)
    return P.process(src, dst, size=size, mode=kind, foot=0,
                     colors=20, palette=palette, char_h=None, snap_tol=10, outline_w=1,
                     icon_crop=icrop)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--only", default=None)
    args = ap.parse_args()
    root = Path(args.root)

    results, missing = [], []
    specs = [s for s in assets(root)
             if not (args.only and not s["dir"].name.startswith(args.only))]

    # 角色：先按"角色组"统一算高度，再逐帧出图
    char_groups: dict[str, list[tuple[Path, list]]] = {}
    for spec in specs:
        if spec["kind"] != "char":
            continue
        raws = spec["dir"] / "raw"
        if raws.exists():
            char_groups.setdefault(group_key(spec["dir"].name), []).append((raws, spec["frames"]))
    group_h = {k: group_char_h_multi(v,
                                     target_h=GROUP_TARGET_H.get(k, 52),
                                     max_w=GROUP_MAX_W.get(k, 64))
               for k, v in char_groups.items()}
    for k, v in group_h.items():
        print(f"[角色组 {k}] 统一高度 {v}px")

    for spec in specs:
        raws = spec["dir"] / "raw"
        if not raws.exists():
            missing.append(spec["dir"].name)
            continue

        if spec["frames"] is not None:
            ch = group_h.get(group_key(spec["dir"].name)) if spec["kind"] == "char" else None
            for stem, foot, outname in spec["frames"]:
                src = raws / f"{stem}.png"
                if not src.exists():
                    missing.append(f"{spec['dir'].name}/{stem}")
                    continue
                results.append(build_one(src, spec["dir"] / f"{outname}.png",
                                         spec["size"], spec["kind"], spec["palette"], foot,
                                         char_h=ch))
        else:
            for src in sorted(raws.glob("*.png")):
                results.append(build_one(src, spec["dir"] / src.name,
                                         spec["size"], spec["kind"], spec["palette"], 0))
                # 图标另出 32x32 版
                big = spec["dir"] / f"{src.stem}_32.png"
                results.append(build_one(src, big, 32, spec["kind"], spec["palette"], 0))

    for r in results:
        print(f"{r['file']:<28}{r['size']:>8} cols={r['colors']:<3} cov={r['coverage']:<5} foot={r['foot_row']:<4} cx={r['cx']}")
    print(f"\n生成 {len(results)} 个；缺原图 {len(missing)}")
    if missing:
        print("  缺:", ", ".join(missing))
    print(json.dumps({"built": len(results), "missing": missing}, ensure_ascii=False))


if __name__ == "__main__":
    main()
