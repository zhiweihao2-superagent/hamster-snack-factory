#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
sheet.py — 生成对照表 _tools/sheet-*.png（4x 最近邻放大，深灰底），便于肉眼验收。

  sheet-A1.png   白板鼠 5 帧
  sheet-A2.png   引信鼠 4 阶 × 5 帧
  sheet-A3.png   爆炸 5 帧
  sheet-B1.png   技能图标 11 个（16x16 与 32x32 两档）
  sheet-B2B3.png 天赋 5 + 转职证 4
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "_tools"
CHAR_FRAMES = ["idle-1", "idle-2", "action-windup", "action-strike", "hop-air"]
BG = (58, 58, 62, 255)
LABEL_H = 0


def load(p: Path, z: int) -> Image.Image | None:
    if not p.exists():
        return None
    im = Image.open(p).convert("RGBA")
    return im.resize((im.width * z, im.height * z), Image.NEAREST)


def grid(rows: int, cols: int, cell: int, gap: int = 6) -> Image.Image:
    w = cols * cell + gap * (cols + 1)
    h = rows * cell + gap * (rows + 1)
    return Image.new("RGBA", (w, h), BG)


def sheet_A1() -> Path | None:
    d = ROOT / "A1-none-1"
    ims = [load(d / f"{f}.png", 4) for f in CHAR_FRAMES]
    if not any(ims):
        return None
    s = grid(1, 5, 256)
    for i, im in enumerate(ims):
        if im:
            s.alpha_composite(im, (6 + i * 262, 6))
    p = TOOLS / "sheet-A1.png"
    s.save(p)
    return p


def sheet_A2() -> Path | None:
    return _sheet_charset("A2-*", "sheet-A2.png")


def sheet_A2b() -> Path | None:
    return _sheet_charset("A2b-*", "sheet-A2b.png")


def _sheet_charset(pattern: str, name: str) -> Path | None:
    """一个角色组（多阶 × 5 帧）的对照表。缺帧的格子留空。"""
    dirs = [d for d in sorted(ROOT.glob(pattern)) if (d / "idle-1.png").exists()]
    if not dirs:
        return None
    s = grid(len(dirs), 5, 256)
    for r, d in enumerate(dirs):
        for c, f in enumerate(CHAR_FRAMES):
            im = load(d / f"{f}.png", 4)
            if im:
                s.alpha_composite(im, (6 + c * 262, 6 + r * 262))
    p = TOOLS / name
    s.save(p)
    return p


def sheet_A3() -> Path | None:
    d = ROOT / "A3-fx-blast"
    ims = [load(d / f"frame-{i}.png", 6) for i in range(1, 6)]
    if not any(ims):
        return None
    cell = 32 * 6
    s = grid(1, 5, cell)
    for i, im in enumerate(ims):
        if im:
            s.alpha_composite(im, (6 + i * (cell + 6), 6))
    p = TOOLS / "sheet-A3.png"
    s.save(p)
    return p


def sheet_icons(name: str, dirpath: Path) -> Path | None:
    if not dirpath.exists():
        return None
    keys = sorted(p for p in dirpath.glob("*.png") if not p.stem.endswith("_32"))
    if not keys:
        return None
    c16, c32 = 16 * 10, 32 * 6
    s = grid(2, len(keys), max(c16, c32))
    for i, p in enumerate(keys):
        a = load(p, 10)
        b = load(dirpath / f"{p.stem}_32.png", 6)
        if a:
            s.alpha_composite(a, (6 + i * (max(c16, c32) + 6), 6))
        if b:
            s.alpha_composite(b, (6 + i * (max(c16, c32) + 6), 6 + max(c16, c32) + 6))
    out = TOOLS / f"sheet-{name}.png"
    s.save(out)
    return out


def main() -> None:
    made = []
    for fn in (sheet_A1, sheet_A2, sheet_A2b, sheet_A3):
        p = fn()
        if p:
            made.append(p.name)
    for name, d in (("B1", ROOT / "B1-icons"), ("B2", ROOT / "B2-talents"), ("B3", ROOT / "B3-certs")):
        p = sheet_icons(name, d)
        if p:
            made.append(p.name)
    print("生成对照表:", ", ".join(made) if made else "（无成品）")


if __name__ == "__main__":
    main()
