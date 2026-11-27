"""
职业图标（头 + 武器，16×16）：从 64 原画裁"头部 + 武器"窗口，2:1 整数降采样。

    python tools/iconfromart.py

- 每个职业给一个窗口偏移（武器在原画的哪一侧就朝那边偏），把武器带进画面；
- 32×32 窗口 → 16×16 用 NEAREST，正好 2:1，像素不变形；
- 脸和游戏里完全一致，所以"像仓鼠"这件事天然成立。

偏移用像素表示（相对"头部中心"）：(dx, dy)
  tank 盾在左侧 → dx -2
  blade 刀在右 → dx +3
  shot 弩在右上 → dx +3, dy -2
  hex 法杖在右、帽子在上 → dx +2, dy -2
  care 药箱在右下 → dx +2, dy +1
"""
from PIL import Image, ImageDraw
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES = os.path.join(ROOT, 'art', 'frames')
OUT = os.path.join(ROOT, 'art', 'tessera', 'picks')
REVIEW = os.path.join(ROOT, 'art', 'review', 'classicons')
os.makedirs(OUT, exist_ok=True)
os.makedirs(REVIEW, exist_ok=True)

WIN = 32
LINES = ['tank', 'blade', 'shot', 'hex', 'care']
TIER = 2
OFFSET = {
    'tank': (-3, 0),
    'blade': (3, 0),
    'shot': (3, -2),
    'hex': (2, -3),
    'care': (2, 1),
}


def head_window(big, dx, dy):
    x0, y0, x1, y1 = big.getbbox()
    h = y1 - y0
    cx = (x0 + x1) // 2 + dx
    cy = y0 + int(h * 0.30) + dy
    left = max(0, min(64 - WIN, cx - WIN // 2))
    top = max(0, min(64 - WIN, cy - WIN // 2))
    return big.crop((left, top, left + WIN, top + WIN))


def main():
    made = []
    for line in LINES:
        src = os.path.join(FRAMES, '%s-%d' % (line, TIER), 'idle1.png')
        if not os.path.exists(src):
            print('缺少原画：', src)
            sys.exit(1)
        big = Image.open(src).convert('RGBA')
        dx, dy = OFFSET[line]
        win = head_window(big, dx, dy)
        small = win.resize((16, 16), Image.NEAREST)
        small.save(os.path.join(OUT, 'class-%s.png' % line))
        small.resize((64, 64), Image.NEAREST).save(os.path.join(OUT, 'class-%s@4x.png' % line))
        made.append((line, small, win, big))

    cell, pad = 104, 10
    W = pad + 5 * (cell + pad)
    H = 34 + 3 * (cell + pad)
    sheet = Image.new('RGBA', (W, H), (26, 21, 34, 255))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 6), 'row1 = 32px window from 64 art / row2 = 16px icon (4x) / row3 = 32px in game',
           fill=(232, 172, 80, 255))
    for i, (line, small, win, big) in enumerate(made):
        x = pad + i * (cell + pad)
        y1 = 24
        sheet.alpha_composite(win.resize((80, 80), Image.NEAREST), (x + 8, y1 + 4))
        d.text((x + 8, y1 + 88), line, fill=(232, 172, 80, 255))
        y2 = y1 + cell + pad
        sheet.alpha_composite(small.resize((80, 80), Image.NEAREST), (x + 8, y2 + 4))
        d.text((x + 8, y2 + 88), '16px icon', fill=(120, 110, 140, 255))
        y3 = y2 + cell + pad
        sheet.alpha_composite(small.resize((32, 32), Image.NEAREST), (x + 8, y3 + 26))
        d.text((x + 8, y3 + 88), '32px on screen', fill=(120, 110, 140, 255))
    sheet.save(os.path.join(REVIEW, 'fromart.png'))
    print('saved', os.path.join(REVIEW, 'fromart.png'))


if __name__ == '__main__':
    main()
