import os

TOOLS = os.path.dirname(os.path.abspath(__file__))
BASE = r"D:\deepseek\杂项\hamster-snack-factory\art\incoming\codex2"

POSES = {
    "action-windup": (
        "CROUCH AND LOAD. Hips drop about 2 blocks, knees bend outward a little, both fists are pulled in "
        "against the chest, the head stays UPRIGHT AND ROUND at the same size, ears sweep back slightly, eyes "
        "narrow, and the fuse spark FLARES BRIGHTER — a small bright yellow-white burst with three or four spark "
        "blocks, kept BESIDE the bundle and never crossing the face."
    ),
    "action-strike": (
        "LUNGE FORWARD. The upper body tips about 15 degrees toward the viewer, both front paws push forward at "
        "chest height, the back feet brace a little wider, and the tail swings out to the right for balance. "
        "THE MOUTH STAYS CLOSED, exactly like the idle reference: no open mouth, no dark mouth cavity, no black "
        "square. The head stays round and large at the same diameter. THE EARS KEEP THE SAME ROUND SHAPE AND SIZE "
        "as the reference: do not stretch, point or lengthen them. The body keeps its size and its width. The "
        "bundle swings forward on its strap but stays on the belly and inside the frame."
    ),
    "hop-air": (
        "AIRBORNE. The whole rat is lifted with clear empty space under the feet, both legs folded up under the "
        "belly, both paws raised in front of the chest, ears flipped up, tail trailing behind. Same body, same "
        "head, same bundle — only the whole figure is off the ground."
    ),
}

BOMBS = {
    1: "ONE thick red #c8342a stick across the lower belly.",
    2: "TWO thick red #c8342a sticks side by side across the lower belly.",
    3: "THREE thick red #c8342a sticks side by side, the middle one slightly forward.",
    4: "FIVE thick red #c8342a sticks stacked in two short rows (three over two), the biggest bundle.",
}

TMPL = """You have an image generation tool. Use it. Do NOT write drawing code, do NOT compose images programmatically. The PNG must come out of the image generation model.

You will call the image generation tool ONCE, producing ONE animation frame.

=== THE ATTACHED IMAGE IS THIS EXACT RAT ===
The attached PNG is the idle frame of this character, already approved and shipped. You must draw THE SAME RAT:
same body, same head size, same face, same eyes, same colours, same firecracker bundle, same pixel grid, same outline weight.
Change ONLY the pose, exactly as described under THE POSE below.

=== HARD RULES — DO NOT BREAK THE SHAPE ===
- Do NOT squash, stretch, widen, flatten or slim the body. The silhouette stays a plump pear, slightly taller than wide, width about 0.80 of the height.
- The HEAD stays a big ROUND circle of the same diameter as the reference. Never flatten the head into an oval or a wedge.
- The belly keeps its size; the arms stay SHORT and THICK and attached to the body; the legs stay SHORT and THICK.
- Total figure height may change by 10% at most compared with the reference.
- EYE = 2 blocks wide by 2 blocks tall: one block solid red #e8402c plus one block pure white #fff8ee. Two eyes, 3 blocks of plain grey fur apart. Never merge the eyes into one red smear, never let the eyes disappear.
- NOSE = one pink block, TEETH = one white block under it. No mouth line except where THE POSE explicitly asks for an open mouth.
- EARS = two big round pink-inner #f09ca8 ears on top of the head, the same size as the reference.
- The firecracker bundle stays the same size and stays on the LOWER BELLY, below the chin, never covering the mouth, snout or eyes.
- TAIL stays SHORT: one small curl out from the right hip. Never wider than the body, never reaching the frame edge. Nothing in the drawing may touch the frame edge.

=== THE FIRECRACKER BUNDLE (unchanged) ===
@@BOMB@@
Each stick is 3 blocks thick with ONE dark brown #3a241e band and a rounded cap, held by a thin strap passing BEHIND. A short yellow #e8c14a fuse with a small spark.

=== DRAW IT ON A COARSE PIXEL GRID ===
Every block is a fat square, about 40 blocks from the feet to the top of the ears. The dark outline #3a241e is ONE WHOLE BLOCK thick. No anti-aliased edge anywhere, no fine detail, flat solid colours only.
Fully TRANSPARENT background (alpha). No ground, no shadow, no backdrop, no text, no watermark, no frame.

=== THE POSE — @@POSE_NAME@@ ===
@@POSE@@

=== OUTPUT ===
High resolution (at least 1000x1000), transparent background, the character centred with a clear margin on all four sides.
Save to exactly (overwrite the old file):
  @@OUT@@
Keep native high resolution, do NOT resize or downscale.
When it is saved, reply with just the path.
"""

for frame, pose in POSES.items():
    for tier in (1, 2, 3, 4):
        out = f"{BASE}\\A2b-foe-blast-{tier}\\raw\\{frame}.png"
        txt = (TMPL.replace("@@BOMB@@", BOMBS[tier])
                   .replace("@@POSE_NAME@@", frame)
                   .replace("@@POSE@@", pose)
                   .replace("@@OUT@@", out))
        path = os.path.join(TOOLS, f"p_A2b_{frame}_T{tier}.txt")
        open(path, "w", encoding="utf-8").write(txt)
print("wrote 12 prompt files")
