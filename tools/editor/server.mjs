/**
 * 舞台编辑器（本地小服务 + 网页界面）。
 *
 *   node tools/editor/server.mjs [port]
 *
 * 打开 http://127.0.0.1:8791，可以：
 *   - 拖站位点 / 拖地面四边 / 拖背景图
 *   - 改关卡表（名字、同屏、敌阶、特色、倍率、停电）
 *   - 改职业数值（hp / 出手间隔 / 基础伤 / 充能需求 / 技能伤害）
 *   - 给 16 个形态挑像素精灵（候选来自 art/tessera/forms）
 * 每次保存都会写回工程文件并自动跑 tools/compose.mjs。
 *
 * 只监听 127.0.0.1，不对外网开放。
 */
import { createServer } from 'node:http'
import { readFile, writeFile, readdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const port = Number(process.argv[2]) || 8791
const gameJsonPath = join(root, 'game.json')
const bgPath = join(root, 'assets', 'stage_bg.png')
const formsDir = join(root, 'art', 'tessera', 'forms')
const picksDir = join(root, 'art', 'tessera', 'picks')
const foeDir = join(root, 'art', 'tessera', 'foe')
const picksJson = join(root, 'tools', 'tessera', 'picks.json')
const picksFoeJson = join(root, 'tools', 'tessera', 'picks-foe.json')   /* pick.py 写在工具目录旁边 */

/* 16 个形态的键，顺序与 pick.py 一致 */
const KEYS_FOE = []
for (const t of ['crate', 'shell', 'thief', 'boss', 'glue']) {
  for (const n of [1, 2, 3, 4]) KEYS_FOE.push('foe-' + t + '-' + n)
}

const KEYS = [
  'none-1', 'tank-2', 'tank-3', 'tank-4',
  'blade-2', 'blade-3', 'blade-4',
  'shot-2', 'shot-3', 'shot-4',
  'hex-2', 'hex-3', 'hex-4',
  'care-2', 'care-3', 'care-4'
]

/* 职业数值的默认值（与 tools/rpg.js 的 ROSTER 对齐；编辑器只写覆盖项） */
const CLASS_DEFAULTS = {
  'tank-2': { hp: 150, atkMs: 2800, baseDmg: 6, need: 0, dmg: 8 },
  'tank-3': { hp: 205, atkMs: 2700, baseDmg: 8, need: 0, dmg: 11 },
  'tank-4': { hp: 275, atkMs: 2600, baseDmg: 11, need: 0, dmg: 15 },
  'blade-2': { hp: 120, atkMs: 1600, baseDmg: 8, need: 5, dmg: 18 },
  'blade-3': { hp: 160, atkMs: 1500, baseDmg: 11, need: 7, dmg: 26 },
  'blade-4': { hp: 210, atkMs: 1400, baseDmg: 15, need: 9, dmg: 36 },
  'shot-2': { hp: 95, atkMs: 2400, baseDmg: 7, need: 6, dmg: 15 },
  'shot-3': { hp: 130, atkMs: 2200, baseDmg: 10, need: 8, dmg: 22 },
  'shot-4': { hp: 170, atkMs: 2100, baseDmg: 13, need: 10, dmg: 30 },
  'hex-2': { hp: 90, atkMs: 3200, baseDmg: 9, need: 25, dmg: 20 },
  'hex-3': { hp: 120, atkMs: 3100, baseDmg: 12, need: 28, dmg: 29 },
  'hex-4': { hp: 160, atkMs: 3000, baseDmg: 16, need: 30, dmg: 40 },
  'care-2': { hp: 110, atkMs: 3000, baseDmg: 3, need: 30, dmg: 12 },
  'care-3': { hp: 145, atkMs: 2900, baseDmg: 4, need: 32, dmg: 18 },
  'care-4': { hp: 185, atkMs: 2800, baseDmg: 5, need: 35, dmg: 26 }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8'
}

const readGame = async () => JSON.parse(await readFile(gameJsonPath, 'utf8'))
const writeGame = async (g) => writeFile(gameJsonPath, JSON.stringify(g, null, 2) + '\n', 'utf8')

function run(cmd, args, cwd) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd })
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { out += d })
    p.on('error', (e) => res({ code: -1, out: String(e && e.message) }))
    p.on('close', (code) => res({ code, out: out.trim() }))
  })
}

