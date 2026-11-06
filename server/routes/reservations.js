/**
 * 文件职责：预约创建、查询与取消接口。
 */

import { Router } from 'express'
import { numericId, requestContext } from './helpers.js'

export function createReservationRouter({ services, middleware }) {
  const router = Router()
  const { requireAuth, requirePermission } = middleware
  router.use(requireAuth)

  router.get('/my/reservations', (req, res) => {
    res.json(services.reservations.listMy(req.auth.user, req.query))
  })

  router.post('/reservations', (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.reservations.create(req.body || {}, actor, ip))
  })

  router.get('/reservations', requirePermission('reservation.manage'), (req, res) => {
    res.json(services.reservations.listStaff(req.query))
  })

  router.post('/reservations/:id/cancel', (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.reservations.cancel(numericId(req.params.id, '预约编号'), actor, {
        allowManage: req.permissions.includes('reservation.manage'),
        ip,
      }),
    )
  })

  return router
}
