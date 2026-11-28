"""把 pixelfx 导出的 sheet 打包成我们游戏的 FX 资源（v2）。

- 30fps 抽样到目标帧率
- 可选裁剪（爆炸只留下半）
- 再按整段动画的**并集包围盒**裁掉四周空白，枢轴同步平移
- 同时输出 PNG 与无损 WebP（体积更小）
- 输出 art/fx/<name>/<name>.png + <name>.json {frameSize, cols, rows, frames, fps, pivot, loop}
"""
import json
import os
from PIL import Image

SRC = 'tools/_pixelfx/pixelfx/records'
DST = 'art/fx'

# name: (源 id, 目标帧率, 裁剪框 或 None)
JOBS = {
    'arrow':    ('projectiles/arrow', 15, None),
    'hit':      ('impacts/hit-spark', 15, None),
    'chain':    ('lightning/chain-lightning', 15, None, 28),
    'charge':   ('arcane/spell-charge', 15, None, 14),
    'fireball': ('fire/fireball', 15, None),
    'frost':    ('ice/snowflake-burst', 15, None, 26),
    'heal':     ('holy/heal', 15, None, 24),
    'boom':     ('explosions/small-explosion', 15, (0, 96, 300, 240), 14),
    'lance':    ('ice/ice-lance', 15, None),
}

COLS = 8
MARGIN = 2
manifest = {}
tot = 0

for name, spec in JOBS.items():
    src_id, target_fps, crop = spec[0], spec[1], spec[2]
    max_frames = spec[3] if len(spec) > 3 else None
    base = os.path.join(SRC, src_id)
    fname = src_id.split('/')[1]
    sheet = Image.open(os.path.join(base, fname + '.png')).convert('RGBA')
    meta = json.load(open(os.path.join(base, fname + '.json'), encoding='utf-8'))['meta']['pixelfx']
    fw, fh = meta['frameSize']
    cols, n = meta['columns'], meta['frames']
    pivot = meta['pivot']

    frames = []
    for i in range(n):
        c, r = i % cols, i // cols
        f = sheet.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
        if crop:
            f = f.crop(crop)
        frames.append(f)

    step = max(1, round(meta['fps'] / target_fps))
    frames = frames[::step]
    if max_frames: frames = frames[:max_frames]

    # 并集包围盒
    box = None
    for f in frames:
        bb = f.getbbox()
        if not bb:
            continue
        box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]),
                                      max(box[2], bb[2]), max(box[3], bb[3]))
    if box:
        l = max(0, box[0] - MARGIN)
        t = max(0, box[1] - MARGIN)
        r = min(frames[0].size[0], box[2] + MARGIN)
        b = min(frames[0].size[1], box[3] + MARGIN)
        frames = [f.crop((l, t, r, b)) for f in frames]
        pv = [pivot[0] - (crop[0] if crop else 0) - l, pivot[1] - (crop[1] if crop else 0) - t]
    else:
        pv = [pivot[0] - (crop[0] if crop else 0), pivot[1] - (crop[1] if crop else 0)]

    cw, ch = frames[0].size
    rows = (len(frames) + COLS - 1) // COLS
    atlas = Image.new('RGBA', (cw * COLS, ch * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        atlas.paste(f, ((i % COLS) * cw, (i // COLS) * ch))

    d = os.path.join(DST, name)
    os.makedirs(d, exist_ok=True)
    png = os.path.join(d, name + '.png')
    webp = os.path.join(d, name + '.webp')
    atlas.save(png, optimize=True)
    atlas.save(webp, 'WEBP', lossless=True, quality=100, method=6)

    info = {
        'frameSize': [cw, ch],
        'cols': COLS,
        'rows': rows,
        'frames': len(frames),
        'fps': round(meta['fps'] / step, 2),
        'pivot': pv,
        'loop': bool(meta.get('loop')),
        'source': src_id,
        'license': 'MIT · patch-gg/pixelfx',
    }
    json.dump(info, open(os.path.join(d, name + '.json'), 'w', encoding='utf-8'), indent=1)
    manifest[name] = info
    kb = os.path.getsize(webp) / 1024
    tot += kb
    print('%-9s %3dx%-3d %2d帧 %4.0ffps  webp %6.1fKB' % (name, cw, ch, len(frames), info['fps'], kb))

print('TOTAL webp %.0f KB' % tot)
json.dump(manifest, open(os.path.join(DST, 'MANIFEST.json'), 'w', encoding='utf-8'), indent=1)
