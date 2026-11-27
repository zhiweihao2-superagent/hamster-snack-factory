import { readFileSync, writeFileSync } from 'node:fs'

/* ---------------- 1) compose.mjs：注入像素字体 ---------------- */
const cp = 'tools/compose.mjs'
let c = readFileSync(cp, 'utf8')

if (!c.includes('PIXEL_FONT')) {
  const anchor = 'const composed = body.slice(0, closing)'
  if (!c.includes(anchor)) throw new Error('compose anchor missing')
  const inject = `/* 像素字体：把 subset 出来的 woff2 以 data URL 注入（构建时读 tools/_font/pixel.woff2） */
let pixelFont = ''
try {
  const { readFile } = await import('node:fs/promises')
  const { existsSync } = await import('node:fs')
  const fp = join(root, 'tools', '_font', 'pixel.woff2')
  if (existsSync(fp)) {
    const b64 = (await readFile(fp)).toString('base64')
    pixelFont = '/* 像素字体（构建时注入，base64 woff2） */\\n'
      + \`window.PIXEL_FONT = 'data:font/woff2;base64,\${b64}';\\n\\n\`
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e
}

`
  c = c.replace(anchor, inject + anchor)
  /* 把 pixelFont 也拼进输出（和 unitArt 一样，跟在收尾前） */
  c = c.replace(`const composed = body.slice(0, closing)`, `const composed = body.slice(0, closing)`)
  writeFileSync(cp, c, 'utf8')
  console.log('compose: injection code added')
} else {
  console.log('compose: already patched')
}
