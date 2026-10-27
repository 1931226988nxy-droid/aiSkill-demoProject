import fs from 'node:fs'
import http from 'node:http'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { seedDatabase } from './db/seed.js'
import { createServices } from './services/index.js'
import { runAutomatedJobs } from './services/jobs.js'

const config = loadConfig()
const db = openDatabase(config.dbPath)
runMigrations(db)
const seedResult = seedDatabase(db)
const clock = () => new Date()
const services = createServices({ db, clock })

services.runJobs = () =>
  runAutomatedJobs({
    db,
    circulation: services.circulation,
    settings: services.settings,
    notifications: services.notifications,
    clock,
  })

const jobResult = services.runJobs()
console.log('[jobs] startup scan:', jobResult)

const httpServer = http.createServer()
let vite = null
let app
if (!config.production) {
  const { createServer } = await import('vite')
  vite = await createServer({
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: 'spa',
  })
  app = createApp({ db, services, config, clock, vite })
} else {
  if (!fs.existsSync(`${config.staticDir}/index.html`)) {
    console.error('生产模式需要先执行 npm run build 生成 dist/。')
    process.exit(1)
  }
  app = createApp({ db, services, config, clock, staticDir: config.staticDir })
}
httpServer.on('request', app)

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
  console.log(`图书馆管理系统（${mode}）: http://localhost:${config.port}`)
  console.log(`数据库: ${config.dbPath}`)
  if (seedResult.seeded) {
    console.log('已写入演示数据：admin/admin123、librarian/lib123456、reader/reader123')
  }
})

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n收到 ${signal}，正在关闭服务...`)
  clearInterval(jobTimer)
  const finish = () => {
    try {
      db.close()
    } catch {
      // Ignore close errors during shutdown.
    }
    process.exit(0)
  }
  if (vite) {
    vite.close().finally(() => httpServer.close(finish))
  } else {
    httpServer.close(finish)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
