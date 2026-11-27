"""
职业图标合成 v2：基准头 + 手工像素武器（16×16）。

    python tools/iconcompose.py

改进点（相比 v1）：
- 盾牌做成带边框的圆角+中心凸起，辨识度更高；
- 短刀加宽刀身 + 护手，斜 45°；
- 弩做成"横臂 + 竖身 + 弦"的 T 形；
- 法杖加粗，顶端 3×3 蓝晶；
- 医疗箱保留（v1 已经清楚）。
所有武器都放在 x≥9 的右侧，不遮脸。
"""
from PIL import Image, ImageDraw
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, 'art', 'tessera', 'heads', 'head-05.png')
OUT_DIR = os.path.join(ROOT, 'art', 'tessera', 'picks')
REVIEW = os.path.join(ROOT, 'art', 'review', 'classicons')
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(REVIEW, exist_ok=True)

OUTLINE = (48, 32, 28, 255)
STEEL = (186, 194, 206, 255)
STEEL_D = (118, 126, 140, 255)
STEEL_L = (228, 234, 244, 255)
WOOD = (150, 98, 58, 255)
WOOD_D = (100, 62, 36, 255)
BLUE = (88, 164, 244, 255)
BLUE_L = (186, 222, 255, 255)
GREEN = (86, 172, 104, 255)
GREEN_L = (196, 236, 198, 255)
WHITE = (246, 248, 252, 255)


def rect(d, x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1, y1], fill=c)


def draw_shield(d):
    """圆盾：8..14 x, 7..14 y（6×7），带边框、中心凸起、左上高光"""
    rect(d, 9, 8, 14, 13, OUTLINE)
    rect(d, 8, 9, 14, 12, OUTLINE)
    rect(d, 9, 7, 13, 7, OUTLINE)
    rect(d, 8, 13, 13, 13, OUTLINE)
    # 盾面
    rect(d, 9, 8, 13, 12, STEEL)
    rect(d, 9, 8, 12, 11, STEEL)
    # 中心凸起
    rect(d, 10, 9, 11, 10, STEEL_D)
    # 高光
    rect(d, 9, 8, 9, 8, STEEL_L)
    rect(d, 10, 8, 11, 8, STEEL_L)
    # 底部收尖
    rect(d, 10, 12, 11, 12, STEEL_D)


def draw_dagger(d):
    """短刀：刀身 2px 宽，斜向右上；护手 + 柄"""
    # 刀身（从 (12,3) 到 (9,8) 的斜线，2px 厚）
    for i in range(6):
        x = 12 - i // 2
        y = 3 + i
        rect(d, x - 1, y, x, y, OUTLINE)
        rect(d, x - 1, y, x - 1, y, STEEL)
    # 刀尖
    rect(d, 12, 2, 12, 2, STEEL_L)
    # 护手
    rect(d, 9, 9, 12, 9, STEEL_D)
    rect(d, 8, 9, 8, 9, OUTLINE)
    # 柄
    rect(d, 10, 10, 11, 12, OUTLINE)
    rect(d, 10, 10, 10, 11, WOOD)
    rect(d, 11, 10, 11, 11, WOOD_D)


def draw_crossbow(d):
    """弩：T 形 —— 横臂 9..15、竖身 11..12、弦 + 弩箭"""
    rect(d, 9, 7, 15, 7, OUTLINE)
    rect(d, 10, 8, 14, 8, STEEL)
    rect(d, 9, 6, 9, 9, STEEL_D)
    rect(d, 15, 6, 15, 9, STEEL_D)
    # 竖身
    rect(d, 11, 8, 12, 14, OUTLINE)
    rect(d, 11, 9, 11, 13, WOOD)
    rect(d, 12, 10, 12, 13, WOOD_D)
    # 弦
    rect(d, 10, 6, 14, 6, OUTLINE)
    # 箭头
    rect(d, 12, 5, 12, 5, STEEL_L)


def draw_staff(d):
    """法杖：2px 粗木杆 + 顶端 3×3 蓝晶 + 两点火花"""
    rect(d, 12, 6, 13, 15, OUTLINE)
    rect(d, 12, 7, 12, 14, WOOD_D)
    rect(d, 13, 8, 13, 14, WOOD)
    # 晶石
    rect(d, 11, 3, 14, 5, OUTLINE)
    rect(d, 12, 3, 13, 5, BLUE)
    rect(d, 12, 4, 12, 4, BLUE_L)
    # 火花
    rect(d, 15, 2, 15, 2, BLUE_L)
    rect(d, 10, 2, 10, 2, BLUE)


def draw_medkit(d):
    """医疗箱：绿色箱体 + 白十字 + 提手"""
    rect(d, 9, 9, 15, 14, OUTLINE)
    rect(d, 10, 9, 14, 13, GREEN)
    rect(d, 12, 10, 12, 12, WHITE)
    rect(d, 10, 11, 14, 11, WHITE)
    rect(d, 11, 8, 13, 8, GREEN_L)
    rect(d, 9, 9, 9, 9, GREEN_L)


DEPS = {
    'tank': draw_shield,
    'blade': draw_dagger,
    'shot': draw_crossbow,
    'hex': draw_staff,
    'care': draw_medkit,
}


def main():
    if not os.path.exists(BASE):
        print('缺少基准头：', BASE)
        sys.exit(1)
    base = Image.open(BASE).convert('RGBA')
    made = []
    for line, fn in DEPS.items():
        im = base.copy()
        fn(ImageDraw.Draw(im))
        im.save(os.path.join(OUT_DIR, 'class-%s.png' % line))
        im.resize((64, 64), Image.NEAREST).save(os.path.join(OUT_DIR, 'class-%s@4x.png' % line))
        made.append((line, im))

    cell, pad = 84, 8
    cols = 6
    sheet = Image.new('RGBA', (pad + cols * (cell + pad), pad + cell + 46), (26, 21, 34, 255))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 4), 'base(head-05) + five professions (16x16, 4x here)', fill=(232, 172, 80, 255))
    y = 22
    sheet.alpha_composite(base.resize((64, 64), Image.NEAREST), (pad + 10, y + 6))
    d.text((pad + 10, y + 74), 'base', fill=(120, 110, 140, 255))
    for i, (line, im) in enumerate(made):
        x = pad + (i + 1) * (cell + pad)
        sheet.alpha_composite(im.resize((64, 64), Image.NEAREST), (x + 10, y + 6))
        d.text((x + 10, y + 74), line, fill=(232, 172, 80, 255))
    sheet.save(os.path.join(REVIEW, 'composed.png'))
    print('composed →', os.path.join(REVIEW, 'composed.png'))


if __name__ == '__main__':
    main()
