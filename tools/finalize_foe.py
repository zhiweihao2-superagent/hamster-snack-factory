"""
敌方帧"最后一道工序"：把我们能控制的像素特征补回去，专治"糊成一团"。

    python tools/finalize_foe.py <in_dir> <out_dir> [colors]

1. 映射到现网原画（foe-shell-2）的调色板；
2. alpha 二值化；
3. **沿剪影补 1px 深棕描边** `#3a241e`（模型图最缺的就是这个）；
4. 去孤立像素（3×3 邻域少于 2 个实体的点清掉）；
5. 6 色再收一遍（把残留的中间灰并成 3 档）。
"""
from PIL import Image
import os, sys
from collections import Counter

REF = 'art/frames/foe-shell-2/idle1.png'
INK = (58, 36, 30)


def palette(path, n=20):
    im = Image.open(path).convert('RGBA')
    c = Counter()
    for px in im.getdata():
        if px[3] > 128:
            c[(px[0], px[1], px[2])] += 1
    return [k for k, _ in c.most_common(n)]


def nearest(pal, rgb):
    r, g, b = rgb
    best, bd = pal[0], 1 << 30
    for p in pal:
        d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2
        if d < bd:
            bd, best = d, p
    return best


def run(src, dst, colors):
    pal = palette(REF, colors)
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith('.png'):
            continue
        im = Image.open(os.path.join(src, f)).convert('RGBA')
        w, h = im.size
        sp = im.load()
        out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        dp = out.load()
        for y in range(h):
            for x in range(w):
                px = sp[x, y]
                if px[3] <= 110:
                    continue
                r, g, b = nearest(pal, px[:3])
                dp[x, y] = (r, g, b, 255)
        # 1px 外描边
        edge = []
        for y in range(h):
            for x in range(w):
                if dp[x, y][3] != 0:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and dp[nx, ny][3] != 0:
                        edge.append((x, y))
                        break
        for x, y in edge:
            dp[x, y] = (INK[0], INK[1], INK[2], 255)
        # 去孤立
        for y in range(h):
            for x in range(w):
                if dp[x, y][3] == 0:
                    continue
                n = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and dp[nx, ny][3] != 0:
                            n += 1
                if n <= 1:
                    dp[x, y] = (0, 0, 0, 0)
        out.save(os.path.join(dst, f))
    print('finalized →', dst)


if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 10)
