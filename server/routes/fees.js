import { Router } from 'express'
import { numericId, requestContext } from './helpers.js'

export function createFeeRouter({ services, middleware }) {
  const router = Router()
  const { requireAuth, requirePermission } = middleware
  router.use(requireAuth)

  router.get('/my/fees', (req, res) => {
    res.json(services.fees.listMy(req.auth.user, req.query))
  })

  router.get('/fees', requirePermission('fee.manage'), (req, res) => {
    res.json(services.fees.list(req.query))
  })

  router.post('/fees', requirePermission('fee.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.fees.createManual(req.body || {}, actor, ip))
  })

  router.post('/fees/:id/handle', requirePermission('fee.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.fees.handle(numericId(req.params.id, '费用编号'), req.body || {}, actor, ip),
    )
  })

  return router
}
