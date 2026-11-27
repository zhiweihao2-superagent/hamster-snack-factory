/**
 * 用本地 Tessera 生成"职业图标"（16×16，头 + 武器），每个职业单独目录，避免同名覆盖。
 *
 *   node tools/classicons.mjs            # 生成 5 个职业 × 6 张
 *   node tools/classicons.mjs --pick     # 只做对照表（已生成过）
 *
 * 产物：art/tessera/icons/<line>/<n>.png（16×16）与 <n>@4x.png（64×64）
 *      对照表：art/review/classicons/sheet.png
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const py = 'C:\\Users\\lenovo\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe'
const tesseraDir = join(root, 'art', 'tessera')
const outRoot = join(root, 'art', 'tessera', 'icons')

const PROMPTS = {
  tank: 'pixel art icon, hamster head wearing a steel helmet holding a round steel shield, front view, thick outline, warm brown fur, transparent background, no text',
  blade: 'pixel art icon, hamster head holding a sharp dagger, front view, thick outline, warm brown fur, transparent background, no text',
  shot: 'pixel art icon, hamster head aiming a small crossbow, front view, thick outline, warm brown fur, transparent background, no text',
  hex: 'pixel art icon, hamster head holding a magic staff with blue sparks, front view, thick outline, warm brown fur, transparent background, no text',
  care: 'pixel art icon, hamster head with a small green medical kit, front view, thick outline, warm brown fur, transparent background, no text'
}

const lines = Object.keys(PROMPTS)
mkdirSync(outRoot, { recursive: true })

for (const line of lines) {
  const dir = join(outRoot, line)
  mkdirSync(dir, { recursive: true })
  const before = new Set(readdirSync(tesseraDir))
  execFileSync(py, [join(tesseraDir, 'gen.py'), '--prompt', PROMPTS[line], '--count', '6', '--steps', '18'], {
    cwd: root,
    stdio: 'ignore'
  })
  const after = readdirSync(tesseraDir).filter((f) => !before.has(f) && f.endsWith('.png'))
  let i = 0
  for (const f of after) {
    const is4x = f.includes('@4x')
    const target = join(dir, is4x ? `${Math.floor(i / 2)}@4x.png` : `${Math.floor(i / 2)}.png`)
    renameSync(join(tesseraDir, f), target)
    if (!is4x) i += 2
  }
  console.log(line, '→', readdirSync(dir).filter((f) => !f.includes('@4x')).length, 'icons')
}

/* 对照表 */
const script = String.raw`
from PIL import Image, ImageDraw
import os
root = r'${outRoot}'
lines = ${JSON.stringify(lines)}
rows = []
for line in lines:
    d = os.path.join(root, line)
    fs = sorted([f for f in os.listdir(d) if f.endswith('.png') and '@4x' not in f]) if os.path.isdir(d) else []
    rows.append((line, [os.path.join(d, f) for f in fs]))
cell, pad, label = 76, 8, 14
W = pad + max(len(v) for _, v in rows) * (cell + pad)
H = pad + len(rows) * (cell + pad + label)
sheet = Image.new('RGBA', (W, H), (26, 21, 34, 255))
dr = ImageDraw.Draw(sheet)
for r, (line, files) in enumerate(rows):
    y = pad + r * (cell + pad + label)
    dr.text((pad, y), line, fill=(232, 172, 80, 255))
    for c, f in enumerate(files):
        try:
            im = Image.open(f).convert('RGBA').resize((64, 64), Image.NEAREST)
            sheet.alpha_composite(im, (pad + c * (cell + pad), y + label))
        except Exception as e:
            pass
outdir = os.path.join(r'${root}', '..', 'review', 'classicons')
os.makedirs(outdir, exist_ok=True)
sheet.save(os.path.join(outdir, 'sheet.png'))
print('sheet saved', sheet.size)
`
const tmp = join(root, 'art', 'review', '_gen_icons.py')
mkdirSync(dirname(tmp), { recursive: true })
execFileSync('powershell', ['-NoProfile', '-Command', `Set-Content -Encoding UTF8 '${tmp}' @'\n${script}\n'@`])
console.log(execFileSync(py, [tmp], { encoding: 'utf8' }).trim())
