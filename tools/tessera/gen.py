"""Tessera-small 本地出图（16x16 像素画）。

    python tools/tessera/gen.py --forms                 # 16 个形态 × N 候选，出对照表
    python tools/tessera/gen.py --count 4               # 跑内置的 10 条探索提示词
    python tools/tessera/gen.py --prompt "hamster with axe"

产物：
    art/tessera/…                探索批次（<slug>-<i>.png + @4x + _sheet.png）
    art/tessera/forms/…          形态批次（<line>-<tier>-<i>.png + @4x）
    art/tessera/forms/_sheet.png 16 行 × N 列的对照表（带行标签，挑图用）

模型：thejagstudio/tessera-small（作者 Jagrat Patel / TheJagStudio），本地 ONNX 权重来自
cfahlgren1/tessera-small-onnx；用户已单独取得商业授权，本仓库仅作本地工具使用。
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from tessera_onnx import Tessera  # noqa: E402  同目录的参考实现

ROOT = HERE.parent.parent
OUT = ROOT / "art" / "tessera"
FORMS_OUT = OUT / "forms"

# 探索用：职业 + 武器 + 阶级感
PROMPTS = [
    ("tank",   "hamster holding a big round shield"),
    ("blade",  "hamster warrior holding a small knife"),
    ("shot",   "hamster holding a small crossbow"),
    ("hex",    "hamster wizard holding a fire staff"),
    ("care",   "hamster doctor holding a syringe"),
    ("none",   "cute hamster standing"),
    ("tank4",  "armored hamster with tower shield"),
    ("blade4", "fierce hamster with big sword"),
    ("shot4",  "hamster with cannon"),
    ("hex4",   "hamster mage with glowing orb"),
]

# 16 个真实形态：key 与游戏里的 (line, tier) 对齐；提示词按"武器升级"逐阶递进
FORMS = [
    ("none-1",  "白板鼠",   "cute hamster standing"),
    ("tank-2",  "铁皮鼠",   "hamster holding a small round shield"),
    ("tank-3",  "铆甲鼠",   "hamster with iron shield and mace"),
    ("tank-4",  "堡垒鼠",   "armored hamster with huge tower shield"),
    ("blade-2", "扳钳鼠",   "hamster holding a small knife"),
    ("blade-3", "尖牙鼠",   "hamster holding a battle axe"),
    ("blade-4", "破城鼠",   "fierce hamster with big greatsword"),
    ("shot-2",  "炮筒鼠",   "hamster holding a small crossbow"),
    ("shot-3",  "连发鼠",   "hamster holding a repeating crossbow"),
    ("shot-4",  "狙炮鼠",   "hamster with a big cannon"),
    ("hex-2",   "火种鼠",   "hamster holding a burning torch"),
    ("hex-3",   "咒炉鼠",   "hamster mage with electric staff"),
    ("hex-4",   "熔炉鼠",   "hamster mage with glowing fire orb"),
    ("care-2",  "医务鼠",   "hamster doctor with syringe"),
    ("care-3",  "药剂鼠",   "hamster with spray can"),
    ("care-4",  "大医师鼠", "hamster doctor with medical banner"),
]

# 敌方 5 类 × 4 阶：单独出图（不再只是"我方换色"）
FOE_FORMS = [
    ("crate", 1, "纸箱鼠", "grey mouse with pointed snout and long pink tail, wearing a cardboard box on its head"),
    ("crate", 2, "铁箱鼠", "grey mouse with pointed snout and long pink tail, wearing an iron box helmet"),
    ("crate", 3, "保险柜鼠", "grey mouse with pointed snout and long pink tail, sitting inside a metal safe box"),
    ("crate", 4, "金库鼠", "grey mouse with pointed snout and long pink tail, carrying a vault door as shield"),
    ("shell", 1, "抛壳鼠", "grey mouse with pointed snout and long pink tail, throwing metal shell casings"),
    ("shell", 2, "铰钳鼠", "grey mouse with pointed snout and long pink tail, with a big metal pincer claw"),
    ("shell", 3, "断牙鼠", "grey mouse with pointed snout and long pink tail, with a broken fang and a hook blade"),
    ("shell", 4, "血牙鼠", "grey mouse with pointed snout and long pink tail, with a long fang blade"),
    ("thief", 1, "拾荒鼠", "grey mouse with pointed snout and long pink tail, dragging a sack"),
    ("thief", 2, "弹弓鼠", "grey mouse with pointed snout and long pink tail, holding a slingshot"),
    ("thief", 3, "痰盂炮手", "grey mouse with pointed snout and long pink tail, aiming a metal bucket cannon"),
    ("thief", 4, "废料迫击炮", "grey mouse with pointed snout and long pink tail, with a scrap mortar launcher"),
    ("boss", 1, "质检机", "grey mouse with pointed snout and long pink tail, robot mouse with one red eye and antenna"),
    ("boss", 2, "电检机", "grey mouse with pointed snout and long pink tail, robot mouse with a tesla coil on its back"),
    ("boss", 3, "高压检测塔", "grey mouse with pointed snout and long pink tail, tall robot mouse scanner tower with red beam"),
    ("boss", 4, "报废熔炉", "grey mouse with pointed snout and long pink tail, molten furnace robot mouse with glowing cracks"),
    ("glue", 1, "喷胶鼠", "grey mouse with pointed snout and long pink tail, holding a dripping glue gun"),
    ("glue", 2, "补丁鼠", "grey mouse with pointed snout and long pink tail, with patch kit and stitched fur"),
    ("glue", 3, "焊接鼠", "grey mouse with pointed snout and long pink tail, with a welding torch and sparks"),
    ("glue", 4, "焊炉母鼠", "grey mouse with pointed snout and long pink tail, mother mouse beside a small welding furnace"),
]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]


def load() -> Tessera:
    """用本地权重打开会话（不走 hf_hub_download）。"""
    import onnxruntime as ort
    from tokenizers import Tokenizer

    palette = np.array(json.load(open(HERE / "palette.json"))["palette_rgba"], dtype=np.uint8)
    return Tessera(
        denoiser=ort.InferenceSession(str(HERE / "tessera_w8.onnx"), providers=["CPUExecutionProvider"]),
        text_encoder=ort.InferenceSession(str(HERE / "clip_text_w8.onnx"), providers=["CPUExecutionProvider"]),
        tokenizer=Tokenizer.from_file(str(HERE / "tokenizer.json")),
        palette=palette,
    )


def build_form_sheet(rows, cols, cell=64, pad=6, label_h=14):
    width = pad + cols * (cell + pad)
    height = pad + len(rows) * (cell + pad + label_h)
    sheet = Image.new("RGBA", (width, height), (36, 29, 46, 255))
    draw = ImageDraw.Draw(sheet)
    for r, (key, title, imgs) in enumerate(rows):
        y = pad + r * (cell + pad + label_h)
        draw.text((pad, y), f"{key} {title}", fill=(200, 188, 216, 255))
        for c, img in enumerate(imgs):
            x = pad + c * (cell + pad)
            sheet.alpha_composite(img.resize((cell, cell), Image.NEAREST), (x, y + label_h))
    return sheet


def run_forms(model, count, steps, guidance, seed):
    FORMS_OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    meta = []
    for key, title, prompt in FORMS:
        imgs = model.generate(prompt, count=count, seed=seed, steps=steps, guidance=guidance)
        for i, img in enumerate(imgs):
            img.save(FORMS_OUT / f"{key}-{i}.png")
            img.resize((64, 64), Image.NEAREST).save(FORMS_OUT / f"{key}-{i}@4x.png")
            meta.append({"key": key, "name": title, "prompt": prompt, "index": i,
                         "file": f"{key}-{i}.png", "seed": seed})
        rows.append((key, title, imgs))
        print(f"  {key:<8} {title:<5} {prompt}")
    sheet = build_form_sheet(rows, count)
    sheet.save(FORMS_OUT / "_sheet.png")
    (FORMS_OUT / "index.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(meta)} 张 → {FORMS_OUT}")
    print(f"对照表：{FORMS_OUT / '_sheet.png'}（{sheet.width}×{sheet.height}）")


def run_prompts(model, count, steps, guidance, seed):
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = PROMPTS
    tiles = []
    meta = []
    for name, prompt in jobs:
        imgs = model.generate(prompt, count=count, seed=seed, steps=steps, guidance=guidance)
        for i, img in enumerate(imgs):
            img.save(OUT / f"{slug(name)}-{i}.png")
            img.resize((64, 64), Image.NEAREST).save(OUT / f"{slug(name)}-{i}@4x.png")
            tiles.append((name, i, img))
            meta.append({"name": name, "prompt": prompt, "file": f"{slug(name)}-{i}.png", "seed": seed})
        print(f"  {name:<8} {prompt}")
    cols = count
    cell, pad = 64, 8
    sheet = Image.new("RGBA", (cols * (cell + pad) + pad, len(jobs) * (cell + pad) + pad), (36, 29, 46, 255))
    for idx, (_name, i, img) in enumerate(tiles):
        row, col = divmod(idx, cols)
        sheet.alpha_composite(img.resize((cell, cell), Image.NEAREST),
                              (pad + col * (cell + pad), pad + row * (cell + pad)))
    sheet.save(OUT / "_sheet.png")
    (OUT / "index.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(tiles)} 张 → {OUT}")


def run_foes(model, count, steps, guidance, seed):
    """敌方 5 类 × 4 阶：出到 art/tessera/foe/，文件名 <type>-<tier>-<i>.png"""
    out = OUT / "foe"
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    meta = []
    for typ, tier, title, prompt in FOE_FORMS:
        imgs = model.generate(prompt, count=count, seed=seed, steps=steps, guidance=guidance)
        key = f"{typ}-{tier}"
        for i, img in enumerate(imgs):
            img.save(out / f"{key}-{i}.png")
            img.resize((64, 64), Image.NEAREST).save(out / f"{key}-{i}@4x.png")
            meta.append({"key": key, "name": title, "prompt": prompt, "index": i,
                         "file": f"{key}-{i}.png", "seed": seed})
        rows.append((key, title, imgs))
        print(f"  {key:<9} {title:<6} {prompt}")
    sheet = build_form_sheet(rows, count)
    sheet.save(out / "_sheet.png")
    (out / "index.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(meta)} 张 → {out}")
    print(f"对照表：{out / '_sheet.png'}（{sheet.width}×{sheet.height}）")


def run_icons(model, count, steps, guidance, seed):
    """C 组图标：从 art/tasks.json 读 group == icon 的条目，出到 art/tessera/icons/"""
    tasks_file = ROOT / "art" / "tasks.json"
    if not tasks_file.exists():
        raise SystemExit("缺少 art/tasks.json：先跑 python tools\\arttasks.py")
    data = json.loads(tasks_file.read_text(encoding="utf-8"))
    items = [t for t in data.get("tasks", []) if t.get("group") == "icon"]

    out = OUT / "icons"
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    meta = []
    for t in items:
        key = t["id"]
        imgs = model.generate(t["prompt"], count=count, seed=seed, steps=steps, guidance=guidance)
        for i, img in enumerate(imgs):
            img.save(out / f"{key}-{i}.png")
            img.resize((64, 64), Image.NEAREST).save(out / f"{key}-{i}@4x.png")
            meta.append({"key": key, "name": t.get("name", ""), "prompt": t["prompt"],
                         "index": i, "file": f"{key}-{i}.png", "seed": seed})
        rows.append((key, t.get("name", ""), imgs))
        print(f"  {key:<16} {t.get('name',''):<8}")
    sheet = build_form_sheet(rows, count)
    sheet.save(out / "_sheet.png")
    (out / "index.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(meta)} 张 → {out}")
    print(f"对照表：{out / '_sheet.png'}（{sheet.width}×{sheet.height}）")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--forms", action="store_true", help="跑 16 个我方形态的对照表")
    ap.add_argument("--foes", action="store_true", help="跑 20 个敌方形态的对照表")
    ap.add_argument("--icons", action="store_true", help="跑 23 个 UI 图标的对照表")
    ap.add_argument("--prompt", help="只跑这一条提示词")
    ap.add_argument("--count", type=int, default=4)
    ap.add_argument("--steps", type=int, default=16)
    ap.add_argument("--guidance", type=float, default=3.0)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    model = load()
    if args.icons:
        run_icons(model, args.count, args.steps, args.guidance, args.seed)
        return
    if args.foes:
        run_foes(model, args.count, args.steps, args.guidance, args.seed)
        return
    if args.prompt:
        OUT.mkdir(parents=True, exist_ok=True)
        imgs = model.generate(args.prompt, count=args.count, seed=args.seed, steps=args.steps, guidance=args.guidance)
        for i, img in enumerate(imgs):
            img.save(OUT / f"{slug(args.prompt)}-{i}.png")
            img.resize((64, 64), Image.NEAREST).save(OUT / f"{slug(args.prompt)}-{i}@4x.png")
        print(f"{len(imgs)} 张 → {OUT}")
    elif args.forms:
        run_forms(model, args.count, args.steps, args.guidance, args.seed)
    else:
        run_prompts(model, args.count, args.steps, args.guidance, args.seed)


if __name__ == "__main__":
    main()
