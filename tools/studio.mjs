/**
 * 用 dsh-game-studio 的引擎驱动本工程（与它 15 个 game_studio_* 工具同一套实现）：
 *
 *   node tools/studio.mjs build [备注]
 *   node tools/studio.mjs playtest [秒数] [web|wechat]
 *   node tools/studio.mjs export                 # 单文件离线 HTML
 *   node tools/studio.mjs wx [appid] [分享标题]   # < 4MB 微信小游戏包
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '..')
const src = (name) => pathToFileURL(resolve('D:/deepseek/杂项/dsh-game-studio/src', name)).href

const { buildProject } = await import(src('build.ts'))
const { playtest, describePlaytest } = await import(src('playtest.ts'))
const { exportProjectHtml } = await import(src('operations.ts'))
const { exportWechatProject } = await import(src('wechat.ts'))

const [cmd = 'build', a1, a2] = process.argv.slice(2)

if (cmd === 'build') {
  const result = await buildProject(dir, a1 ?? '构建')
  console.log(JSON.stringify(result, null, 2))
} else if (cmd === 'playtest') {
  const seconds = Math.min(60, Math.max(1, Number(a1) || 20))
  const platform = a2 === 'wechat' ? 'wechat' : 'web'
  const report = await playtest(dir, { seconds, platform, scale: 2 })
  console.log(describePlaytest(report))
  console.log('---')
  console.log(JSON.stringify({
    browser: report.browser,
    platform: report.platform,
    viewport: report.viewport,
    phases: report.phases,
    finalPhase: report.finalPhase,
    bestScore: report.bestScore,
    hearts: report.hearts,
    fps: report.fps,
    autoplay: report.autoplay,
    errors: report.errors,
    requests: report.requests,
    notes: report.notes,
    shots: report.shots,
    renders: report.renders,
    buildCurrent: report.buildCurrent,
  }, null, 2))
} else if (cmd === 'export') {
  const out = await exportProjectHtml(dir)
  console.log(JSON.stringify(out, null, 2))
} else if (cmd === 'wx') {
  const out = await exportWechatProject(dir, {
    appid: a1 ?? 'touristappid',
    shareTitle: a2 ?? '仓鼠零食工厂 · 三消啃零食',
  })
  console.log(JSON.stringify(out, null, 2))
} else {
  console.error(`未知命令 ${cmd}`)
  process.exit(2)
}