const compose = () => run(process.execPath, [join(root, 'tools', 'compose.mjs')], root)

function pythonBin() {
  if (process.env.PYTHON && existsSync(process.env.PYTHON)) return process.env.PYTHON
  const bundled = 'C:\\Users\\lenovo\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe'
  if (existsSync(bundled)) return bundled
  return 'python'
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function body(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  try {
    /* ---------- 状态 / 背景 ---------- */
    if (url.pathname === '/api/state') {
      const g = await readGame()
      const rpg = (g.rules && g.rules.rpg) || {}
      return json(res, 200, {
        title: g.title,
        formation: g.rules.formation || null,
        floor: g.rules.floor || null,
        slots: rpg.slots || 5,
        unitSize: g.rules.unitSize || 32,
        bg: { exists: existsSync(bgPath), url: `/bg?v=${Date.now()}` },
        stage: { W: 390, H: 844, giftY: 82, giftH: 326, pad: 16 }
      })
    }

    if (url.pathname === '/bg') {
      if (!existsSync(bgPath)) return json(res, 404, { error: 'no bg' })
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
      return res.end(await readFile(bgPath))
    }

    if (url.pathname === '/api/bg' && req.method === 'POST') {
      const buf = await body(req)
      if (buf.length < 1000) return json(res, 400, { error: '图片太小' })
      await writeFile(bgPath, buf)
      const g = await readGame()
      if (!g.slots.stage_bg) {
        g.slots.stage_bg = { file: 'assets/stage_bg.png', label: '舞台背景', size: [660, 340], transparent: false }
        await writeGame(g)
      }
      return json(res, 200, { ok: true, bytes: buf.length, url: `/bg?v=${Date.now()}` })
    }

    /* ---------- 站位 / 地面 ---------- */
    if (url.pathname === '/api/save' && req.method === 'POST') {
      const payload = JSON.parse((await body(req)).toString('utf8'))
      const g = await readGame()
      if (payload.formation) g.rules.formation = payload.formation
      if (payload.floor) g.rules.floor = payload.floor
      await writeGame(g)
      return json(res, 200, { ok: true, compose: await compose() })
    }

    /* ---------- 关卡表 ---------- */
    if (url.pathname === '/api/levels') {
      const g = await readGame()
      const levels = ((g.rules.rpg && g.rules.rpg.levels) || []).map((l) => ({
        name: l.name || '', brief: l.brief || '', onField: l.onField || 3,
        enemyTier: l.enemyTier || 1, tut: !!l.tut,
        hpMul: num(l.mod && l.mod.hpMul, 1), atkMul: num(l.mod && l.mod.atkMul, 1),
        chargeMul: num(l.mod && l.mod.chargeMul, 1), noUlt: !!(l.mod && l.mod.noUlt)
      }))
      return json(res, 200, { levels })
    }

    if (url.pathname === '/api/levels' && req.method === 'POST') {
      const payload = JSON.parse((await body(req)).toString('utf8'))
      const g = await readGame()
      const levels = g.rules.rpg.levels || []
      payload.levels.forEach((src, i) => {
        const l = levels[i]
        if (!l) return
        if (typeof src.name === 'string') l.name = src.name
        if (typeof src.brief === 'string') l.brief = src.brief
        if (isFinite(src.onField)) l.onField = clampInt(src.onField, 1, 6)
        if (isFinite(src.enemyTier)) l.enemyTier = clampInt(src.enemyTier, 1, 4)
        l.tut = !!src.tut
        l.mod = l.mod || {}
        setNum(l.mod, 'hpMul', src.hpMul)
        setNum(l.mod, 'atkMul', src.atkMul)
        setNum(l.mod, 'chargeMul', src.chargeMul)
        if (src.noUlt) l.mod.noUlt = true; else delete l.mod.noUlt
      })
      await writeGame(g)
      return json(res, 200, { ok: true, compose: await compose() })
    }

    /* ---------- 职业数值 ---------- */
    if (url.pathname === '/api/classes') {
      const g = await readGame()
      const ov = (g.rules && g.rules.classes) || {}
      return json(res, 200, { defaults: CLASS_DEFAULTS, overrides: ov })
    }

    if (url.pathname === '/api/classes' && req.method === 'POST') {
      const payload = JSON.parse((await body(req)).toString('utf8'))
      const g = await readGame()
      g.rules.classes = payload.classes || {}
      await writeGame(g)
      return json(res, 200, { ok: true, compose: await compose() })
    }

    /* ---------- 精灵候选 / 选择 ---------- */
    if (url.pathname === '/api/sprites') {
      const allyFiles = existsSync(formsDir) ? await readdir(formsDir) : []
      const foeFiles = existsSync(foeDir) ? await readdir(foeDir) : []
      const picks = existsSync(picksJson) ? JSON.parse(await readFile(picksJson, 'utf8')) : {}
      const picksFoe = existsSync(picksFoeJson) ? JSON.parse(await readFile(picksFoeJson, 'utf8')) : {}
      const candidates = {}
      for (const key of KEYS) {
        candidates[key] = allyFiles
          .filter((f) => f.startsWith(key + '-') && f.endsWith('.png') && !f.includes('@4x'))
          .sort()
      }
      for (const key of KEYS_FOE) {
        const base = key.replace(/^foe-/, '')                    /* foe-crate-2 → crate-2 */
        candidates[key] = foeFiles
          .filter((f) => f.startsWith(base + '-') && f.endsWith('.png') && !f.includes('@4x'))
          .sort()
      }
      const merged = { ...picks }
      for (const k of Object.keys(picksFoe)) merged['foe-' + k] = picksFoe[k]
      return json(res, 200, { keys: [...KEYS, ...KEYS_FOE], candidates, picks: merged })
    }

    if (url.pathname === '/thumb') {
      const name = url.searchParams.get('f') || ''
      if (!name || name.includes('..') || name.includes('/')) return json(res, 400, { error: 'bad name' })
      const kiss = [join(formsDir, name), join(foeDir, name), join(picksDir, name)]
      const file = kiss.find((f) => existsSync(f))
      if (!file) return json(res, 404, { error: 'not found' })
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
      return res.end(await readFile(file))
    }

    if (url.pathname === '/api/pick' && req.method === 'POST') {
      const payload = JSON.parse((await body(req)).toString('utf8'))
      const key = payload.key
      const index = Number(payload.index)
      if (!isFinite(index)) return json(res, 400, { error: 'bad pick' })

      /* 敌方：foe-crate-2 → picks-foe.json 的 "crate-2" → 跑 pickfoe.py */
      if (KEYS_FOE.includes(key)) {
        const base = key.replace(/^foe-/, '')
        const picksFoe = existsSync(picksFoeJson) ? JSON.parse(await readFile(picksFoeJson, 'utf8')) : {}
        picksFoe[base] = index + 1
        await writeFile(picksFoeJson, JSON.stringify(picksFoe, null, 2) + '\n', 'utf8')
        const py = await run(pythonBin(), [join(root, 'tools', 'tessera', 'pickfoe.py')], root)
        return json(res, 200, { ok: py.code === 0, python: py.out, picks: picksFoe })
      }

      if (!KEYS.includes(key)) return json(res, 400, { error: 'bad key' })
      const picks = existsSync(picksJson) ? JSON.parse(await readFile(picksJson, 'utf8')) : {}
      picks[key] = index + 1                       /* pick.py 用 1 起 */
      await writeFile(picksJson, JSON.stringify(picks, null, 2) + '\n', 'utf8')
      const py = await run(pythonBin(), [join(root, 'tools', 'tessera', 'pick.py')], root)
      return json(res, 200, { ok: py.code === 0, python: py.out, picks })
    }

    /* ---------- 静态文件 ---------- */
    const p = url.pathname === '/' ? '/index.html' : url.pathname
    const file = join(here, decodeURIComponent(p))
    if (!file.startsWith(here)) return json(res, 403, { error: 'forbidden' })
    if (!existsSync(file)) return json(res, 404, { error: 'not found' })
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' })
    return res.end(await readFile(file))
  } catch (e) {
    return json(res, 500, { error: String((e && e.message) || e) })
  }
})

function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d }
function setNum(obj, key, v) {
  if (typeof v === 'number' && isFinite(v) && v > 0) obj[key] = v
  else if (v === 1) delete obj[key]
}
function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))) }

server.listen(port, '127.0.0.1', () => {
  console.log(`舞台编辑器：http://127.0.0.1:${port}`)
})
