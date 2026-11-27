"""生成"交给别的 agent"的两份东西：

    python tools\\arttasks.py

产物：
    art\\tasks.json          机器可读任务表（id / group / size / prompt / file）
    docs\\ART-HANDOFF.md      自包含交接单（可以直接整段粘给别的模型，不用它读文件）

数据源就是本文件里的表；改完重跑一次即可。
"""
from __future__ import annotations

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TASKS = ROOT / "art" / "tasks.json"
HANDOFF = ROOT / "docs" / "ART-HANDOFF.md"

PREFIX_ALLY = ("16x16 pixel art sprite, {SUBJECT}, side view facing right, chunky readable silhouette, "
               "thick dark outline, limited 16-color palette, warm brown fur, amber highlights, "
               "deep purple outline, transparent background, no text, no shadow on ground, "
               "centered, full body, feet at bottom edge")
PREFIX_FOE = ("16x16 pixel art sprite, {SUBJECT}, side view facing LEFT, menacing, cold grey-blue fur, "
              "glowing red eye, thick dark outline, limited 16-color palette, transparent background, "
              "no text, centered, full body, feet at bottom edge")
PREFIX_ICON = ("16x16 pixel art icon, {SUBJECT}, flat colors, no text, centered, "
               "transparent background, limited 16-color palette")

NEGATIVE = ("no gradient, no anti-aliasing, no semi-transparent edge, no drop shadow, no text, "
            "no border, no watermark, not cropped")

ALLY = [
    ("none-1", "白板鼠", "cute hamster standing with empty paws"),
    ("tank-2", "铁皮鼠", "hamster holding a small round wooden shield"),
    ("tank-3", "铆甲鼠", "hamster with iron shield and spiked mace"),
    ("tank-4", "堡垒鼠", "armored hamster with huge tower shield and pauldrons"),
    ("blade-2", "扳钳鼠", "hamster holding a small knife"),
    ("blade-3", "尖牙鼠", "hamster holding a battle axe"),
    ("blade-4", "破城鼠", "fierce hamster with a big greatsword"),
    ("shot-2", "炮筒鼠", "hamster holding a small crossbow"),
    ("shot-3", "连发鼠", "hamster holding a repeating crossbow with magazine"),
    ("shot-4", "狙炮鼠", "hamster carrying a short cannon on its back"),
    ("hex-2", "火种鼠", "hamster holding a burning torch"),
    ("hex-3", "咒炉鼠", "hamster mage with a crackling electric staff"),
    ("hex-4", "熔炉鼠", "hamster mage holding a glowing fire orb"),
    ("care-2", "医务鼠", "hamster doctor holding a syringe"),
    ("care-3", "药剂鼠", "hamster with a green spray can"),
    ("care-4", "大医师鼠", "hamster doctor with a red cross banner and medkit"),
]

FOE = [
    ("foe-crate-1", "纸箱鼠", "angry rat wearing a cardboard box on its head"),
    ("foe-crate-2", "铁箱鼠", "angry rat with an iron box helmet"),
    ("foe-crate-3", "保险柜鼠", "rat hiding inside a metal safe box"),
    ("foe-crate-4", "金库鼠", "heavy rat carrying a vault door as shield"),
    ("foe-shell-1", "抛壳鼠", "rat throwing metal shell casings"),
    ("foe-shell-2", "铰钳鼠", "rat with a big metal pincer claw"),
    ("foe-shell-3", "断牙鼠", "rat with broken fang and a hook blade"),
    ("foe-shell-4", "血牙鼠", "fierce rat with a long fang blade"),
    ("foe-thief-1", "拾荒鼠", "scavenger rat dragging a sack"),
    ("foe-thief-2", "弹弓鼠", "rat holding a slingshot"),
    ("foe-thief-3", "痰盂炮手", "rat aiming a metal bucket cannon"),
    ("foe-thief-4", "废料迫击炮", "rat with a scrap mortar launcher"),
    ("foe-boss-1", "质检机", "small robot rat with one red eye and antenna"),
    ("foe-boss-2", "电检机", "robot rat with a tesla coil on its back"),
    ("foe-boss-3", "高压检测塔", "tall robot rat scanner tower with red beam"),
    ("foe-boss-4", "报废熔炉", "molten furnace robot rat with glowing cracks"),
    ("foe-glue-1", "喷胶鼠", "rat holding a glue gun dripping"),
    ("foe-glue-2", "补丁鼠", "rat with patch kit and stitched fur"),
    ("foe-glue-3", "焊接鼠", "rat with a welding torch and sparks"),
    ("foe-glue-4", "焊炉母鼠", "mother rat beside a small welding furnace"),
]

