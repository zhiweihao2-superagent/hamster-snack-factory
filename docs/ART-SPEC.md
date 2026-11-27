# 美术需求总清单（规格 · 提示词 · 尺寸 · 验收）

> 用途：把这份表直接交给别的模型/画师去出图，和我这边（Tessera 本地生成）的结果做 A/B 对比，挑更好的。
> 所有尺寸、命名、验收标准都是**硬约定**，按它交付就能一键进游戏。

---

## 0. 全局风格锚点（每条提示词前面都带上）

**英文前缀（统一用这条，模型更听话）**

```
16x16 pixel art sprite, {SUBJECT}, side view facing right, chunky readable silhouette,
thick dark outline, limited 16-color palette, warm brown fur, amber highlights, deep purple outline,
transparent background, no text, no shadow on ground, centered, full body, feet at bottom edge
```

**中文口径**：16×16 像素、侧视朝右、粗描边、16 色以内、暖棕毛发 + 琥珀高光 + 深紫描边、透明底、无文字、整体占满画面、脚贴底边。

**敌方变体**（造型独立，不是换色）：

```
16x16 pixel art sprite, {SUBJECT}, side view facing LEFT, menacing, cold grey-blue fur, glowing red eye,
thick dark outline, limited 16-color palette, transparent background, no text, centered, full body
```

**禁止项**（任何一张出现就算不合格）：渐变、抗锯齿半透明边缘、投影、文字、边框、水印、角色超过 36 色、主体贴边被裁切。

---

## 1. 尺寸与交付格式

| 类别 | 原生尺寸 | 交付文件 | 说明 |
|---|---|---|---|
| 角色 / 图标 | **16×16** | `16×16` PNG + `64×64`（NEAREST ×4） | RGBA，透明底，alpha 仅 0/255 |
| 舞台背景 | **165×84** | `165×84` + `660×336`（×4） | 不透明，铺满 |
| 标题插画 | **195×260** | `195×260` + `390×520`（×2） | 透明底，压在标题页上半部 |

命名（**必须**这样，否则进不了对比脚本）：

```
art/review/<来源>/<id>.png          例如 art/review/openai/tank-2.png
art/review/<来源>/<id>@4x.png       64×64 放大版
```

`<来源>` 用 `tessera` / `openai` / `codex` / 画师名，随便起，只要每次一致。

---

## 2. A 组：角色精灵（核心，共 36 张）

### A1 我方 16 形态（朝右）

| id | 名字 | 武器 / 特征 | 提示词主体（接在前缀后） |
|---|---|---|---|
| `none-1` | 白板鼠 | 空手 | `cute hamster standing with empty paws` |
| `tank-2` | 铁皮鼠 | 小圆盾 | `hamster holding a small round wooden shield` |
| `tank-3` | 铆甲鼠 | 铁盾 + 钉锤 | `hamster with iron shield and spiked mace` |
| `tank-4` | 堡垒鼠 | 塔盾 + 肩甲 | `armored hamster with huge tower shield and pauldrons` |
| `blade-2` | 扳钳鼠 | 小刀 | `hamster holding a small knife` |
| `blade-3` | 尖牙鼠 | 战斧 | `hamster holding a battle axe` |
| `blade-4` | 破城鼠 | 大剑 | `fierce hamster with a big greatsword` |
| `shot-2` | 炮筒鼠 | 短弩 | `hamster holding a small crossbow` |
| `shot-3` | 连发鼠 | 连弩 | `hamster holding a repeating crossbow with magazine` |
| `shot-4` | 狙炮鼠 | 加农炮 | `hamster carrying a short cannon on its back` |
| `hex-2` | 火种鼠 | 火把 | `hamster holding a burning torch` |
| `hex-3` | 咒炉鼠 | 电弧杖 | `hamster mage with a crackling electric staff` |
| `hex-4` | 熔炉鼠 | 火球 | `hamster mage holding a glowing fire orb` |
| `care-2` | 医务鼠 | 针筒 | `hamster doctor holding a syringe` |
| `care-3` | 药剂鼠 | 喷雾罐 | `hamster with a green spray can` |
| `care-4` | 大医师鼠 | 医疗旗 + 药箱 | `hamster doctor with a red cross banner and medkit` |

### A2 敌方 20 形态（朝左，冷灰蓝 + 红眼）

