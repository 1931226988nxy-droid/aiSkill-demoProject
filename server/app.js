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
  app.use(requestIdMiddleware)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    next()
  })
  app.use(express.json({ limit: '1mb' }))
  app.use((req, res, next) => {
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
    const indexFile = path.join(staticDir, 'index.html')
    if (fs.existsSync(indexFile)) {
      app.use(express.static(staticDir, { index: false }))
      app.use((req, res, next) => {
        if (req.method !== 'GET' || !req.accepts('html')) return next()
        res.sendFile(indexFile)
      })
    }
  }

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
