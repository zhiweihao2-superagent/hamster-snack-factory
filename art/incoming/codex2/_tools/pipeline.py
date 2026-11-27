#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
pipeline.py — 把 Codex/imagen 产出的高分辨率原图，降采样并像素化成项目规格的 sprite。

步骤（严格按交付要求）：
  1. convert('RGBA') → getbbox() 裁掉透明边 → 缩放到目标尺寸（Image.LANCZOS）
  2. 调色板量化到 16–24 色（quantize(method=Image.MEDIANCUT, dither=NONE)，用 #3a241e 兜底合成以保留 alpha 语义）
  3. alpha 二值化（>128 → 255，其余 0），3×3 邻域内 alpha=255 少于 2 个的孤立像素清掉
  4. 脚底对齐 / 水平居中，落盘

原图不是透明背景时（很多图像模型会给纯白底或假棋盘格），先做边缘连通洪水抠底。

用法：
  python pipeline.py --src RAW.png --out OUT.png --size 64 --mode char --foot 61 --palette ally
  python pipeline.py --src RAW.png --out OUT.png --size 16 --mode icon --palette ally --colors 18
  python pipeline.py --src RAW.png --out OUT.png --size 32 --mode fx   --palette fx
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# ---------------------------------------------------------------- 品牌调色板
BRAND = {
    # 共有
    "outline": "#3a241e",
    "cream":   "#fae8c8",
    "pink":    "#f09ca8",
    # 我方
    "orange":  "#e8843e",
    "orange_d": "#b85f27",
    "cream_d": "#e0c49c",
    "pink_d":  "#b86b78",
    "eye":     "#2b1a14",
    "white":   "#fff8ee",
    # 敌方
    "gray":    "#8a8f96",
    "gray_d":  "#5e6369",
    "gray_l":  "#b0b5bb",
    "red":     "#e8402c",
    "red_d":   "#9e2418",
    # 特效
    "fire_y":  "#ffe27a",
    "fire_o":  "#ff9a3c",
    "fire_r":  "#e8402c",
    "fire_d":  "#8c2416",
    "smoke":   "#6b5f58",
    "smoke_l": "#a89a90",
}

ICON_RESAMPLE = Image.NEAREST   # 图标缩到 16px 用最近邻：BOX 会把小星星和黄纸混成一片

PALETTE_SETS = {
    "ally":  ["outline", "orange", "orange_d", "cream", "cream_d", "pink", "pink_d", "eye", "white"],
    "enemy": ["outline", "gray", "gray_d", "gray_l", "red", "red_d", "cream", "pink", "eye", "white"],
    "fx":    ["outline", "fire_y", "fire_o", "fire_r", "fire_d", "smoke", "smoke_l"],
    "none":  [],
}


def hex2rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


# ---------------------------------------------------------------- 抠底
def cutout_background(rgba: np.ndarray, tol: int = 26) -> np.ndarray:
    """原图若不透明，从四边洪水抠掉连通的纯色底（白底 / 假棋盘格 / 纯色底）。"""
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3]
    if alpha.min() < 250:          # 本来就有透明区域，不动
        return rgba

    rgb = rgba[:, :, :3].astype(np.int16)
    ring = np.concatenate([
        rgb[0, :, :].reshape(-1, 3), rgb[-1, :, :].reshape(-1, 3),
        rgb[:, 0, :].reshape(-1, 3), rgb[:, -1, :].reshape(-1, 3),
    ])
    border_cols = [c for c, n in Counter(map(tuple, ring)).most_common(6) if n > 0]
    seeds = border_cols[:3]

    out = rgba.copy()
    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def is_bg(y: int, x: int) -> bool:
        px = rgb[y, x]
        for s in seeds:
            if abs(int(px[0]) - s[0]) <= tol and abs(int(px[1]) - s[1]) <= tol and abs(int(px[2]) - s[2]) <= tol:
                return True
        return False

    for x in range(w):
        q.append((0, x)); q.append((h - 1, x))
    for y in range(h):
        q.append((y, 0)); q.append((y, w - 1))

    while q:
        y, x = q.popleft()
        if y < 0 or x < 0 or y >= h or x >= w or visited[y, x]:
            continue
        if not is_bg(y, x):
            continue
        visited[y, x] = True
        out[y, x, 3] = 0
        q.append((y + 1, x)); q.append((y - 1, x))
        q.append((y, x + 1)); q.append((y, x - 1))

    return out


