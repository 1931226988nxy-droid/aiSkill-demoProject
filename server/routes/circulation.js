/**
 * 文件职责：借还、续借、遗失登记与借阅查询接口。
 */

import { Router } from 'express'
import { numericId, requestContext } from './helpers.js'

export function createCirculationRouter({ services, middleware }) {
  const router = Router()
  const { requireAuth, requirePermission } = middleware
  router.use(requireAuth)

  router.get('/my/loans', middleware.requireReaderPermission('reader.loans.view'), (req, res) => {
    res.json(services.circulation.listMyLoans(req.auth.user, req.query))
  })

  router.post('/circulation/borrow/preview', requirePermission('circulation.manage'), (req, res) => {
    res.json(services.circulation.previewBorrow(req.body || {}))
  })

  router.post('/circulation/borrow', requirePermission('circulation.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.circulation.borrow(req.body || {}, actor, ip))
  })

  router.post('/circulation/return/preview', requirePermission('circulation.manage'), (req, res) => {
    res.json(services.circulation.previewReturn(req.body || {}))
  })

  router.post('/circulation/return', requirePermission('circulation.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(services.circulation.returnCopy(req.body || {}, actor, ip))
  })

  router.get('/circulation/loans', requirePermission('circulation.manage'), (req, res) => {
    res.json(services.circulation.listLoans(req.query))
  })

  router.post('/circulation/loans/:id/renew', (req, res) => {
    if (!req.permissions.includes('circulation.manage')) {
      middleware.requireReaderPermission('reader.loans.view')(req, res, () => {})
    }
    const { actor, ip } = requestContext(req)
    res.json(
      services.circulation.renew(numericId(req.params.id, '借阅编号'), actor, {
        allowManage: req.permissions.includes('circulation.manage'),
        ip,
      }),
    )
  })

  router.post('/circulation/loans/:id/lost', requirePermission('circulation.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.circulation.markLost(
        numericId(req.params.id, '借阅编号'),
        req.body || {},
        actor,
        ip,
      ),
    )
  })

  return router
}