ICONS = [
    ("snack-peanut", "花生", "single peanut snack"),
    ("snack-cookie", "饼干", "round cookie snack with a bite"),
    ("snack-seed", "瓜子", "sunflower seed snack"),
    ("tool-pack", "打包机", "packing machine"),
    ("tool-hamster", "打包仓鼠", "hamster carrying a cardboard box"),
    ("tool-gift", "大礼包", "wrapped gift box with ribbon"),
    ("buff-armorCap", "加固车间", "steel plate with rivets"),
    ("buff-armorFill", "整箱饼干", "open cookie box"),
    ("buff-dmgUp", "磨快牙口", "sharpening stone and fang"),
    ("buff-atkSpeed", "上足发条", "wind-up key"),
    ("buff-energy", "备用电瓶", "battery with lightning bolt"),
    ("buff-parts", "零件补给", "pile of gears"),
    ("buff-repair", "紧急修理", "wrench and bandage"),
    ("gear-tank", "肉盾转职证", "certificate card with a shield"),
    ("gear-blade", "近战转职证", "certificate card with a knife"),
    ("gear-shot", "远程转职证", "certificate card with a crossbow"),
    ("gear-hex", "魔法转职证", "certificate card with a flame"),
    ("gear-care", "增益转职证", "certificate card with a red cross"),
    ("mod-goggles", "护目镜", "goggles"),
    ("mod-oilcan", "油壶", "oil can"),
    ("mod-backpack", "小背包", "small backpack"),
    ("mod-irontooth", "铁牙套", "metal tooth cap"),
    ("mod-padspring", "垫片", "metal washer"),
]

SCENES = [
    ("stage-bg", "舞台背景", 165, 84,
     "top down pixel art factory floor, metal plates with rivets, conveyor belt on the left with crates, "
     "pipe on the right, dim warm lamp light, empty center area, no characters, no text"),
    ("title-art", "标题插画", 195, 260,
     "pixel art illustration, five hamsters in a snack factory line, one with shield one with sword "
     "one with cannon one with torch one with medkit, warm amber lighting, dark purple background, no text"),
    ("shop-bg", "商店底纹", 195, 130,
     "pixel art factory shelf wallpaper, crates and gears, very dark, low contrast, seamless"),
]


def build() -> list[dict]:
    out = []
    for key, name, subject in ALLY:
        out.append({"id": key, "group": "ally", "name": name, "size": [16, 16],
                    "prompt": PREFIX_ALLY.format(SUBJECT=subject), "negative": NEGATIVE,
                    "file": f"art/review/<source>/{key}.png"})
    for key, name, subject in FOE:
        out.append({"id": key, "group": "foe", "name": name, "size": [16, 16],
                    "prompt": PREFIX_FOE.format(SUBJECT=subject), "negative": NEGATIVE,
                    "file": f"art/review/<source>/{key}.png"})
    for key, name, subject in ICONS:
        out.append({"id": key, "group": "icon", "name": name, "size": [16, 16],
                    "prompt": PREFIX_ICON.format(SUBJECT=subject), "negative": NEGATIVE,
                    "file": f"art/review/<source>/{key}.png"})
    for key, name, w, h, prompt in SCENES:
        out.append({"id": key, "group": "scene", "name": name, "size": [w, h],
                    "prompt": prompt + ", no text, no characters", "negative": NEGATIVE,
                    "file": f"art/review/<source>/{key}.png"})
    return out


