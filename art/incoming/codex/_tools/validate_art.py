"""Strict validator for art/incoming/codex deliverables.

Usage:
  python validate_art.py <profile> <width> <height> file1.png [file2.png ...]
  profile: char | icon | fx

Common checks (all profiles, per ART-TODO section 3):
  * exact canvas size
  * PNG mode RGBA (palette / LA / RGB rejected)
  * alpha strictly binary 0/255, no semi-transparent pixel
  * not empty
char  : feet row in [h-3, h-1] (2-3 px transparent bottom margin), bbox centred in x,
        outline #3a241e >= 24 px, subject >= 25% of canvas.
icon  : bbox centred in x and y, outline #3a241e >= 8 px, subject 20-96% of canvas.
fx    : bbox centred in x and y, subject >= 8% of canvas.
Prints one line per file: OK/FAIL <file> <details>. Exit 0 only when all pass.
"""
import sys
from collections import Counter
from PIL import Image

OUTLINE = (0x3A, 0x24, 0x1E)
PROFILES = {"char": 24, "char_air": 24, "icon": 8, "fx": 0}
MAX_COMPONENTS = {"char": 1, "char_air": 1, "icon": 1, "fx": 12}


def components(px, W, H):
    """4-connected opaque components, largest first."""
    from collections import deque
    seen = set()
    sizes = []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] and (x, y) not in seen:
                q = deque([(x, y)])
                seen.add((x, y))
                n = 0
                while q:
                    cx, cy = q.popleft()
                    n += 1
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and px[nx, ny][3]:
                            seen.add((nx, ny))
                            q.append((nx, ny))
                sizes.append(n)
    sizes.sort(reverse=True)
    return sizes


def check(path, w, h, profile):
    errs, info = [], {}
    try:
        im = Image.open(path)
    except Exception as e:  # noqa: BLE001
        return False, ["cannot open: %s" % e], {}
    info["mode"] = im.mode
    if im.mode != "RGBA":
        errs.append("mode=%s (need RGBA)" % im.mode)
        im = im.convert("RGBA")
    if im.size != (w, h):
        errs.append("size=%dx%d (need %dx%d)" % (im.size[0], im.size[1], w, h))
    px = im.load()
    W, H = im.size
    colours = Counter()
    nonbinary = 0
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a not in (0, 255):
                nonbinary += 1
            elif a:
                colours[(r, g, b)] += 1
    if nonbinary:
        errs.append("alpha not binary: %d px with 0<a<255" % nonbinary)
    bbox = im.getbbox()
    if bbox is None:
        return False, errs + ["fully transparent"], info
    x0, y0, x1, y1 = bbox
    info["bbox"] = bbox
    opaque = sum(colours.values())
    info["px"] = opaque
    info["colors"] = len(colours)
    info["outline"] = colours.get(OUTLINE, 0)
    info["top"] = [("#%02x%02x%02x" % c, n) for c, n in colours.most_common(5)]
    fill = 100.0 * opaque / (W * H)
    info["fill"] = round(fill, 1)
    comps = components(px, W, H)
    info["comps"] = comps[:4]
    if len(comps) > MAX_COMPONENTS[profile]:
        errs.append("%d opaque components (max %d), sizes %s - floating pixels"
                    % (len(comps), MAX_COMPONENTS[profile], comps[:6]))
    if profile in ("char", "char_air"):
        if profile == "char":
            if y1 < H - 3 or y1 > H - 1:
                errs.append("feet row y1=%d not in [%d,%d] (2-3 px bottom margin)" % (y1, H - 2, H))
        else:
            if not (H - 16 <= y1 <= H - 10):
                errs.append("airborne feet row y1=%d not in [%d,%d]" % (y1, H - 16, H - 10))
        cx = (x0 + x1) / 2.0
        if abs(cx - W / 2.0) > 3.5:
            errs.append("not centred in x: bbox centre %.1f, want %.1f" % (cx, W / 2.0))
        if opaque < 0.25 * W * H:
            errs.append("subject too small: %d px (%.0f%%)" % (opaque, fill))
        if info["outline"] < PROFILES[profile]:
            errs.append("outline #3a241e only %d px (need >=%d)" % (info["outline"], PROFILES[profile]))
    elif profile == "icon":
        cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        if abs(cx - W / 2.0) > 3.0:
            errs.append("not centred in x: %.1f" % cx)
        if abs(cy - H / 2.0) > 3.0:
            errs.append("not centred in y: %.1f" % cy)
        if not (20.0 <= fill <= 96.0):
            errs.append("fill %.0f%% outside 20-96%%" % fill)
        if info["outline"] < PROFILES[profile]:
            errs.append("outline #3a241e only %d px (need >=%d)" % (info["outline"], PROFILES[profile]))
    elif profile == "fx":
        cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        if abs(cx - W / 2.0) > 4.0:
            errs.append("not centred in x: %.1f" % cx)
        if abs(cy - H / 2.0) > 4.0:
            errs.append("not centred in y: %.1f" % cy)
        if fill < 8.0:
            errs.append("effect too small: %.0f%%" % fill)
    return (not errs), errs, info


def main():
    if len(sys.argv) < 5:
        print(__doc__)
        return 2
    profile, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    if profile not in PROFILES:
        print("bad profile %s" % profile)
        return 2
    files = sys.argv[4:]
    allok = True
    for f in files:
        ok, errs, info = check(f, w, h, profile)
        allok = allok and ok
        if ok:
            print("OK   %-52s %dx%d bbox=%s px=%d fill=%s%% colors=%d outline=%d" % (
                f.replace("\\", "/"), w, h, info["bbox"], info["px"], info["fill"],
                info["colors"], info["outline"]))
        else:
            print("FAIL %-52s %s" % (f.replace("\\", "/"), "; ".join(errs)))
            if info:
                print("     info: %s" % {k: info[k] for k in ("bbox", "px", "fill", "colors", "outline")})
    return 0 if allok else 1


if __name__ == "__main__":
    sys.exit(main())
