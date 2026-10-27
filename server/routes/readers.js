import { Router } from 'express'
import { AppError, ERR } from '../domain/errors.js'
import { numericId, requestContext } from './helpers.js'

export function createReaderRouter({ services, middleware }) {
  const router = Router()
  const { requireAuth, requirePermission, requireAnyPermission } = middleware
  router.use(requireAuth)

  router.get(
    '/readers/lookup',
    requireAnyPermission(['reader.manage', 'circulation.manage']),
    (req, res) => {
      const reader = services.circulation.getReaderByNo(req.query.readerNo)
      if (!reader) throw new AppError(ERR.NOT_FOUND, '读者不存在', 404)
      res.json(reader)
    },
  )

  router.get('/readers', requirePermission('reader.manage'), (req, res) => {
    res.json(services.readers.list(req.query))
  })

  router.post('/readers', requirePermission('reader.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.readers.create(req.body || {}, actor, ip))
  })

  router.get('/readers/:id', requirePermission('reader.manage'), (req, res) => {
    res.json(services.readers.getById(numericId(req.params.id, '读者编号')))
  })

  router.patch('/readers/:id', requirePermission('reader.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.readers.update(
        numericId(req.params.id, '读者编号'),
        req.body || {},
        actor,
        ip,
      ),
    )
  })

  router.post('/readers/:id/status', requirePermission('reader.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.readers.setStatus(
        numericId(req.params.id, '读者编号'),
        req.body?.status,
        req.body?.reason,
        actor,
        ip,
      ),
    )
  })

  return router
}
