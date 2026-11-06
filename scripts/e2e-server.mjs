import http from 'node:http'
import { resolve } from 'node:path'
import { createApp } from '../server/app.js'
import { createTestContext } from '../server/tests/helpers.js'

// 浏览器回归使用独立内存库，不连接开发库或生产库。
const context = createTestContext()
const server = http.createServer()
server.on('request', createApp({ db: context.db, services: context.services, clock: () => context.state.now, config: { production: false, cookieSecure: false, sessionMaxAgeSeconds: 604800 }, staticDir: resolve('dist') }))
server.listen(3101, '127.0.0.1')
async function close() {
  server.closeAllConnections()
  server.close(() => { context.close(); process.exit(0) })
}
process.on('SIGTERM', close)
process.on('SIGINT', close)
