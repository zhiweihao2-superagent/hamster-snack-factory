
from PIL import Image, ImageDraw
import os

root = r'D:\deepseek\杂项\hamster-snack-factory'
out = r'D:\deepseek\杂项\hamster-snack-factory\art\review\foescale'

def load(p):
    return Image.open(p).convert('RGBA')

def nearest(im, size):
    return im.resize((size, size), Image.NEAREST)

def tight(im, box=64):
    bb = im.getbbox()
    if not bb: return im
    cut = im.crop(bb)
    canvas = Image.new('RGBA', (box, box), (0, 0, 0, 0))
    x = (box - cut.width) // 2
    y = box - cut.height
    canvas.alpha_composite(cut, (max(0, x), max(0, y)))
    return canvas

def bake_big(im, scale=1.1, box=64):
    """放大到 70 后，以"脚底 + 身体中心"为锚点裁回 64：体积变大，边缘裁掉。"""
    big = nearest(im, int(round(64 * scale)))
    bb = big.getbbox()
    if not bb: return im
    # 以原图 bbox 的脚底与水平中心为锚点
    ob = im.getbbox()
    cx = (ob[0] + ob[2]) / 2 * scale
    foot = ob[3] * scale
    left = int(round(cx - box / 2))
    top = int(round(foot - box))
    return big.crop((left, top, left + box, top + box))

rows = [
    ('crate T2', 'foe-crate-2'),
    ('shell T2', 'foe-shell-2'),
    ('boss T2',  'foe-boss-2'),
    ('glue T2',  'foe-glue-2'),
    ('blast(=shell art)', 'foe-shell-3'),
]
ally = tight(load(os.path.join(root, 'art', 'frames', 'tank-2', 'idle1.png')))

cell, pad, label_h = 100, 10, 15
cols = ['A 64 (now)', 'B 70 display 1.1x', 'C bake 1.1 -> 64', 'D tight 64']
W = pad + (cell + pad) * (len(cols) + 1) + 130
H = pad + label_h + len(rows) * (cell + pad + label_h)
sheet = Image.new('RGBA', (W, H), (26, 21, 34, 255))
d = ImageDraw.Draw(sheet)
d.text((pad, 4), 'left = hamster 64 (reference)', fill=(200, 188, 216, 255))
for c, name in enumerate(cols):
    d.text((pad + 130 + c * (cell + pad), 4), name, fill=(232, 172, 80, 255))

for r, (label, key) in enumerate(rows):
    src = load(os.path.join(root, 'art', 'frames', key, 'idle1.png'))
    y = pad + label_h + r * (cell + pad + label_h)
    d.text((pad, y), label, fill=(200, 188, 216, 255))
    y += label_h
    sheet.alpha_composite(ally, (pad + (cell - 64) // 2, y + (cell - 64)))
    vs = [src, nearest(src, 70), bake_big(src, 1.1, 64), tight(src, 64)]
    for c, im in enumerate(vs):
        x = pad + 130 + c * (cell + pad)
        w, h = im.size
        sheet.alpha_composite(im, (x + (cell - w) // 2, y + (cell - h)))
    d.text((pad, y + cell + 1), 'ref', fill=(120, 110, 140, 255))

sheet.save(os.path.join(out, 'compare.png'))
print('saved', sheet.size)