| id | 名字 | 提示词主体 |
|---|---|---|
| `foe-crate-1` | 纸箱鼠 | `angry rat wearing a cardboard box on its head` |
| `foe-crate-2` | 铁箱鼠 | `angry rat with an iron box helmet` |
| `foe-crate-3` | 保险柜鼠 | `rat hiding inside a metal safe box` |
| `foe-crate-4` | 金库鼠 | `heavy rat carrying a vault door as shield` |
| `foe-shell-1` | 抛壳鼠 | `rat throwing metal shell casings` |
| `foe-shell-2` | 铰钳鼠 | `rat with a big metal pincer claw` |
| `foe-shell-3` | 断牙鼠 | `rat with broken fang and a hook blade` |
| `foe-shell-4` | 血牙鼠 | `fierce rat with a long fang blade` |
| `foe-thief-1` | 拾荒鼠 | `scavenger rat dragging a sack` |
| `foe-thief-2` | 弹弓鼠 | `rat holding a slingshot` |
| `foe-thief-3` | 痰盂炮手 | `rat aiming a metal bucket cannon` |
| `foe-thief-4` | 废料迫击炮 | `rat with a scrap mortar launcher` |
| `foe-boss-1` | 质检机 | `small robot rat with one red eye and antenna` |
| `foe-boss-2` | 电检机 | `robot rat with a tesla coil on its back` |
| `foe-boss-3` | 高压检测塔 | `tall robot rat scanner tower with red beam` |
| `foe-boss-4` | 报废熔炉 | `molten furnace robot rat with glowing cracks` |
| `foe-glue-1` | 喷胶鼠 | `rat holding a glue gun dripping` |
| `foe-glue-2` | 补丁鼠 | `rat with patch kit and stitched fur` |
| `foe-glue-3` | 焊接鼠 | `rat with a welding torch and sparks` |
| `foe-glue-4` | 焊炉母鼠 | `mother rat beside a small welding furnace` |

---

## 3. B 组：动作帧（第二期，按需做，共 72 张）

每个形态 2 帧，和 A 组同 id 加后缀：

| 后缀 | 状态 | 提示词追加 |
|---|---|---|
| `@atk1` | 起手（武器举起 / 蓄力） | `weapon raised high, body leaning back, wind-up pose` |
| `@atk2` | 落手（命中瞬间） | `weapon swung forward, body lunging forward, impact pose` |

建议先只做：我方 `tank-4 / blade-4 / shot-4 / hex-4 / care-4` + 敌方 `foe-boss-1..4` 共 **9 形态 × 2 = 18 张**，验证观感后再补全。
待命（呼吸）和行走**不用出图**——代码里做 1–2px 的上下浮动即可。

---

## 4. C 组：棋盘与 UI 图标（16×16，共 23 张）

| id | 名字 | 提示词主体 |
|---|---|---|
| `snack-peanut` | 花生 | `single peanut snack, icon`（我方现有美术风格的食物） |
| `snack-cookie` | 饼干 | `round cookie snack with bite, icon` |
| `snack-seed` | 瓜子 | `sunflower seed snack, icon` |
| `tool-pack` | 打包机 | `packing machine icon, amber metal` |
| `tool-hamster` | 打包仓鼠 | `hamster carrying a box, icon` |
| `tool-gift` | 大礼包 | `wrapped gift box with ribbon, icon` |
| `buff-armorCap` | 加固车间 | `steel plate with rivets, icon` |
| `buff-armorFill` | 整箱饼干 | `open cookie box, icon` |
| `buff-dmgUp` | 磨快牙口 | `sharpening stone and fang, icon` |
| `buff-atkSpeed` | 上足发条 | `wind-up key, icon` |
| `buff-energy` | 备用电瓶 | `battery with lightning, icon` |
| `buff-parts` | 零件补给 | `gear pile, icon` |
| `buff-repair` | 紧急修理 | `wrench and bandage, icon` |
| `gear-tank` / `gear-blade` / `gear-shot` / `gear-hex` / `gear-care` | 五线转职证 | `certificate card with shield / knife / crossbow / flame / cross`（5 张） |
| `mod-goggles` | 护目镜 | `goggles, icon` |
| `mod-oilcan` | 油壶 | `oil can, icon` |
| `mod-backpack` | 小背包 | `small backpack, icon` |
| `mod-irontooth` | 铁牙套 | `metal tooth cap, icon` |
| `mod-padspring` | 垫片 | `metal washer, icon` |

