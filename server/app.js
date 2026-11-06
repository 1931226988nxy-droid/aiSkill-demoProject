/**
 * 文件职责：Express 应用装配：安全响应头、JSON 解析、API 路由、静态/Vite 中间件与统一错误处理。
 */

import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { createAuthMiddleware } from './middleware/auth.js'
import { errorHandler, requestIdMiddleware } from './middleware/error.js'
import { createApiRouter } from './routes/index.js'

export function createApp({
  db,
  services,
  config,
  clock = () => new Date(),
  vite = null,
  staticDir = null,
}) {
  const app = express()
  app.disable('x-powered-by')
  // 请求 ID 必须最先挂载，后续日志和错误响应都依赖它。
  app.use(requestIdMiddleware)
  app.use((req, res, next) => {
    // API 不返回 HTML，使用一组基础安全头限制嗅探、iframe 和浏览器能力。
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    next()
  })
  app.use(express.json({ limit: '1mb' }))
  app.use((req, res, next) => {
    // 把数据库、服务容器和可控时钟注入请求，方便路由层组合业务服务。
    req.db = db
    req.services = services
    req.clock = clock
    next()
  })

  const auth = createAuthMiddleware({ auth: services.auth })
  const middleware = {
    ...auth,
  }
  const runJobs = () =>
    services.runJobs ? services.runJobs() : { skipped: true, reason: 'jobs runner not configured' }
  // API 统一挂在 /api 下；具体路由内部的公开/受保护边界由各路由器自行声明。
  app.use(
    '/api',
    createApiRouter({
      services,
      middleware,
      config,
      runJobs,
    }),
  )

  if (vite) {
    app.use(vite.middlewares)
  } else if (staticDir) {
    // 生产 SPA：静态文件优先，未命中的 GET HTML 请求回退到 index.html。
    const indexFile = path.join(staticDir, 'index.html')
    if (fs.existsSync(indexFile)) {
      app.use(express.static(staticDir, { index: false }))
      app.use((req, res, next) => {
        if (req.method !== 'GET' || !req.accepts('html')) return next()
        res.sendFile(indexFile)
      })
    }
  }

  // 未被 API 或前端资源处理的请求统一返回 JSON 404，避免泄露服务器默认错误页。
  app.use((req, res) => {
    res.status(404).json({
      code: 'NOT_FOUND',
      message: '页面或接口不存在',
      details: null,
      requestId: req.requestId,
    })
  })
  app.use(errorHandler)
  return app
}
