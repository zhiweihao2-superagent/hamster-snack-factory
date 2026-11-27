"""敌方 20 形态挑图：把选中的候选写成游戏用文件。

    python tools/tessera/pickfoe.py --set 4,6,2,5,4,5,4,1,2,4,5,3,2,6,6,3,2,5,2,6
    python tools/tessera/pickfoe.py            # 用已保存的选择

顺序（与 gen.py 的 FOE_FORMS 一致）：
    crate-1..4, shell-1..4, thief-1..4, boss-1..4, glue-1..4
值是候选序号（1 起）。

产物：art/tessera/picks/foe-<type>-<tier>@4x.png（64×64）与 16×16 原图。
敌方不需要再派生配色（本身就是敌方造型），所以没有 -foe 后缀。
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / "art" / "tessera" / "foe"
OUT = ROOT / "art" / "tessera" / "picks"
PICKS = HERE / "picks-foe.json"

KEYS = [f"{t}-{n}" for t in ("crate", "shell", "thief", "boss", "glue") for n in (1, 2, 3, 4)]

DEFAULT = "4,6,2,5,4,5,4,1,2,4,5,3,2,6,6,3,2,5,2,6"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", help="20 个序号，逗号分隔（1 起）")
    args = ap.parse_args()

    if args.set:
        picks = dict(zip(KEYS, [int(v) for v in args.set.split(",")]))
        PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2), encoding="utf-8")
    elif PICKS.exists():
        picks = json.loads(PICKS.read_text(encoding="utf-8"))
    else:
        picks = dict(zip(KEYS, [int(v) for v in DEFAULT.split(",")]))
        PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2), encoding="utf-8")

    OUT.mkdir(parents=True, exist_ok=True)
    missing = []
    for key in KEYS:
        idx = picks.get(key, 1) - 1
        src = SRC / f"{key}-{idx}.png"
        if not src.exists():
            missing.append(str(src))
            continue
        img = Image.open(src).convert("RGBA")
        img.save(OUT / f"foe-{key}.png")
        img.resize((64, 64), Image.NEAREST).save(OUT / f"foe-{key}@4x.png")

    print(json.dumps({"out": str(OUT), "count": len(KEYS) - len(missing), "missing": missing}, ensure_ascii=False))


if __name__ == "__main__":
    main()
