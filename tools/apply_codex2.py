"""
把 codex2 的产出接进项目（只做文件搬运与改名，不改游戏逻辑）。

    python tools/apply_codex2.py [--with-a2]

- A1 白板鼠 5 帧 → art/frames/none-1/（idle1/idle2/windup/strike/hop）
- B1 技能图标 → art/tessera/picks/skill-<id>@4x.png（用 32×32 档）+ skill-<id>-16@4x.png
- B2 天赋图标 → art/tessera/picks/talent-<id>@4x.png
- B3 转职证 → art/tessera/picks/cert-<n>@4x.png
- A2 引信鼠 + A3 爆炸：默认**不接**（A2 待重画，A3 已在用上一版），加 --with-a2 才覆盖
"""
from PIL import Image
import os, sys, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'incoming', 'codex2')
FRAMES = os.path.join(ROOT, 'art', 'frames')
PICKS = os.path.join(ROOT, 'art', 'tessera', 'picks')

FRAME_MAP = {
    'idle-1.png': 'idle1.png',
    'idle-2.png': 'idle2.png',
    'action-windup.png': 'windup.png',
    'action-strike.png': 'strike.png',
    'hop-air.png': 'hop.png',
}


def copy_frames(src_dir, key):
    out = os.path.join(FRAMES, key)
    os.makedirs(out, exist_ok=True)
    n = 0
    for a, b in FRAME_MAP.items():
        p = os.path.join(src_dir, a)
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGBA')
        if im.size != (64, 64):
            im = im.resize((64, 64), Image.NEAREST)
        im.save(os.path.join(out, b))
        n += 1
    return n


def copy_icon(src, key):
    im = Image.open(src).convert('RGBA')
    im.save(os.path.join(PICKS, key + '@4x.png'))
    return im.size


def main():
    with_a2 = '--with-a2' in sys.argv

    # A1 白板鼠
    n = copy_frames(os.path.join(SRC, 'A1-none-1'), 'none-1')
    print('A1 none-1:', n, 'frames')

    # B1 技能图标（32 档优先）
    b1 = os.path.join(SRC, 'B1-icons')
    cnt = 0
    for f in sorted(os.listdir(b1)):
        if not f.endswith('_32.png'):
            continue
        sid = f[:-7]
        size = copy_icon(os.path.join(b1, f), 'skill-' + sid)
        cnt += 1
    print('B1 skill icons:', cnt)

    # B2 天赋图标
    b2 = os.path.join(SRC, 'B2-talents')
    cnt = 0
    if os.path.isdir(b2):
        for f in sorted(os.listdir(b2)):
            if not f.endswith('_32.png'):
                continue
            tid = f[:-7]
            copy_icon(os.path.join(b2, f), 'talent-' + tid)
            cnt += 1
    print('B2 talent icons:', cnt)

    # B3 转职证
    b3 = os.path.join(SRC, 'B3-certs')
    cnt = 0
    if os.path.isdir(b3):
        for f in sorted(os.listdir(b3)):
            if not f.endswith('_32.png'):
                continue
            cid = f[:-7]
            copy_icon(os.path.join(b3, f), cid)
            cnt += 1
    print('B3 cert icons:', cnt)

    if with_a2:
        for t in range(1, 5):
            n = copy_frames(os.path.join(SRC, 'A2-foe-blast-%d' % t), 'foe-blast-%d' % t)
            print('A2 foe-blast-%d:' % t, n, 'frames')


if __name__ == '__main__':
    main()
