"""A/B 对比：两个目录里同名 id 的图并排拼成一张，方便挑更好的。

    python tools\\artcompare.py art\\review\\tessera art\\review\\openai
    python tools\\artcompare.py A B --out art\\review

产出：
    <out>\\_compare_<id>.png   每张：左 A（大图 + 32px 缩略） 右 B（大图 + 32px 缩略）
    <out>\\_compare_sheet.png  所有 id 的总览（上 A 下 B，成对排列）

只按文件名（去掉 @4x 后缀）配对，A 有 B 没有的会标记 missing。
"""
from __future__ import annotations

import argparse
import pathlib

from PIL import Image, ImageDraw


def load(folder: pathlib.Path) -> dict:
    out = {}
    for p in sorted(folder.glob("*.png")):
        name = p.name
        if name.startswith("_"):
            continue
        base = name.replace("@4x", "")
        if base.endswith(".png"):
            out[base[:-4]] = p
    return out


def pair_cell(a: Image.Image | None, b: Image.Image | None, big: int = 96, thumb: int = 32) -> Image.Image:
    pad = 6
    w = big * 2 + thumb * 2 + pad * 5
    h = big + pad * 2
    cell = Image.new("RGBA", (w, h), (30, 24, 40, 255))
    x = pad
    for img in (a, b):
        if img:
            cell.alpha_composite(img.convert("RGBA").resize((big, big), Image.NEAREST), (x, pad))
            x += big + pad
            cell.alpha_composite(img.convert("RGBA").resize((thumb, thumb), Image.NEAREST), (x, pad + 8))
            x += thumb + pad
        else:
            d = ImageDraw.Draw(cell)
            d.rectangle([x, pad, x + big - 1, pad + big - 1], outline=(90, 80, 110))
            x += big + pad + thumb + pad
    return cell


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("--out", default="art/review")
    args = ap.parse_args()

    da, db = pathlib.Path(args.a), pathlib.Path(args.b)
    fa, fb = load(da), load(db)
    ids = sorted(set(fa) | set(fb))
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    rows = []
    missing = []
    for i in ids:
        pa, pb = fa.get(i), fb.get(i)
        if not pa or not pb:
            missing.append(f"{i}: {'A缺' if not pa else ''}{'B缺' if not pb else ''}".strip())
        ia = Image.open(pa) if pa else None
        ib = Image.open(pb) if pb else None
        cell = pair_cell(ia, ib)
        cell.save(out / f"_compare_{i}.png")
        rows.append(cell)

    if rows:
        w = max(r.width for r in rows)
        h = sum(r.height + 4 for r in rows)
        sheet = Image.new("RGBA", (w, h), (24, 19, 32, 255))
        y = 0
        for r in rows:
            sheet.alpha_composite(r, (0, y))
            y += r.height + 4
        sheet.save(out / "_compare_sheet.png")

    print(f"对比 {len(ids)} 个 id → {out}")
    if missing:
        print("配对问题：")
        for m in missing:
            print("  -", m)


if __name__ == "__main__":
    main()
