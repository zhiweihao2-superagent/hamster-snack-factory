"""
手绘引信鼠（64×64，四阶 × 五帧）—— 和现网手绘原画同一套画法：
平涂色块 + 1px 深棕描边 + 2px 结构，画出来是硬边像素，不会被"糊成一团"。

    python tools/draw_blast.py [outdir]

四阶差别：炸药 1 / 2 / 3 / 5 根（5 根 = 3 上 2 下）
五帧：idle-1 / idle-2 / windup / strike / hop-air
朝向：朝左（敌方）
"""
from PIL import Image, ImageDraw
import os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else 'art/frames_hand'
os.makedirs(OUT, exist_ok=True)

INK = (58, 36, 30, 255)
FUR = (138, 143, 150, 255)
FUR_D = (108, 113, 121, 255)
FUR_L = (170, 175, 182, 255)
BELLY = (196, 199, 205, 255)
PINK = (240, 156, 168, 255)
PINK_D = (208, 118, 132, 255)
EYE = (232, 64, 44, 255)
WHITE = (250, 250, 250, 255)
DYN = (200, 52, 42, 255)
DYN_D = (150, 34, 28, 255)
BAND = (120, 92, 60, 255)
FUSE = (232, 193, 74, 255)


def R(d, x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1, y1], fill=c)


def body(d, dx=0, dy=0, squash=0):
    """身体 + 头（朝左）：画布 64，脚底 y=61"""
    def X(v): return v + dx
    def Y(v): return v + dy + squash
    # 尾巴（先画，压在身后）
    R(d, X(40), Y(34), X(43), Y(46), INK)
    R(d, X(41), Y(35), X(42), Y(45), PINK)
    R(d, X(43), Y(30), X(45), Y(34), INK)
    R(d, X(44), Y(31), X(44), Y(33), PINK_D)
    # 身体
    R(d, X(16), Y(30), X(43), Y(54), INK)
    R(d, X(18), Y(31), X(41), Y(52), FUR)
    # 肚子
    R(d, X(20), Y(38), X(38), Y(52), BELLY)
    # 脚
    R(d, X(18), Y(55), X(26), Y(60), INK)
    R(d, X(19), Y(56), X(25), Y(59), FUR)
    R(d, X(32), Y(55), X(40), Y(60), INK)
    R(d, X(33), Y(56), X(39), Y(59), FUR)
    # 头（朝左，压在身体上）
    R(d, X(6), Y(16), X(30), Y(36), INK)
    R(d, X(8), Y(17), X(28), Y(34), FUR)
    # 耳朵
    R(d, X(6), Y(10), X(14), Y(18), INK)
    R(d, X(7), Y(11), X(13), Y(17), PINK)
    R(d, X(22), Y(10), X(30), Y(18), INK)
    R(d, X(23), Y(11), X(29), Y(17), PINK)
    # 吻部（浅色）
    R(d, X(6), Y(26), X(16), Y(33), BELLY)
    # 鼻子 + 牙
    R(d, X(6), Y(27), X(7), Y(28), INK)
    R(d, X(8), Y(32), X(8), Y(32), WHITE)
    R(d, X(10), Y(32), X(10), Y(32), WHITE)
    # 眼睛（红 + 白高光）
    R(d, X(12), Y(21), X(15), Y(24), INK)
    R(d, X(13), Y(22), X(14), Y(23), EYE)
    R(d, X(13), Y(22), X(13), Y(22), WHITE)
    R(d, X(20), Y(21), X(23), Y(24), INK)
    R(d, X(21), Y(22), X(22), Y(23), EYE)
    R(d, X(21), Y(22), X(21), Y(22), WHITE)


def dynamite(d, count, dx=0, dy=0):
    """炸药绑在腹部：1 / 2 / 3 / 5 根"""
    def X(v): return v + dx
    def Y(v): return v + dy
    layout = {
        1: [(24, 40)],
        2: [(21, 40), (28, 40)],
        3: [(19, 40), (25, 40), (31, 40)],
        5: [(19, 40), (25, 40), (31, 40), (22, 46), (28, 46)],
    }
    for (sx, sy) in layout.get(count, layout[1]):
        w = 5 if count <= 3 else 4
        h = 8 if count <= 3 else 6
        R(d, X(sx), Y(sy), X(sx + w - 1), Y(sy + h - 1), INK)
        R(d, X(sx + 1), Y(sy + 1), X(sx + w - 2), Y(sy + h - 2), DYN)
        R(d, X(sx + 1), Y(sy + 2), X(sx + w - 2), Y(sy + 2), DYN_D)
        R(d, X(sx + 1), Y(sy + h - 3), X(sx + w - 2), Y(sy + h - 3), BAND)
        # 引信火花
        R(d, X(sx + w - 1), Y(sy - 2), X(sx + w - 1), Y(sy - 2), FUSE)


def frame(tier, kind):
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if kind == 'idle-1':
        body(d, 0, 0)
        dynamite(d, tier, 0, 0)
    elif kind == 'idle-2':
        body(d, 0, -1)
        dynamite(d, tier, 0, -1)
    elif kind == 'action-windup':
        body(d, 1, 1, 1)          # 后撤半步 + 蹲
        dynamite(d, tier, 1, 2)
    elif kind == 'action-strike':
        body(d, -3, 0)            # 前扑
        dynamite(d, tier, -3, 1)
    else:                          # hop-air
        body(d, 0, -6)
        dynamite(d, tier, 0, -6)
    return im


FRAMES = ['idle-1', 'idle-2', 'action-windup', 'action-strike', 'hop-air']
COUNTS = {1: 1, 2: 2, 3: 3, 4: 5}

for t, c in COUNTS.items():
    d2 = os.path.join(OUT, 'foe-blast-%d' % t)
    os.makedirs(d2, exist_ok=True)
    for f in FRAMES:
        frame(c, f).save(os.path.join(d2, f + '.png'))
print('drawn 4 tiers x 5 frames →', OUT)
