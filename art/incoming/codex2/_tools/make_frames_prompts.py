import io, os, sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
BASE = r"D:\deepseek\杂项\hamster-snack-factory\art\incoming\codex2"
FRAMES = ["idle-2", "action-windup", "action-strike", "hop-air"]

BOMBS = {
    1: "ONE thick stick lying across the lower belly.",
    2: "TWO thick sticks lying side by side across the lower belly.",
    3: "THREE thick sticks side by side across the lower belly, the middle one slightly forward.",
    4: "FIVE thick sticks stacked in two short rows (three over two) at the lower belly, the biggest bundle of the family.",
}

tmpl = open(os.path.join(TOOLS, "p_A2b_frames.tmpl.txt"), encoding="utf-8").read()

for tier in (1, 2, 3, 4):
    paths = "\n".join(
        f"  {BASE}\\A2b-foe-blast-{tier}\\raw\\{f}.png" for f in FRAMES
    )
    out = tmpl.replace("@@T@@", str(tier)).replace("@@BOMB@@", BOMBS[tier]).replace("@@PATHS@@", paths)
    dst = os.path.join(TOOLS, f"p_A2b_frames_T{tier}.txt")
    open(dst, "w", encoding="utf-8").write(out)
    print("wrote", os.path.basename(dst), len(out))
