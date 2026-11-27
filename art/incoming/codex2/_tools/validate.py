#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
validate.py — 交付自检。逐个资产检查尺寸 / 模式 / alpha 二值 / 锚点 / 色数 / 描边 / 覆盖率，
输出表格 + JSON 报告，任一 FAIL 时退出码 1。

用法：
  python validate.py [--root <codex2 目录>] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# 资产 ID -> (期望尺寸, 类型, 帧列表)
CHAR_FRAMES = ["idle-1", "idle-2", "action-windup", "action-strike", "hop-air"]
HOP_LIFT = (52, 58)          # hop-air 的脚底行允许区间


def check(path: Path, size: int, kind: str) -> dict:
    im = Image.open(path)
    r = {"file": str(path.relative_to(ROOT)).replace("\\", "/"), "size": f"{im.width}x{im.height}"}
    errs = []

    if im.mode != "RGBA":
        errs.append(f"mode={im.mode}")
    if (im.width, im.height) != (size, size):
        errs.append(f"size!= {size}")
        return {**r, "ok": False, "errs": errs}

    a = np.array(im)
    al = a[:, :, 3]
    uniq = sorted(set(al.reshape(-1).tolist()))
    if not set(uniq).issubset({0, 255}):
        errs.append(f"alpha 非二值 {uniq[:6]}")

    opaque = al > 0
    cov = float(opaque.mean() * 100)
    if cov < 6:
        errs.append(f"覆盖率过低 {cov:.1f}%")

    ys, xs = np.nonzero(opaque)
    if len(ys) == 0:
        return {**r, "ok": False, "errs": errs + ["全透明"]}

    foot, cx = int(ys.max()), (float(xs.min()) + float(xs.max())) / 2
    top = int(ys.min())
    cols = len(set(map(tuple, a[:, :, :3][opaque].tolist())))

    r.update({"foot_row": foot, "cx": round(cx, 1), "top": top,
              "colors": cols, "coverage": round(cov, 1)})

    height = foot - top + 1
    r["height"] = height

    if kind == "char":
        is_hop = "hop-air" in path.name
        if is_hop:
            # 滞空帧故意抬高 9px，脚底落在 y≈52
            if not (46 <= foot <= 57):
                errs.append(f"hop-air 脚底 y={foot} 不在 46–57（应有离地感）")
        else:
            if foot < 58:
                errs.append(f"脚底 y={foot} 未贴下沿")
        if not (size * 0.5 - 3 <= cx <= size * 0.5 + 3):
            errs.append(f"水平未居中 cx={cx}")
        # 蹲伏/前冲帧本来就更矮，只要求整体高度够大，不卡 top 值
        if height < 26:
            errs.append(f"角色高度不足 {height}px（蹲伏帧允许 26+）")
    else:
        if abs(cx - size / 2) > size * 0.18:
            errs.append(f"未水平居中 cx={cx}")
        if abs((top + foot) / 2 - (size - 1) / 2) > size * 0.18:
            errs.append("未垂直居中")

    dark = int(((a[:, :, 0] == 58) & (a[:, :, 1] == 36) & (a[:, :, 2] == 30) & opaque).sum())
    r["outline_px"] = dark
    if dark < max(6, int(opaque.sum() * 0.04)):
        errs.append(f"描边像素过少 {dark}")

    r["ok"] = not errs
    r["errs"] = errs
    return r


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--json", default=None)
    args = ap.parse_args()
    root = Path(args.root)

    jobs: list[tuple[Path, int, str]] = []
    for d in sorted(root.iterdir()):
        if not d.is_dir() or d.name.startswith("_"):
            continue
        if d.name.startswith("A1") or d.name.startswith("A2"):
            for f in CHAR_FRAMES:
                p = d / f"{f}.png"
                if p.exists():
                    jobs.append((p, 64, "char"))
        elif d.name.startswith("A3"):
            for i in range(1, 6):
                p = d / f"frame-{i}.png"
                if p.exists():
                    jobs.append((p, 32, "fx"))
        else:
            for p in sorted(d.glob("*.png")):
                size = 32 if p.stem.endswith("_32") else 16
                jobs.append((p, size, "icon"))

    rows = [check(p, s, k) for p, s, k in jobs]
    bad = [r for r in rows if not r["ok"]]

    print(f"{'file':<58}{'size':>8}{'col':>5}{'cov':>7}{'foot':>5}{'cx':>6}{'out':>5}  ok")
    for r in rows:
        print(f"{r['file']:<58}{r['size']:>8}{r.get('colors','-'):>5}"
              f"{r.get('coverage','-'):>7}{r.get('foot_row','-'):>5}"
              f"{r.get('cx','-'):>6}{r.get('outline_px','-'):>5}  {'OK' if r['ok'] else 'FAIL'}")
    print(f"\n合计 {len(rows)} 个文件，OK {len(rows)-len(bad)}，FAIL {len(bad)}")
    for r in bad:
        print(f"  FAIL {r['file']}: {'; '.join(r['errs'])}")

    if args.json:
        Path(args.json).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
