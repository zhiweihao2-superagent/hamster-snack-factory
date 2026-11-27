"""把现有结果整理成 A/B 对比目录（演示 + 日常用）。

    python tools\\artreview.py prepare      # 从 picks/forms 生成 art/review/tessera 与 art/review/cand0
    python tools\\artreview.py compare      # 跑 artcompare（tessera vs cand0）

只是把文件按 `<id>.png` 平铺，方便来自别的模型的同名文件直接放进来对比。
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PICKS = ROOT / "art" / "tessera" / "picks"
FORMS = ROOT / "art" / "tessera" / "forms"
REVIEW = ROOT / "art" / "review"

ALLY = ["none-1"] + [f"{l}-{t}" for l in ("tank", "blade", "shot", "hex", "care") for t in (2, 3, 4)]
FOE = [f"foe-{t}-{n}" for t in ("crate", "shell", "thief", "boss", "glue") for n in (1, 2, 3, 4)]


def prepare() -> None:
    tess = REVIEW / "tessera"
    cand0 = REVIEW / "cand0"
    tess.mkdir(parents=True, exist_ok=True)
    cand0.mkdir(parents=True, exist_ok=True)

    n = 0
    for key in ALLY:
        src = PICKS / f"{key}.png"
        if src.exists():
            shutil.copy2(src, tess / f"{key}.png")
            n += 1
        c0 = FORMS / f"{key}-0.png"
        if c0.exists():
            shutil.copy2(c0, cand0 / f"{key}.png")

    for key in FOE:
        src = PICKS / f"{key}.png"
        if src.exists():
            shutil.copy2(src, tess / f"{key}.png")
            n += 1
    print(f"art/review 已整理：tessera {n} 张，cand0 {len(list(cand0.glob('*.png')))} 张")


def compare() -> None:
    py = sys.executable
    subprocess.run([py, str(ROOT / "tools" / "artcompare.py"),
                    str(REVIEW / "cand0"), str(REVIEW / "tessera"),
                    "--out", str(REVIEW)], check=False)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "prepare"
    if cmd == "prepare":
        prepare()
    elif cmd == "compare":
        compare()
    else:
        print("用法：python tools\\artreview.py [prepare|compare]")
