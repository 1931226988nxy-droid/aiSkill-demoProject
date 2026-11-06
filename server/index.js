/**
 * 文件职责：服务启动入口：迁移与种子、依赖装配、Vite/静态托管、定时任务和优雅关闭。
 */

import fs from 'node:fs'
import http from 'node:http'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { seedDatabase } from './db/seed.js'
import { createServices } from './services/index.js'
import { runAutomatedJobs } from './services/jobs.js'

// 启动顺序不可随意调整：先完成数据库迁移，再写入种子，最后装配依赖并开放端口。
const config = loadConfig()
const db = openDatabase(config.dbPath)
runMigrations(db)
const seedResult = seedDatabase(db, {
  demo: !config.production,
  initialAdmin: {
    username: config.initialAdminUsername,
    password: config.initialAdminPassword,
  },
})
const clock = () => new Date()
const services = createServices({ db, clock })

// 任务运行器挂到服务容器上，后台“立即扫描”和定时扫描共用同一实现。
services.runJobs = () => services.operations.runJobs(() =>
  runAutomatedJobs({
    db,
    circulation: services.circulation,
    settings: services.settings,
    notifications: services.notifications,
    clock,
  }))

const jobResult = services.runJobs()
console.log('[jobs] startup scan:', jobResult)

const httpServer = http.createServer()
let vite = null
let app
if (!config.production) {
  // 开发模式把 Vite 作为中间件挂到同一个 HTTP 服务，API 与页面同源，避免 CORS。
  const { createServer } = await import('vite')
  vite = await createServer({
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: 'spa',
  })
  app = createApp({ db, services, config, clock, vite })
} else {
  // 生产模式只提供预构建 dist；缺少构建产物时立即失败，避免静默返回空页面。
  if (!fs.existsSync(`${config.staticDir}/index.html`)) {
    console.error('生产模式需要先执行 npm run build 生成 dist/。')
    process.exit(1)
  }
  app = createApp({ db, services, config, clock, staticDir: config.staticDir })
}
httpServer.on('request', app)

// 每 15 分钟处理逾期、到期提醒、预约过期和过期会话；启动时也会立即扫描一次。
const jobTimer = setInterval(() => {
  try {
    const result = services.runJobs()
    if (
      result.overdueNotices ||
      result.dueSoonNotices ||
      result.expiredReservations ||
      result.overdueFees
    ) {
      console.log('[jobs] interval scan:', result)
    }
  } catch (error) {
    console.error('[jobs] interval scan failed:', error)
  }
}, 15 * 60 * 1000)

httpServer.listen(config.port, config.host, () => {
  const mode = config.production ? 'production' : 'development'
  console.log(`图书馆管理系统（${mode}）: http://localhost:${httpServer.address().port}`)
  console.log(`数据库: ${config.dbPath}`)
  if (seedResult.seeded && seedResult.demo) {
    console.log('已写入演示数据：admin/admin123、librarian/lib123456、reader/reader123')
  } else if (seedResult.seeded) {
    console.log(`已创建初始管理员：${config.initialAdminUsername}`)
  }
})

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n收到 ${signal}，正在关闭服务...`)
  clearInterval(jobTimer)
  const deadline = setTimeout(() => {
    console.error('关闭超时，强制退出；未完成请求将由客户端重试。')
    process.exit(1)
  }, 10_000)
  deadline.unref()
  const finish = () => {
    clearTimeout(deadline)
    try {
      db.close()
    } catch {
      // 关闭阶段的数据库异常不再阻断进程退出。
    }
    process.exit(0)
  }
  if (vite) {
    // 先关闭 Vite 的 watcher/WS，再关闭 HTTP 服务，避免开发态残留句柄。
    vite.close().finally(() => httpServer.close(finish))
  } else {
    httpServer.close(finish)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
