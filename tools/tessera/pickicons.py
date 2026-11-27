"""C 组图标挑图：把选中的候选写成游戏用文件。

    python tools\\tessera\\pickicons.py --set 2,3,4,3,2,3,2,3,6,3,4,4,3,3,4,5,4,4,3,4,3,2,4
    python tools\\tessera\\pickicons.py            # 用已保存的选择

顺序 = art/tasks.json 里 group=="icon" 的顺序（23 个）。
产物：art/tessera/picks/<icon-id>@4x.png（64×64）与 16×16 原图（键名带 buff-/gear-/mod-/snack-/tool- 前缀）。
"""
from __future__ import annotations

import argparse
import json
import pathlib

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / "art" / "tessera" / "icons"
OUT = ROOT / "art" / "tessera" / "picks"
PICKS = HERE / "picks-icons.json"
TASKS = ROOT / "art" / "tasks.json"

DEFAULT = "2,3,4,3,2,3,2,3,6,3,4,4,3,3,4,5,4,4,3,4,3,2,4"


def icon_keys() -> list[str]:
    data = json.loads(TASKS.read_text(encoding="utf-8"))
    return [t["id"] for t in data["tasks"] if t.get("group") == "icon"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", help="23 个序号，逗号分隔（1 起）")
    args = ap.parse_args()

    keys = icon_keys()
    if args.set:
        picks = dict(zip(keys, [int(v) for v in args.set.split(",")]))
        PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2), encoding="utf-8")
    elif PICKS.exists():
        picks = json.loads(PICKS.read_text(encoding="utf-8"))
    else:
        picks = dict(zip(keys, [int(v) for v in DEFAULT.split(",")]))
        PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2), encoding="utf-8")

    OUT.mkdir(parents=True, exist_ok=True)
    missing = []
    for key in keys:
        idx = picks.get(key, 1) - 1
        src = SRC / f"{key}-{idx}.png"
        if not src.exists():
            missing.append(str(src))
            continue
        img = Image.open(src).convert("RGBA")
        img.save(OUT / f"{key}.png")
        img.resize((64, 64), Image.NEAREST).save(OUT / f"{key}@4x.png")

    print(json.dumps({"out": str(OUT), "count": len(keys) - len(missing), "missing": missing}, ensure_ascii=False))


if __name__ == "__main__":
    main()