def handoff(tasks: list[dict]) -> str:
    lines = [
        "# 美术交接单（整段粘给别的 agent 即可）",
        "",
        "## 你的任务",
        "",
        "为一款竖屏像素风小游戏《仓鼠零食工厂》产出下列素材。请**严格**按下面的格式交付，"
        "不要额外加边框、文字、投影，也不要把主体裁切。",
        "",
        "## 输出规格（硬要求）",
        "",
        "| 项 | 要求 |",
        "|---|---|",
        "| 角色 / 图标 | **16×16 像素**，RGBA 透明底 |",
        "| 背景 | **165×84**（游戏里会 ×4 到 660×336） |",
        "| 标题插画 | **195×260**（游戏里 ×2） |",
        "| 透明 | alpha 只能是 0 或 255，**不要半透明边缘** |",
        "| 用色 | 角色 ≤36 色，图标 ≤20 色 |",
        "| 主体 | 占画面 60%–90%，脚/底边贴住画面底边 |",
        "| 朝向 | 我方仓鼠朝**右**，敌方老鼠朝**左**，图标正视角 |",
        "| 文件 | `art/review/<你的来源名>/<id>.png`（id 见下表，大小写与连字符必须一致） |",
        "| 放大版 | 同时给一份 4 倍最近邻放大 `<id>@4x.png`（方便人眼挑选） |",
        "| 禁止 | 渐变、抗锯齿、半透明、地面投影、文字、边框、水印 |",
        "",
        "## 提示词（逐条给出，可直接用）",
        "",
    ]
    groups = [("ally", "A1 我方 16 形态（朝右）"), ("foe", "A2 敌方 20 形态（朝左）"),
              ("icon", "C 图标 23 个（正视角）"), ("scene", "D 场景 3 张")]
    for gid, title in groups:
        lines.append(f"### {title}")
        lines.append("")
        lines.append("| id | 名字 | 尺寸 | prompt |")
        lines.append("|---|---|---|---|")
        for t in tasks:
            if t["group"] != gid:
                continue
            size = f'{t["size"][0]}×{t["size"][1]}'
            lines.append(f'| `{t["id"]}` | {t["name"]} | {size} | `{t["prompt"]}` |')
        lines.append("")
    lines += [
        "## 反面提示词（有 negative prompt 字段就填这个）",
        "",
        "```",
        NEGATIVE,
        "```",
        "",
        "## 自检（交付前请自己过一遍）",
        "",
        "- [ ] 每张都是 16×16（场景按上表），不是 512 缩下来的带抗锯齿图",
        "- [ ] 没有半透明像素（量化到硬边）",
        "- [ ] 文件名 = id，一个不多一个不少",
        "- [ ] 同一组风格统一（同一条线只换武器，体型一致）",
        "",
        "> 如果你只能文生图、不能控制像素网格：请按 512×512 生成后在本地做「最近邻缩到 16×16 + 颜色量化到 32 色 + alpha 二值化」再交付。",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    tasks = build()
    TASKS.parent.mkdir(parents=True, exist_ok=True)
    TASKS.write_text(json.dumps({"count": len(tasks), "tasks": tasks}, ensure_ascii=False, indent=2), encoding="utf-8")
    HANDOFF.write_text(handoff(tasks), encoding="utf-8")
    by_group = {}
    for t in tasks:
        by_group[t["group"]] = by_group.get(t["group"], 0) + 1
    print(json.dumps({"tasks": len(tasks), "by_group": by_group,
                      "tasks_json": str(TASKS), "handoff": str(HANDOFF)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
