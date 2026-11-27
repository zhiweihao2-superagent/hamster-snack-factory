"""把选中的候选拼成一张"入选表"，并复制成游戏用文件名。

    python tools/tessera/pick.py --set 2,4,7,3,8,4,5,6,3,4,6,4,4,4,5,3
    python tools/tessera/pick.py            # 用 picks.json 里已保存的选择

选择按 FORMS 的顺序（none-1, tank-2, tank-3, tank-4, blade-2 … care-4），值是候选序号（从 1 开始）。
产物：
    art/tessera/picks/_sheet.png     入选表（16 行，一行一个形态，带序号）
    art/tessera/picks/<key>.png      16×16 原图
    art/tessera/picks/<key>@4x.png   64×64（游戏直接用）
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / "art" / "tessera" / "forms"
OUT = ROOT / "art" / "tessera" / "picks"
PICKS = HERE / "picks.json"

KEYS = [
    "none-1", "tank-2", "tank-3", "tank-4",
    "blade-2", "blade-3", "blade-4",
    "shot-2", "shot-3", "shot-4",
    "hex-2", "hex-3", "hex-4",
    "care-2", "care-3", "care-4",
]

TITLES = {
    "none-1": "白板鼠", "tank-2": "铁皮鼠", "tank-3": "铆甲鼠", "tank-4": "堡垒鼠",
    "blade-2": "扳钳鼠", "blade-3": "尖牙鼠", "blade-4": "破城鼠",
    "shot-2": "炮筒鼠", "shot-3": "连发鼠", "shot-4": "狙炮鼠",
    "hex-2": "火种鼠", "hex-3": "咒炉鼠", "hex-4": "熔炉鼠",
    "care-2": "医务鼠", "care-3": "药剂鼠", "care-4": "大医师鼠",
}


def foe_variant(img: Image.Image) -> Image.Image:
    """敌方配色：去饱和 + 压暗偏紫；把眼睛那几撮深色像素换成红光。"""
    src = img.convert("RGBA")
    w, h = src.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sp, dp = src.load(), out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            if a == 0:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum < 70:                       # 眼睛/最深的描边 → 红光
                nr, ng, nb = 255, 46, 60
            else:                              # 毛色去饱和 + 压暗 + 偏冷紫
                nr = int(lum * 0.62 + 34)
                ng = int(lum * 0.55 + 28)
                nb = int(lum * 0.66 + 44)
            dp[x, y] = (min(255, nr), min(255, ng), min(255, nb), a)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", help="16 个序号，逗号分隔（1 起）")
    args = ap.parse_args()

    if args.set:
        picks = dict(zip(KEYS, [int(v) for v in args.set.split(",")]))
        PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2), encoding="utf-8")
    elif PICKS.exists():
        picks = json.loads(PICKS.read_text(encoding="utf-8"))
    else:
        print("没有选择：先用 --set 给 16 个序号", file=sys.stderr)
        sys.exit(2)

    OUT.mkdir(parents=True, exist_ok=True)
    cell, pad, label_h = 96, 8, 16
    sheet = Image.new("RGBA", (pad * 4 + cell * 3, pad + len(KEYS) * (cell + pad + label_h)), (36, 29, 46, 255))
    draw = ImageDraw.Draw(sheet)
    missing = []
    for r, key in enumerate(KEYS):
        idx = picks.get(key, 1) - 1
        src = SRC / f"{key}-{idx}.png"
        if not src.exists():
            missing.append(str(src))
            continue
        img = Image.open(src).convert("RGBA")
        foe = foe_variant(img)
        img.save(OUT / f"{key}.png")
        img.resize((64, 64), Image.NEAREST).save(OUT / f"{key}@4x.png")
        foe.resize((64, 64), Image.NEAREST).save(OUT / f"{key}-foe@4x.png")
        y = pad + r * (cell + pad + label_h)
        draw.text((pad, y), f"{key} {TITLES.get(key, '')}  #{idx + 1}", fill=(200, 188, 216, 255))
        # 左：96px 放大看细节；中：64px 实际大小；右：敌方配色
        sheet.alpha_composite(img.resize((cell, cell), Image.NEAREST), (pad, y + label_h))
        sheet.alpha_composite(img.resize((64, 64), Image.NEAREST), (pad * 2 + cell, y + label_h + 16))
        sheet.alpha_composite(foe.resize((64, 64), Image.NEAREST), (pad * 3 + cell * 2, y + label_h + 16))

    sheet.save(OUT / "_sheet.png")
    print(json.dumps({"out": str(OUT), "picks": picks, "missing": missing}, ensure_ascii=False))


if __name__ == "__main__":
    main()
