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
  router.use(middleware.attach)
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() })
  })
  router.use('/auth', createAuthRouter({ services, middleware, config }))
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
