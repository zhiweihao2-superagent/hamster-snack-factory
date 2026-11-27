"""
职业图标：从 64 原画裁头部窗口，输出**两档原生尺寸**，避免任何非整数缩放。

    python tools/iconfromart32.py

- `class-<line>@4x.png`   ← 32×32 头部窗口（详情页按 32 绘制）
- `class-<line>-s@4x.png` ← 同一窗口 2:1 降到 16×16（卡片按 16 绘制）

以前卡片把 32px 资源画到 20px（0.63 倍），所以看着糊；现在两档都是 1:1 整数，像素不会被揉。
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
TIER = 2
LINES = ['tank', 'blade', 'shot', 'hex', 'care']
# 窗口偏移：把各职业的武器带进画面
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
        win = head_window(big, dx, dy)                     # 32×32 原生
        small = win.resize((16, 16), Image.NEAREST)        # 2:1 整数
        win.save(os.path.join(OUT, 'class-%s.png' % line))
        win.save(os.path.join(OUT, 'class-%s@4x.png' % line))
        small.save(os.path.join(OUT, 'class-%s-s.png' % line))
        small.save(os.path.join(OUT, 'class-%s-s@4x.png' % line))
        made.append((line, win, small))

    cell, pad = 96, 10
    W = pad + len(made) * (cell + pad)
    H = 30 + 2 * (cell + pad)
    sheet = Image.new('RGBA', (W, H), (26, 21, 34, 255))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 6), 'top = 32px asset drawn at 32 / bottom = 16px asset drawn at 16 (crisp)',
           fill=(232, 172, 80, 255))
    for i, (line, win, small) in enumerate(made):
        x = pad + i * (cell + pad)
        sheet.alpha_composite(win.resize((64, 64), Image.NEAREST), (x + 10, 22))
        d.text((x + 10, 92), line + ' 32', fill=(232, 172, 80, 255))
        y2 = 30 + cell + pad
        sheet.alpha_composite(small.resize((64, 64), Image.NEAREST), (x + 10, y2))
        d.text((x + 10, y2 + 70), line + ' 16', fill=(120, 110, 140, 255))
    sheet.save(os.path.join(REVIEW, 'sizes.png'))
    print('saved', os.path.join(REVIEW, 'sizes.png'))


if __name__ == '__main__':
    main()
