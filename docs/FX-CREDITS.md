# 战斗特效来源与授权（pixelfx）

本项目的战斗技能特效来自开源项目 **[patch-gg/pixelfx](https://github.com/patch-gg/pixelfx)**，
许可证 **MIT**（代码与特效均覆盖，商用可用）。

## 我们用了哪些

| 游戏内 id | 源特效 | 原始尺寸 | 我们的处理 |
|---|---|---|---|
| `arrow` | `projectiles/arrow` | 112×32 | 15fps 抽样、包围盒裁剪 |
| `hit` | `impacts/hit-spark` | 136×80 | 同上 |
| `lance` | `ice/ice-lance` | 176×64 | 同上（备用） |
| `charge` | `arcane/spell-charge` | 120×86 | 15fps、只留前 14 帧（0.9s） |
| `fireball` | `fire/fireball` | 136×56 | 15fps 抽样 |
| `chain` | `lightning/chain-lightning` | 248×104 | 15fps、留 28 帧（1.9s） |
| `frost` | `ice/snowflake-burst` | 140×120 | 15fps、留 26 帧（1.7s） |
| `heal` | `holy/heal` | 80×104 | 15fps、留 24 帧（1.6s） |
| `boom` | `explosions/small-explosion` | 300×240 | 只留下半 300×144、15fps、留 14 帧（1.4s） |

## 处理链（可复现）

```bash
git clone --depth 1 https://github.com/patch-gg/pixelfx.git tools/_pixelfx/pixelfx
cd tools/_pixelfx/pixelfx
node tools/render.mjs <id> --sheet --no-actor      # 导出帧图 + JSON（不带它的灰色假人）
cd -                                             # 回项目根
python tools/fxpack.py                            # 抽帧 / 裁白边 / 打图集 / 转无损 WebP
```

`tools/fxpack.py` 会把每个特效打包成 `art/fx/<name>/<name>.webp|.png + .json`（含 `frameSize / cols / rows / frames / fps / pivot / loop`），
`tools/compose.mjs` 构建时把这些图集以 data URL 注入 `window.FX_ART` / `window.FX_META`。

## 体积

| 版本 | 体积 |
|---|---|
| 原始导出（30fps，9 个） | 约 3.6 MB |
| 打包后（15fps + 裁白边 + 无损 WebP） | **624 KB** |

## 授权要求

MIT 要求在副本中保留版权与许可声明。上游仓库根目录有 `LICENSE` 与 `NOTICE.md`，
其中 `gallery/fonts` 里的 Patch Pixel 字体**不在** MIT 覆盖范围内 —— 我们**没有**使用该字体。
