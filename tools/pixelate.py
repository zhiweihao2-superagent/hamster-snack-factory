"""
把 model 出的 64px 敌方帧"再像素化"一遍，让它们和手绘原画一样硬边。

    python tools/pixelate.py <in_dir> <out_dir> [--grid 32] [--colors 10]

做法（这是像素画缩小的标准流程）：
1. 64 → grid（默认 32）用 BOX 区域平均，把 4 个像素并成 1 个；
2. 量化到 colors 色（MEDIANCUT, dither NONE）；
3. alpha 二值化（>110 → 255）；
4. 沿剪影**强制 1px 描边** `#3a241e`（外轮廓，不含内部）；
5. 去掉孤立像素；
6. 再放大回 64（NEAREST 2×）—— 所有细节都变成 2px 一块，和手绘原画同一密度。
"""
from PIL import Image
import os, sys

OUTLINE = (58, 36, 30, 255)


def pixelate(im, grid=32, colors=10):
    alpha = im.split()[3]
    small = im.convert("RGB").resize((grid, grid), Image.BOX)
    a = alpha.resize((grid, grid), Image.BOX).point(lambda v: 255 if v > 110 else 0)
    q = small.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGBA")
    q.putalpha(a)

    px = q.load()
    # 1px 外描边：alpha=0 但与实体相邻 → 画描边
    edge = []
    for y in range(grid):
        for x in range(grid):
            if px[x, y][3] != 0:
                continue
            near = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < grid and 0 <= ny < grid and px[nx, ny][3] != 0:
                    near = True
                    break
            if near:
                edge.append((x, y))
    for x, y in edge:
        px[x, y] = OUTLINE

    # 去孤立像素（只有 1 个邻居的实体点）
    for y in range(grid):
        for x in range(grid):
            if px[x, y][3] == 0:
                continue
            n = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < grid and 0 <= ny < grid and px[nx, ny][3] != 0:
                        n += 1
            if n <= 1:
                px[x, y] = (0, 0, 0, 0)

    return q.resize((64, 64), Image.NEAREST)


def main():
    if len(sys.argv) < 3:
        print("usage: pixelate.py <in_dir> <out_dir> [grid] [colors]")
        return
    src, dst = sys.argv[1], sys.argv[2]
    grid = int(sys.argv[3]) if len(sys.argv) > 3 else 32
    colors = int(sys.argv[4]) if len(sys.argv) > 4 else 10
    os.makedirs(dst, exist_ok=True)
    n = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith(".png"):
            continue
        im = Image.open(os.path.join(src, f)).convert("RGBA")
        pixelate(im, grid, colors).save(os.path.join(dst, f))
        n += 1
    print("pixelated", n, "files →", dst, "grid", grid, "colors", colors)


if __name__ == "__main__":
    main()
