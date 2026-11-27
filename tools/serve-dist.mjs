/**
 * 极小静态服务器：把 dist/ 里的自包含 index.html 挂到本地端口，交给 ngrok 转发。
 *   node tools/serve-dist.mjs [port] [dir]
 * 只服务 GET/HEAD，只读，不列出目录。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2]) || 8787
const root = resolve(process.argv[3] || join(here, '..', 'dist'))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('method not allowed')
    return
  }
  const url = new URL(req.url || '/', 'http://localhost')
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const file = normalize(join(root, rel))
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden')
    return
  }
  try {
    const buf = await readFile(file)
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'content-length': buf.length
    })
    if (req.method === 'HEAD') res.end()
    else res.end(buf)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}`)
})
