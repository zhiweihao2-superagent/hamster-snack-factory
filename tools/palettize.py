"""
把 Codex 出的敌方帧"映射到我们原画的调色板"——这是解决"糊成一团"的关键一步：
模型图有大量中间灰；映射到 foe-shell-2 那 12~16 个色之后，灰只留 3 档、粉留 1 档，
边缘也不会再有半透明过渡，视觉上和手绘原画同一个色语言。

    python tools/palettize.py <in_dir> <out_dir>
"""
from PIL import Image
import os, sys
from collections import Counter

REF = 'art/frames/foe-shell-2/idle1.png'


def ref_palette(path):
    im = Image.open(path).convert('RGBA')
    cnt = Counter()
    for px in im.getdata():
        if px[3] > 128:
            cnt[(px[0], px[1], px[2])] += 1
    return [c for c, _ in cnt.most_common(24)]


def nearest(pal, rgb):
    best, bd = pal[0], 1 << 30
    r, g, b = rgb
    for (pr, pg, pb) in pal:
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if d < bd:
            bd, best = d, (pr, pg, pb)
    return best


def main():
    src, dst = sys.argv[1], sys.argv[2]
    pal = ref_palette(REF)
    os.makedirs(dst, exist_ok=True)
    n = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith('.png'):
            continue
        im = Image.open(os.path.join(src, f)).convert('RGBA')
        out = Image.new('RGBA', im.size, (0, 0, 0, 0))
        sp, dp = im.load(), out.load()
        for y in range(im.height):
            for x in range(im.width):
                px = sp[x, y]
                if px[3] <= 110:
                    continue
                r, g, b = nearest(pal, px[:3])
                dp[x, y] = (r, g, b, 255)
        out.save(os.path.join(dst, f))
        n += 1
    print('palettized', n, 'files with', len(pal), 'colors →', dst)


if __name__ == '__main__':
    main()
