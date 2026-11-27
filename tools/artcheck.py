"""美术批次体检：给一个文件夹，逐张量指标，生成缩略总表。

    python tools\\artcheck.py art\\review\\openai
    python tools\\artcheck.py art\\tessera\\picks --size 16

输出：
    <dir>\\_report.txt    每张一行的指标
    <dir>\\_sheet32.png   32px 缩略总表（按文件名排序，方便看轮廓可辨性）
    <dir>\\_sheet.png     原始尺寸放大 4 倍的总表

指标：
    size      像素尺寸
    colors    不同颜色数（含 alpha 不同的算不同）
    semi      半透明像素数（alpha 不是 0/255 的数量）
    cover     不透明像素占全画布比例
    feet      最底一行是否有像素（贴底）
    cx        不透明像素的水平重心（0=最左 1=最右），用来判朝向/居中
"""
from __future__ import annotations

import argparse
import pathlib
import statistics
import sys

from PIL import Image


def metrics(img: Image.Image) -> dict:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    colors = set()
    semi = 0
    opaque = 0
    sum_x = 0
    bottom_hit = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            colors.add((r, g, b, a))
            if a == 0:
                continue
            if a != 255:
                semi += 1
            opaque += 1
            sum_x += x
            if y == h - 1:
                bottom_hit += 1
    return {
        "size": f"{w}x{h}",
        "colors": len(colors),
        "semi": semi,
        "cover": round(opaque / max(1, w * h), 3),
        "feet": "yes" if bottom_hit else "no",
        "cx": round(sum_x / opaque / max(1, w), 2) if opaque else 0,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--size", type=int, default=0, help="期望的原生边长（0=不检查）")
    ap.add_argument("--thumbs", type=int, default=32)
    ap.add_argument("--limit", type=int, default=32, help="颜色数上限（角色 32 / 图标 20）")
    args = ap.parse_args()

    d = pathlib.Path(args.folder)
    if not d.is_dir():
        print(f"不是文件夹：{d}", file=sys.stderr)
        sys.exit(2)

    files = sorted(p for p in d.glob("*.png") if not p.name.startswith("_") and "@4x" not in p.name)
    if not files:
        print(f"{d} 里没有 PNG", file=sys.stderr)
        sys.exit(2)

    rows, bad = [], []
    for p in files:
        img = Image.open(p)
        m = metrics(img)
        if args.size and m["size"] != f"{args.size}x{args.size}":
            bad.append(f"{p.name} 尺寸 {m['size']} ≠ {args.size}x{args.size}")
        if m["semi"] > 0:
            bad.append(f"{p.name} 有 {m['semi']} 个半透明像素")
        if m["colors"] > args.limit:
            bad.append(f"{p.name} 用色 {m['colors']} > {args.limit}")
        if m["cover"] < 0.20 or m["cover"] > 0.95:
            bad.append(f"{p.name} 主体占比 {m['cover']} 异常")
        if m["feet"] == "no" and args.size:
            bad.append(f"{p.name} 没贴底边（脚悬空）")
        rows.append((p.name, m))

    # 报告
    lines = [f"目录：{d}", f"数量：{len(files)}", ""]
    lines.append(f"{'file':<24}{'size':<10}{'colors':>7}{'semi':>6}{'cover':>7}{'feet':>6}{'cx':>6}")
    for name, m in rows:
        lines.append(f"{name:<24}{m['size']:<10}{m['colors']:>7}{m['semi']:>6}{m['cover']:>7.3f}{m['feet']:>6}{m['cx']:>6.2f}")
    colors = [m["colors"] for _, m in rows]
    covers = [m["cover"] for _, m in rows]
    lines.append("")
    lines.append(f"颜色数 中位 {statistics.median(colors):.0f} / 最大 {max(colors)}")
    lines.append(f"占比   中位 {statistics.median(covers):.2f} / 最小 {min(covers):.2f} / 最大 {max(covers):.2f}")
    lines.append("")
    lines.append("问题：" if bad else "问题：无")
    lines.extend("  - " + b for b in bad)
    report = "\n".join(lines)
    (d / "_report.txt").write_text(report, encoding="utf-8")
    print(report)

    # 缩略总表
    def sheet(cell: int, name: str) -> None:
        cols = min(8, len(files))
        rows_n = (len(files) + cols - 1) // cols
        pad = 6
        out = Image.new("RGBA", (cols * (cell + pad) + pad, rows_n * (cell + pad) + pad), (36, 29, 46, 255))
        for i, p in enumerate(files):
            img = Image.open(p).convert("RGBA").resize((cell, cell), Image.NEAREST)
            x = pad + (i % cols) * (cell + pad)
            y = pad + (i // cols) * (cell + pad)
            out.alpha_composite(img, (x, y))
        out.save(d / name)

    sheet(args.thumbs, "_sheet32.png")
    sheet(64, "_sheet.png")


if __name__ == "__main__":
    main()
