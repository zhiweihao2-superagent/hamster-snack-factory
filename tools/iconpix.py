"""
手绘 16×16 职业图标：**同一张基准脸 + 五种武器**。

    python tools/iconpix.py

为什么手绘：
- 模型生成的 16×16 一直"不像仓鼠"；
- 从 64 原画降采样，特征在 2:1 后就糊成一团（眼睛变成 1px 斑）；
- 16×16 这个尺寸必须**按 16 的网格重新画**，只保留"耳朵 + 圆脸 + 两眼 + 吻部"，
  武器用 4×5 的简化图元，这样在任何放大倍数下都清楚。

产物：art/tessera/picks/class-<line>.png（16×16）与 @4x（64×64）
    对照表：art/review/classicons/pix.png
"""
from PIL import Image, ImageDraw
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art', 'tessera', 'picks')
REVIEW = os.path.join(ROOT, 'art', 'review', 'classicons')
os.makedirs(OUT, exist_ok=True)
os.makedirs(REVIEW, exist_ok=True)

# 调色板（与 64 原画同色系）
OUTLINE = (58, 36, 30, 255)
FUR = (232, 132, 62, 255)
FUR_D = (196, 100, 44, 255)
CREAM = (250, 232, 200, 255)
PINK = (240, 156, 168, 255)
BLACK = (36, 24, 24, 255)
WHITE = (250, 250, 250, 255)
STEEL = (186, 194, 206, 255)
STEEL_D = (120, 128, 142, 255)
WOOD = (150, 98, 58, 255)
BLUE = (92, 168, 244, 255)
BLUE_L = (188, 224, 255, 255)
GREEN = (86, 172, 104, 255)
GREEN_L = (198, 238, 200, 255)


def draw_head(d, ox=0, oy=0):
    """基准脸：16×16 网格左上角留出右侧 5px 给武器 → 脸占 x 1..10"""
    def R(x0, y0, x1, y1, c):
        d.rectangle([x0 + ox, y0 + oy, x1 + ox, y1 + oy], fill=c)

    # 耳朵（外轮廓 + 内耳）
    R(2, 1, 4, 3, OUTLINE)
    R(2, 2, 3, 3, PINK)
    R(7, 1, 9, 3, OUTLINE)
    R(8, 2, 9, 3, PINK)
    # 头顶
    R(2, 3, 9, 3, OUTLINE)
    # 脸（三层：轮廓 / 毛 / 吻部）
    R(1, 4, 10, 11, OUTLINE)
    R(2, 4, 9, 11, FUR)
    R(2, 4, 9, 5, FUR_D)
    # 吻部（奶油色）
    R(3, 8, 8, 11, CREAM)
    R(4, 8, 7, 8, CREAM)
    # 眼睛 + 高光
    R(3, 6, 4, 7, BLACK)
    R(7, 6, 8, 7, BLACK)
    d.point((3 + ox, 6 + oy), fill=WHITE)
    d.point((7 + ox, 6 + oy), fill=WHITE)
    # 鼻子 + 嘴
    d.point((5 + ox, 9 + oy), fill=OUTLINE)
    d.point((5 + ox, 10 + oy), fill=OUTLINE)
    # 腮红
    R(2, 8, 2, 9, PINK)
    R(9, 8, 9, 9, PINK)
    # 下巴
    R(1, 12, 10, 12, OUTLINE)
    R(2, 12, 9, 12, CREAM)


def w_shield(d):
    """肉盾：小圆盾（4×5），脸右侧"""
    d.rectangle([11, 6, 15, 10], fill=OUTLINE)
    d.rectangle([12, 6, 14, 10], fill=STEEL)
    d.rectangle([12, 7, 14, 9], fill=STEEL_D)
    d.point((13, 7), fill=STEEL)
    d.point((13, 8), fill=WHITE)


def w_dagger(d):
    """近战：短刀（刃朝上）"""
    d.rectangle([13, 2, 14, 9], fill=OUTLINE)
    d.rectangle([13, 3, 13, 8], fill=STEEL)
    d.point((14, 2), fill=STEEL)
    d.rectangle([12, 9, 15, 9], fill=STEEL_D)
    d.rectangle([13, 10, 14, 12], fill=OUTLINE)
    d.point((13, 11), fill=WOOD)


def w_crossbow(d):
    """远程：小弩（横臂 + 竖身）"""
    d.rectangle([11, 6, 15, 6], fill=OUTLINE)
    d.rectangle([12, 7, 14, 7], fill=STEEL_D)
    d.rectangle([13, 8, 13, 13], fill=OUTLINE)
    d.rectangle([13, 8, 13, 12], fill=WOOD)
    d.point((11, 5), fill=STEEL_D)
    d.point((15, 5), fill=STEEL_D)
    d.point((13, 5), fill=WHITE)


def w_staff(d):
    """魔法：法杖（顶端蓝晶）"""
    d.rectangle([13, 5, 13, 13], fill=OUTLINE)
    d.rectangle([13, 6, 13, 12], fill=WOOD)
    d.rectangle([12, 2, 14, 4], fill=OUTLINE)
    d.rectangle([12, 3, 14, 4], fill=BLUE)
    d.point((13, 2), fill=BLUE_L)
    d.point((15, 3), fill=BLUE_L)


def w_medkit(d):
    """增益：医疗箱（绿底白十字）"""
    d.rectangle([11, 8, 15, 13], fill=OUTLINE)
    d.rectangle([12, 9, 14, 12], fill=GREEN)
    d.rectangle([13, 10, 13, 11], fill=WHITE)
    d.rectangle([12, 10, 14, 10], fill=WHITE)
    d.rectangle([12, 7, 14, 7], fill=GREEN_L)


WEAPONS = {
    'tank': w_shield,
    'blade': w_dagger,
    'shot': w_crossbow,
    'hex': w_staff,
    'care': w_medkit,
}


def main():
    made = []
    for line, fn in WEAPONS.items():
        im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        fn(d)
        draw_head(d)
        im.save(os.path.join(OUT, 'class-%s.png' % line))
        im.resize((64, 64), Image.NEAREST).save(os.path.join(OUT, 'class-%s@4x.png' % line))
        made.append((line, im))

    # 基准脸（无武器）也存一份，方便以后加新职业
    base = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    draw_head(ImageDraw.Draw(base))
    base.save(os.path.join(OUT, 'class-base.png'))
    base.resize((64, 64), Image.NEAREST).save(os.path.join(OUT, 'class-base@4x.png'))

    cell, pad = 96, 10
    W = pad + 6 * (cell + pad)
    H = 30 + 3 * (cell + pad)
    sheet = Image.new('RGBA', (W, H), (26, 21, 34, 255))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 6), 'base + five professions, hand drawn on a 16px grid',
           fill=(232, 172, 80, 255))
    items = [('base', base)] + made
    for i, (line, im) in enumerate(items):
        x = pad + i * (cell + pad)
        sheet.alpha_composite(im.resize((72, 72), Image.NEAREST), (x + 8, 26))
        d.text((x + 8, 104), line, fill=(232, 172, 80, 255))
        sheet.alpha_composite(im.resize((32, 32), Image.NEAREST), (x + 8, 130))
        d.text((x + 8, 168), '32px', fill=(120, 110, 140, 255))
        sheet.alpha_composite(im.resize((16, 16), Image.NEAREST), (x + 8, 196))
        d.text((x + 8, 216), '16px', fill=(120, 110, 140, 255))
    sheet.save(os.path.join(REVIEW, 'pix.png'))
    print('saved', os.path.join(REVIEW, 'pix.png'))


if __name__ == '__main__':
    main()