# ---------------------------------------------------------------- 量化
def quantize_rgb(rgba: np.ndarray, n: int, palette_name: str, snap_tol: int = 62) -> np.ndarray:
    """在 #3a241e 上合成后做 MEDIANCUT 量化（Dither NONE），再把靠近品牌色的调色板槽位吸附成品牌色。"""
    img = Image.fromarray(rgba, "RGBA")
    bg = Image.new("RGBA", img.size, hex2rgb(BRAND["outline"]) + (255,))
    flat = Image.alpha_composite(bg, img).convert("RGB")

    q = flat.quantize(colors=max(16, min(24, n)), method=Image.MEDIANCUT, dither=Image.NONE)
    pal = q.getpalette()[: 256 * 3]
    lut = np.array(q, dtype=np.uint8)

    slots = []
    for i in range(max(pal) and len(pal) // 3):
        slots.append((pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]))

    brand = [hex2rgb(BRAND[k]) for k in PALETTE_SETS.get(palette_name, [])]
    new_slots = list(slots)
    if brand:
        for i, c in enumerate(slots):
            if i >= len(new_slots):
                break
            best, bd = None, 1e9
            for b in brand:
                d = sum((int(c[j]) - b[j]) ** 2 for j in range(3)) ** 0.5
                if d < bd:
                    best, bd = b, d
            if best is not None and bd <= snap_tol:
                new_slots[i] = best

    # 去重 + 回填映射
    uniq: list[tuple[int, int, int]] = []
    remap = {}
    for i, c in enumerate(new_slots):
        if c not in uniq:
            uniq.append(c)
        remap[i] = uniq.index(c)

    out = np.zeros((rgba.shape[0], rgba.shape[1], 3), dtype=np.uint8)
    for idx, c in remap.items():
        m = lut == idx
        if m.any():
            out[m] = uniq[c]

    res = rgba.copy()
    res[:, :, :3] = out
    return res


# ---------------------------------------------------------------- alpha
def binarize_alpha(rgba: np.ndarray, thresh: int = 128, min_neighbors: int = 2) -> np.ndarray:
    """alpha 二值化 + 去孤立像素。
    min_neighbors=2 用于角色（3×3 邻域内 alpha=255 少于 2 个就清掉）；
    图标用 min_neighbors=1，避免把闪电分叉、细鞭之类的必要细节一起削掉。"""
    a = rgba[:, :, 3]
    b = np.where(a > thresh, 255, 0).astype(np.uint8)
    if min_neighbors > 0:
        h, w = b.shape
        on = (b == 255)
        pad = np.pad(on, 1, mode="constant", constant_values=False)
        cnt = np.zeros((h, w), dtype=np.int16)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                cnt += pad[1 + dy:1 + dy + h, 1 + dx:1 + dx + w].astype(np.int16)
        # 自身计入 cnt，先去自身
        cnt = cnt - on.astype(np.int16)
        drop = on & (cnt < min_neighbors)
        b[drop] = 0
    out = rgba.copy()
    out[:, :, 3] = b
    out[b == 0] = 0
    return out


# ---------------------------------------------------------------- 描边收敛
def enforce_outline(rgba: np.ndarray, color: tuple[int, int, int] = (58, 36, 30),
                    width: int = 1) -> np.ndarray:
    """剪影内侧压 1px 纯 #3a241e 描边。
    图像模型降采样后描边会被混色糊成中间调，这一道把它收敛回项目要求的硬描边。"""
    out = rgba.copy()
    for _ in range(max(1, width)):
        a = out[:, :, 3] > 0
        edge = np.zeros_like(a)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.roll(a, (dy, dx), axis=(0, 1))
            if dy == 1:
                shifted[0, :] = False
            elif dy == -1:
                shifted[-1, :] = False
            elif dx == 1:
                shifted[:, 0] = False
            elif dx == -1:
                shifted[:, -1] = False
            edge |= a & ~shifted
        out[edge] = (*color, 255)
    return out


# ---------------------------------------------------------------- 缩放
ALPHA_FLOOR = 24      # 低于此值视为噪点（图像模型常在画布边缘留 1–5 的极淡 alpha）


