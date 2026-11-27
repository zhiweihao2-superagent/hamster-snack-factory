"""Build a nearest-neighbour contact sheet so a human/agent can eyeball frames.

Usage: python sheet.py <out.png> <scale> <cols> file1.png [file2.png ...]
Renders each input on a checkerboard cell with its filename label area omitted
(labels are drawn into the console instead, so the sheet stays clean pixel art).
"""
import sys
from PIL import Image

BG1 = (46, 42, 54)
BG2 = (58, 54, 68)


def main():
    out, scale, cols = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    files = sys.argv[4:]
    ims = [Image.open(f).convert("RGBA") for f in files]
    cw = max(i.width for i in ims) * scale
    ch = max(i.height for i in ims) * scale
    pad = 6
    rows = (len(ims) + cols - 1) // cols
    W = cols * (cw + pad) + pad
    H = rows * (ch + pad) + pad
    sheet = Image.new("RGBA", (W, H), BG1)
    for idx, im in enumerate(ims):
        c, r = idx % cols, idx // cols
        x, y = pad + c * (cw + pad), pad + r * (ch + pad)
        cell = Image.new("RGBA", (cw, ch), BG2)
        for yy in range(0, ch, 8):
            for xx in range(0, cw, 8):
                if ((xx // 8) + (yy // 8)) % 2 == 0:
                    cell.paste(BG1, (xx, yy, min(xx + 8, cw), min(yy + 8, ch)))
        big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        cell.alpha_composite(big, ((cw - big.width) // 2, (ch - big.height) // 2))
        sheet.alpha_composite(cell, (x, y))
    sheet.save(out)
    print("wrote %s (%dx%d) cells=%d" % (out, W, H, len(ims)))
    for idx, f in enumerate(files):
        print("  cell %2d  %s" % (idx, f))


if __name__ == "__main__":
    main()
