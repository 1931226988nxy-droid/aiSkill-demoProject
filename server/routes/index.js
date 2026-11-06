/**
 * 文件职责：API 路由装配顺序，以及公开路由与受保护路由边界。
 */

import { Router } from 'express'
import { createAdminRouter } from './admin.js'
import { createAccessRouter } from './access.js'
import { createAuthRouter } from './auth.js'
import { createCatalogRouter } from './catalog.js'
import { createCirculationRouter } from './circulation.js'
import { createFeeRouter } from './fees.js'
import { createNavigationRouter } from './navigation.js'
import { createNotificationRouter } from './notifications.js'
import { createReaderRouter } from './readers.js'
import { createReportRouter } from './reports.js'
import { createReservationRouter } from './reservations.js'
import { apiNotFound } from '../middleware/error.js'

export function createApiRouter({ services, middleware, config, runJobs }) {
  const router = Router()
  // attach 对所有 /api 请求执行，登录接口也需要读取可选 Cookie 以做退出/切换。
  router.use(middleware.attach)
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() })
  })
  // /auth 内部自行区分公开接口（login/register/options）与需登录接口。
  router.use('/auth', createAuthRouter({ services, middleware, config }))
  // 从这一行起，后续所有业务路由默认必须登录；权限再由各子路由声明。
  router.use(middleware.requireAuth)
  router.use(createNavigationRouter({ services, middleware }))
  router.use(createCatalogRouter({ services, middleware }))
  router.use(createCirculationRouter({ services, middleware }))
  router.use(createReservationRouter({ services, middleware }))
  router.use(createReaderRouter({ services, middleware }))
  router.use(createFeeRouter({ services, middleware }))
  router.use(createNotificationRouter({ services, middleware }))
  router.use(createReportRouter({ services, middleware }))
  router.use(createAccessRouter({ services, middleware }))
  router.use(createAdminRouter({ services, middleware, runJobs }))
  router.use(apiNotFound)
  return router
}