def robust_bbox(rgba: np.ndarray, floor: int = ALPHA_FLOOR) -> tuple[int, int, int, int]:
    """按 alpha > floor 求紧包围盒。getbbox() 用 >0，会被画布边缘的极淡噪点撑满整张画布。"""
    a = rgba[:, :, 3]
    ys, xs = np.nonzero(a > floor)
    if len(ys) == 0:
        ys, xs = np.nonzero(a > 0)
    if len(ys) == 0:
        raise SystemExit("原图全是透明的，无法处理")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def detect_grid(img: Image.Image, lo: int = 6, hi: int = 40) -> int:
    """检测图像模型像素画的原生格子边长（块大小）。
    对每个候选 g，按格中心最近邻采样再放大回去，取重建误差最小的 g。
    图像模型的"像素画"格子是规则的，这一步拿到真正的 1px 网格，
    后续按格中心采样才不会把 24:1 降采样糊成一团中间调。"""
    small = img.convert("RGBA")
    # 先缩到可处理的尺寸检测，省时间（比例关系不变）
    scale = 1.0
    if max(small.size) > 512:
        scale = 512 / max(small.size)
        small = small.resize((max(1, int(small.width * scale)), max(1, int(small.height * scale))), Image.NEAREST)

    arr = np.array(small).astype(np.int16)
    best_g, best_err = 1, 1e18
    for g in range(lo, hi + 1):
        w, h = small.width // g, small.height // g
        if w < 8 or h < 8:
            break
        idx_x = (np.arange(w) * g + g // 2).clip(0, small.width - 1)
        idx_y = (np.arange(h) * g + g // 2).clip(0, small.height - 1)
        sampled = arr[np.ix_(idx_y, idx_x)]
        back = np.repeat(np.repeat(sampled, g, axis=0), g, axis=1)[:small.height, :small.width]
        diff = np.abs(back[:, :, :3] - arr[:back.shape[0], :back.shape[1], :3])
        err = float(diff.mean())
        if err < best_err - 1e-6:
            best_err, best_g = err, g
    return max(1, int(round(best_g / scale)))


def grid_sample(img: Image.Image, g: int, target_w: int, target_h: int) -> Image.Image:
    """按原生格子中心最近邻采样到"艺术像素网格"，再无插值放大/裁到目标尺寸。"""
    w = max(1, img.width // g)
    h = max(1, img.height // g)
    idx_x = (np.arange(w) * g + g // 2).clip(0, img.width - 1)
    idx_y = (np.arange(h) * g + g // 2).clip(0, img.height - 1)
    arr = np.array(img.convert("RGBA"))[np.ix_(idx_y, idx_x)]
    art = Image.fromarray(arr, "RGBA")
    return art.resize((target_w, target_h), Image.NEAREST)


def fit_resize(rgba: np.ndarray, size: int, mode: str, char_h: int | None = None,
               g: int | None = None, icon_crop: tuple[float, float] | None = None) -> np.ndarray:
    """裁掉透明边 → 按原生像素格最近邻采样 → 放到目标画布的正确占位。

    icon_crop=(cy, side_frac)：只用图标。先按原图宽的 side_frac 取一个正方形取景框，
    纵向中心落在 cy（0=顶 1=底）。细高的图标（幸运签之类）缩到 16px 时主体会只剩几像素，
    方框取景能把主体撑满画布，星星/符号才看得见。
    """
    rgba = rgba.copy()
    rgba[rgba[:, :, 3] <= ALPHA_FLOOR] = 0
    img = Image.fromarray(rgba, "RGBA")
    bbox = robust_bbox(rgba)
    img = img.crop(bbox)

    if mode == "icon" and icon_crop:
        cy, sf = icon_crop
        W, H = img.size
        side = max(4, int(W * sf))
        side = min(side, H) if H > 0 else side
        y0 = max(0, min(H - side, int(H * cy) - side // 2))
        img = img.crop((0, y0, W, y0 + side))

    cell = g if g else detect_grid(img)

    if mode == "char":
        # char_h 给定时按"固定倍率"出图：同一角色的 5 帧共用一个缩放倍率，
        # 蹲伏/前冲帧不会因为变矮而被放大、也不会因为变宽而被压小 —— 这是动画不"缩水"的关键。
        target_h = char_h if char_h else int(size * 0.82)
        target_w = int(round(img.width * target_h / img.height))
        if not char_h:
            target_w = min(target_w, int(size * 0.94))
            target_h = int(round(img.height * target_w / img.width))
        target_w = min(target_w, size * 2)   # 只防极端值；超宽不再挤压，改中心裁剪
        over = target_w > size
        draw_w = max(4, target_w)
        art = grid_sample(img, cell, draw_w, max(4, target_h))
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        if over:
            # 超宽帧按真实宽度渲染后中心裁到画布，保持像素比例不变形（宁可裁掉尾巴尖也不压扁身体）
            left = (draw_w - size) // 2
            art = art.crop((left, 0, left + size, art.height))
            x = 0
        else:
            x = (size - target_w) // 2
        canvas.alpha_composite(art, (max(0, x), max(0, size - target_h)))
        return np.array(canvas)
    else:
        target = int(size * (0.92 if mode == "fx" else 0.88))
        if mode == "icon":
            # 图标要缩到 16px，直接用最近邻采到 16 会把细部（闪电分叉、糖纸角）整列整行丢掉；
            # 先采到原生像素网格，再用 BOX 做区块平均——整数比时等价于"一格取一次"，边缘干净不糊。
            w = max(1, img.width // cell)
            h = max(1, img.height // cell)
            idx_x = (np.arange(w) * cell + cell // 2).clip(0, img.width - 1)
            idx_y = (np.arange(h) * cell + cell // 2).clip(0, img.height - 1)
            arr2 = np.array(img.convert("RGBA"))[np.ix_(idx_y, idx_x)]
            art = Image.fromarray(arr2, "RGBA")
            side = max(art.width, art.height)
            square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            square.alpha_composite(art, ((side - art.width) // 2, (side - art.height) // 2))
            art = square.resize((target, target), ICON_RESAMPLE)
        else:
            art = grid_sample(img, cell, target, target)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.alpha_composite(art, ((size - target) // 2, (size - target) // 2))
        return np.array(canvas)


# ---------------------------------------------------------------- 锚点
def align(rgba: np.ndarray, mode: str, foot_y: int, center_x: int | None = None) -> np.ndarray:
    a = rgba[:, :, 3]
    ys, xs = np.nonzero(a)
    if len(ys) == 0:
        raise SystemExit("二值化后没有可见像素")
    h, w = a.shape
    top, bottom = ys.min(), ys.max()
    left, right = xs.min(), xs.max()

    if mode == "char":
        dy = foot_y - bottom
    else:
        dy = int(round((h - 1) / 2 - (top + bottom) / 2))
    cx = center_x if center_x is not None else w // 2
    dx = int(round(cx - (left + right) / 2))

    out = np.zeros_like(rgba)
    src = rgba
    ys0, ys1 = max(0, -dy), min(h, h - dy)
    xs0, xs1 = max(0, -dx), min(w, w - dx)
    out[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx] = src[ys0:ys1, xs0:xs1]
    return out


# ---------------------------------------------------------------- 主流程
def process(src: Path, out: Path, size: int, mode: str, foot: int,
            colors: int, palette: str, char_h: int | None, snap_tol: int = 30, outline_w: int = 1,
            icon_crop: tuple[float, float] | None = None, denoise: int = 0) -> dict:
    raw = Image.open(src).convert("RGBA")
    arr = np.array(raw)
    arr = cutout_background(arr)
    arr = fit_resize(arr, size, mode, char_h, icon_crop=icon_crop)
    if denoise > 0:
        # 图像模型的毛发/阴影碎块降到 64px 会成为深色麻点；3×3 中值只压色斑，不动 alpha
        im = Image.fromarray(arr, "RGBA")
        rgb = im.convert("RGB").filter(ImageFilter.MedianFilter(denoise))
        arr = np.dstack([np.array(rgb), arr[:, :, 3]])
    arr = quantize_rgb(arr, colors, palette, snap_tol)
    arr = binarize_alpha(arr)
    if outline_w > 0:
        arr = enforce_outline(arr, width=outline_w)
    arr = align(arr, mode, foot)

    img = Image.fromarray(arr, "RGBA")
    img = img.point(lambda v: 255 if v == 255 else v)  # 数值稳定
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)

    a = np.array(img)[:, :, 3]
    ys, xs = np.nonzero(a)
    cols = Counter(map(tuple, np.array(img).reshape(-1, 4)[a.reshape(-1) > 0][:, :3]))
    return {
        "file": out.name,
        "size": f"{img.width}x{img.height}",
        "colors": len(cols),
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
        "foot_row": int(ys.max()),
        "cx": round(float((xs.min() + xs.max()) / 2), 1),
        "coverage": round(float((a > 0).mean() * 100), 1),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=64)
    ap.add_argument("--mode", choices=["char", "icon", "fx"], default="char")
    ap.add_argument("--foot", type=int, default=61)
    ap.add_argument("--colors", type=int, default=20)
    ap.add_argument("--palette", choices=list(PALETTE_SETS), default="ally")
    ap.add_argument("--char-h", type=int, default=None)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--snap-tol", type=int, default=30)
    ap.add_argument("--outline", type=int, default=1, help="1px 描边收敛；0 = 关闭")
    ap.add_argument("--icon-crop", type=str, default=None, help="图标方框取景 cy,side_frac")
    args = ap.parse_args()

    icrop = tuple(float(x) for x in args.icon_crop.split(",")) if args.icon_crop else None
    info = process(Path(args.src), Path(args.out), args.size, args.mode, args.foot,
                   args.colors, args.palette, args.char_h, args.snap_tol, args.outline, icrop)
    print(json.dumps(info, ensure_ascii=False) if args.json else info)


if __name__ == "__main__":
    main()