> 图标提示词后缀统一用：`, 16x16 pixel art icon, flat colors, no outline text, centered, transparent background`
> 图标不需要朝右，正面视角即可。

---

## 5. D 组：场景（3 张）

| id | 名字 | 尺寸 | 提示词 |
|---|---|---|---|
| `stage-bg` | 舞台背景 | 165×84 → 660×336 | `top down pixel art factory floor, metal plates with rivets, conveyor belt on the left with crates, pipe on the right, dim warm lamp light, empty center area, no characters, no text` |
| `title-art` | 标题插画 | 195×260 → 390×520 | `pixel art illustration, five hamsters in a snack factory line, one with shield one with sword one with cannon one with torch one with medkit, warm amber lighting, dark purple background, no text` |
| `shop-bg` | 商店底纹（可选） | 195×130 → 390×260 | `pixel art factory shelf wallpaper, crates and gears, very dark, low contrast, seamless` |

---

## 6. 验收标准（对比时按这个打分）

`python tools\artcheck.py art\review\<来源>` 会自动给出下面 1–5 项的数字和一张缩略总表。

| # | 指标 | 合格线 |
|---|---|---|
| 1 | **32px 缩略可辨** | 缩到 32×32 后还能一眼说出是什么武器（人工判） |
| 2 | 原生尺寸 | 16×16（图标/角色）/ 165×84（背景），差一像素也判不合格 |
| 3 | alpha 二值 | 半透明像素数 = 0 |
| 4 | 颜色数 | 角色 ≤ 36，图标 ≤ 20 |
| 5 | 主体占比 | 60%–90%，且脚底 2px 内有像素（贴底） |
| 6 | 朝向 | 我方朝右、敌方朝左（人工判） |
| 7 | 同族一致性 | 5 条线的鼠比例一致、耳朵/眼睛位置一致（人工判） |

**A/B 对比**：`python tools\artcompare.py art\review\tessera art\review\openai`
→ 生成 `art/review/_compare_<id>.png`（左 A 右 B，各带 32px 缩略），逐张看。

---

## 7. 我这边的生成设置（复现我的结果）

```powershell
# 我方 16 形态 × 8 候选
python tools\tessera\gen.py --forms --count 8 --steps 16 --guidance 3.0 --seed 0
# 敌方 20 形态 × 6 候选
python tools\tessera\gen.py --foes  --count 6 --steps 16 --guidance 3.0 --seed 0
```

模型：Tessera-small（本地 ONNX，16×16，512 色板，无 img2img）。
已知短板：**只能用文本条件**，所以同一形态的"起手/落手"两帧很难对齐，B 组建议交给人或支持参考图的模型。

---

## 8. 对比工具（现成的，跑三条命令）

```powershell
# 1) 把某个来源的一批图摊到 art/review/<来源>/（文件名必须是 <id>.png）
#    我这批已经从 picks 整理好了：art/review/tessera（36 张）

# 2) 体检：尺寸 / 半透明 / 用色 / 主体占比 / 是否贴底 + 32px 缩略总表
python tools\artcheck.py art\review\openai --size 16 --limit 36
#    → art/review/openai/_report.txt、_sheet32.png、_sheet.png

# 3) A/B：和我的批次同名逐一并排（左 A 右 B，各带 32px 缩略）
python tools\artcompare.py art\review\tessera art\review\openai --out art\review
#    → art/review/_compare_<id>.png、_compare_sheet.png
```

判定时**先看 `_sheet32.png`**（32px 就是游戏里的实际观感），再看报告数字：
`semi` 必须 0、`cover` 0.55–0.85、`feet` 必须 yes、`colors` ≤ 36、`cx` 落在 0.42–0.58（居中）。

---

## 9. 交付检查清单

- [ ] 文件名与 id 完全一致（`art/review/<来源>/<id>.png`）
- [ ] 16×16 原生 + `@4x` 64×64
- [ ] 透明底、无半透明边
- [ ] 无文字/边框/水印/投影
- [ ] 角色朝右（敌方朝左）
- [ ] 一次交付整组（不要混不同批次的风格）
