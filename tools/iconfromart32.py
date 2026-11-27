"""
职业图标（用 64 原画的头部窗口，32×32 显示）

    python tools/iconfromart.py --size 32

- 从 64 原画裁 32×32 的"头 + 武器"窗口（不缩放，1:1 像素）；
- 存盘时放大 2× 成 64×64（@4x 约定），游戏里按 32 逻辑像素绘制 → 正好 1:1，清晰不糊；
- 脸与游戏里完全一致，所以一定"像仓鼠"。

窗口偏移按职业调，把武器带进画面：
  tank 盾在左 → dx -3 ；blade 刀在右 → dx +3 ；shot 弩在右上 → dx +3, dy -2
  hex 帽子在上、法杖在右 → dx +2, dy -3 ；care 药箱在右下 → dx +2, dy +1
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
        win = head_window(big, dx, dy)                 # 32×32
        win.save(os.path.join(OUT, 'class-%s.png' % line))
        win.resize((64, 64), Image.NEAREST).save(os.path.join(OUT, 'class-%s@4x.png' % line))
        made.append((line, win))

    cell, pad = 96, 10
    W = pad + len(made) * (cell + pad)
    H = 30 + 2 * (cell + pad)
    sheet = Image.new('RGBA', (W, H), (26, 21, 34, 255))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 6), '32x32 head window (native pixels) / below: at 32px and 24px on screen',
           fill=(232, 172, 80, 255))
    for i, (line, im) in enumerate(made):
        x = pad + i * (cell + pad)
        sheet.alpha_composite(im.resize((64, 64), Image.NEAREST), (x + 8, 24))
        d.text((x + 8, 92), line, fill=(232, 172, 80, 255))
        y2 = 30 + cell + pad
        sheet.alpha_composite(im, (x + 8, y2))
        d.text((x + 8, y2 + 36), '32px', fill=(120, 110, 140, 255))
        sheet.alpha_composite(im.resize((24, 24), Image.NEAREST), (x + 52, y2 + 4))
        d.text((x + 52, y2 + 36), '24px', fill=(120, 110, 140, 255))
    sheet.save(os.path.join(REVIEW, 'fromart32.png'))
    print('saved', os.path.join(REVIEW, 'fromart32.png'))


if __name__ == '__main__':
    main()
