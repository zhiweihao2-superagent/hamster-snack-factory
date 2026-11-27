# 美术交接单（整段粘给别的 agent 即可）

## 你的任务

为一款竖屏像素风小游戏《仓鼠零食工厂》产出下列素材。请**严格**按下面的格式交付，不要额外加边框、文字、投影，也不要把主体裁切。

## 输出规格（硬要求）

| 项 | 要求 |
|---|---|
| 角色 / 图标 | **16×16 像素**，RGBA 透明底 |
| 背景 | **165×84**（游戏里会 ×4 到 660×336） |
| 标题插画 | **195×260**（游戏里 ×2） |
| 透明 | alpha 只能是 0 或 255，**不要半透明边缘** |
| 用色 | 角色 ≤36 色，图标 ≤20 色 |
| 主体 | 占画面 60%–90%，脚/底边贴住画面底边 |
| 朝向 | 我方仓鼠朝**右**，敌方老鼠朝**左**，图标正视角 |
| 文件 | `art/review/<你的来源名>/<id>.png`（id 见下表，大小写与连字符必须一致） |
| 放大版 | 同时给一份 4 倍最近邻放大 `<id>@4x.png`（方便人眼挑选） |
| 禁止 | 渐变、抗锯齿、半透明、地面投影、文字、边框、水印 |

## 提示词（逐条给出，可直接用）

### A1 我方 16 形态（朝右）

| id | 名字 | 尺寸 | prompt |
|---|---|---|---|
| `none-1` | 白板鼠 | 16×16 | `16x16 pixel art sprite, cute hamster standing with empty paws, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `tank-2` | 铁皮鼠 | 16×16 | `16x16 pixel art sprite, hamster holding a small round wooden shield, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `tank-3` | 铆甲鼠 | 16×16 | `16x16 pixel art sprite, hamster with iron shield and spiked mace, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `tank-4` | 堡垒鼠 | 16×16 | `16x16 pixel art sprite, armored hamster with huge tower shield and pauldrons, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `blade-2` | 扳钳鼠 | 16×16 | `16x16 pixel art sprite, hamster holding a small knife, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `blade-3` | 尖牙鼠 | 16×16 | `16x16 pixel art sprite, hamster holding a battle axe, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `blade-4` | 破城鼠 | 16×16 | `16x16 pixel art sprite, fierce hamster with a big greatsword, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `shot-2` | 炮筒鼠 | 16×16 | `16x16 pixel art sprite, hamster holding a small crossbow, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `shot-3` | 连发鼠 | 16×16 | `16x16 pixel art sprite, hamster holding a repeating crossbow with magazine, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `shot-4` | 狙炮鼠 | 16×16 | `16x16 pixel art sprite, hamster carrying a short cannon on its back, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `hex-2` | 火种鼠 | 16×16 | `16x16 pixel art sprite, hamster holding a burning torch, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `hex-3` | 咒炉鼠 | 16×16 | `16x16 pixel art sprite, hamster mage with a crackling electric staff, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `hex-4` | 熔炉鼠 | 16×16 | `16x16 pixel art sprite, hamster mage holding a glowing fire orb, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `care-2` | 医务鼠 | 16×16 | `16x16 pixel art sprite, hamster doctor holding a syringe, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `care-3` | 药剂鼠 | 16×16 | `16x16 pixel art sprite, hamster with a green spray can, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |
| `care-4` | 大医师鼠 | 16×16 | `16x16 pixel art sprite, hamster doctor with a red cross banner and medkit, side view facing right, chunky readable silhouette, thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline, transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge` |

### A2 敌方 20 形态（朝左）

| id | 名字 | 尺寸 | prompt |
|---|---|---|---|
| `foe-crate-1` | 纸箱鼠 | 16×16 | `16x16 pixel art sprite, angry rat wearing a cardboard box on its head, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-crate-2` | 铁箱鼠 | 16×16 | `16x16 pixel art sprite, angry rat with an iron box helmet, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-crate-3` | 保险柜鼠 | 16×16 | `16x16 pixel art sprite, rat hiding inside a metal safe box, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-crate-4` | 金库鼠 | 16×16 | `16x16 pixel art sprite, heavy rat carrying a vault door as shield, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-shell-1` | 抛壳鼠 | 16×16 | `16x16 pixel art sprite, rat throwing metal shell casings, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-shell-2` | 铰钳鼠 | 16×16 | `16x16 pixel art sprite, rat with a big metal pincer claw, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-shell-3` | 断牙鼠 | 16×16 | `16x16 pixel art sprite, rat with broken fang and a hook blade, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-shell-4` | 血牙鼠 | 16×16 | `16x16 pixel art sprite, fierce rat with a long fang blade, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-thief-1` | 拾荒鼠 | 16×16 | `16x16 pixel art sprite, scavenger rat dragging a sack, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-thief-2` | 弹弓鼠 | 16×16 | `16x16 pixel art sprite, rat holding a slingshot, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-thief-3` | 痰盂炮手 | 16×16 | `16x16 pixel art sprite, rat aiming a metal bucket cannon, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-thief-4` | 废料迫击炮 | 16×16 | `16x16 pixel art sprite, rat with a scrap mortar launcher, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-boss-1` | 质检机 | 16×16 | `16x16 pixel art sprite, small robot rat with one red eye and antenna, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-boss-2` | 电检机 | 16×16 | `16x16 pixel art sprite, robot rat with a tesla coil on its back, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-boss-3` | 高压检测塔 | 16×16 | `16x16 pixel art sprite, tall robot rat scanner tower with red beam, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-boss-4` | 报废熔炉 | 16×16 | `16x16 pixel art sprite, molten furnace robot rat with glowing cracks, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-glue-1` | 喷胶鼠 | 16×16 | `16x16 pixel art sprite, rat holding a glue gun dripping, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-glue-2` | 补丁鼠 | 16×16 | `16x16 pixel art sprite, rat with patch kit and stitched fur, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-glue-3` | 焊接鼠 | 16×16 | `16x16 pixel art sprite, rat with a welding torch and sparks, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |
| `foe-glue-4` | 焊炉母鼠 | 16×16 | `16x16 pixel art sprite, mother rat beside a small welding furnace, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye, thick dark outline, limited 16-color palette, transparent background, no text, centered, full body, feet at bottom edge` |

### C 图标 23 个（正视角）

| id | 名字 | 尺寸 | prompt |
|---|---|---|---|
| `snack-peanut` | 花生 | 16×16 | `16x16 pixel art icon, single peanut snack, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `snack-cookie` | 饼干 | 16×16 | `16x16 pixel art icon, round cookie snack with a bite, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `snack-seed` | 瓜子 | 16×16 | `16x16 pixel art icon, sunflower seed snack, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `tool-pack` | 打包机 | 16×16 | `16x16 pixel art icon, packing machine, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `tool-hamster` | 打包仓鼠 | 16×16 | `16x16 pixel art icon, hamster carrying a cardboard box, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `tool-gift` | 大礼包 | 16×16 | `16x16 pixel art icon, wrapped gift box with ribbon, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `buff-armorCap` | 加固车间 | 16×16 | `16x16 pixel art icon, steel plate with rivets, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `buff-armorFill` | 整箱饼干 | 16×16 | `16x16 pixel art icon, open cookie box, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `buff-dmgUp` | 磨快牙口 | 16×16 | `16x16 pixel art icon, sharpening stone and fang, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `buff-atkSpeed` | 上足发条 | 16×16 | `16x16 pixel art icon, wind-up key, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `buff-energy` | 备用电瓶 | 16×16 | `16x16 pixel art icon, battery with lightning bolt, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `buff-parts` | 零件补给 | 16×16 | `16x16 pixel art icon, pile of gears, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `buff-repair` | 紧急修理 | 16×16 | `16x16 pixel art icon, wrench and bandage, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `gear-tank` | 肉盾转职证 | 16×16 | `16x16 pixel art icon, certificate card with a shield, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `gear-blade` | 近战转职证 | 16×16 | `16x16 pixel art icon, certificate card with a knife, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `gear-shot` | 远程转职证 | 16×16 | `16x16 pixel art icon, certificate card with a crossbow, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `gear-hex` | 魔法转职证 | 16×16 | `16x16 pixel art icon, certificate card with a flame, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `gear-care` | 增益转职证 | 16×16 | `16x16 pixel art icon, certificate card with a red cross, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `mod-goggles` | 护目镜 | 16×16 | `16x16 pixel art icon, goggles, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `mod-oilcan` | 油壶 | 16×16 | `16x16 pixel art icon, oil can, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `mod-backpack` | 小背包 | 16×16 | `16x16 pixel art icon, small backpack, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `mod-irontooth` | 铁牙套 | 16×16 | `16x16 pixel art icon, metal tooth cap, flat colors, no text, centered, transparent background, limited 16-color palette` |
| `mod-padspring` | 垫片 | 16×16 | `16x16 pixel art icon, metal washer, flat colors, no text, centered, transparent background, limited 16-color palette` |

### D 场景 3 张

| id | 名字 | 尺寸 | prompt |
|---|---|---|---|
| `stage-bg` | 舞台背景 | 165×84 | `top down pixel art factory floor, metal plates with rivets, conveyor belt on the left with crates, pipe on the right, dim warm lamp light, empty center area, no characters, no text, no text, no characters` |
| `title-art` | 标题插画 | 195×260 | `pixel art illustration, five hamsters in a snack factory line, one with shield one with sword one with cannon one with torch one with medkit, warm amber lighting, dark purple background, no text, no text, no characters` |
| `shop-bg` | 商店底纹 | 195×130 | `pixel art factory shelf wallpaper, crates and gears, very dark, low contrast, seamless, no text, no characters` |

## 反面提示词（有 negative prompt 字段就填这个）

```
no gradient, no anti-aliasing, no semi-transparent edge, no drop shadow, no text, no border, no watermark, not cropped
```

## 自检（交付前请自己过一遍）

- [ ] 每张都是 16×16（场景按上表），不是 512 缩下来的带抗锯齿图
- [ ] 没有半透明像素（量化到硬边）
- [ ] 文件名 = id，一个不多一个不少
- [ ] 同一组风格统一（同一条线只换武器，体型一致）

> 如果你只能文生图、不能控制像素网格：请按 512×512 生成后在本地做「最近邻缩到 16×16 + 颜色量化到 32 色 + alpha 二值化」再交付。
