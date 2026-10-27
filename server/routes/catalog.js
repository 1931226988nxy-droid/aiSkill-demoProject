import { Router } from 'express'
import { numericId, requestContext } from './helpers.js'

export function createCatalogRouter({ services, middleware }) {
  const router = Router()
  const { requireAuth, requirePermission } = middleware
  router.use(requireAuth)

  router.get('/books', requirePermission('book.read'), (req, res) => {
    res.json(
      services.catalog.listBooks(req.query, {
        canSeeOffShelf: req.permissions.includes('book.manage'),
      }),
    )
  })

  router.get('/books/:id', requirePermission('book.read'), (req, res) => {
    res.json(services.catalog.getBook(numericId(req.params.id, '图书编号')))
  })

  router.post('/books', requirePermission('book.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.catalog.createBook(req.body || {}, actor, ip))
  })

  router.patch('/books/:id', requirePermission('book.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(services.catalog.updateBook(numericId(req.params.id, '图书编号'), req.body || {}, actor, ip))
  })

  router.post('/books/:id/off-shelf', requirePermission('book.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.catalog.offShelfBook(
        numericId(req.params.id, '图书编号'),
        req.body?.reason,
        actor,
        ip,
      ),
    )
  })

  router.get('/categories', requirePermission('book.read'), (req, res) => {
    res.json({ items: services.catalog.listCategories() })
  })

  router.post('/categories', requirePermission('book.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.catalog.createCategory(req.body || {}, actor, ip))
  })

  router.get('/authors', requirePermission('book.read'), (req, res) => {
    res.json({ items: services.catalog.listAuthors() })
  })

  router.get('/books/:bookId/copies', requirePermission('book.read'), (req, res) => {
    const book = services.catalog.getBook(numericId(req.params.bookId, '图书编号'))
    res.json({ items: book.copies || [] })
  })

  router.post('/books/:bookId/copies', requirePermission('copy.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res
      .status(201)
      .json(
        services.catalog.createCopy(
          numericId(req.params.bookId, '图书编号'),
          req.body || {},
          actor,
          ip,
        ),
      )
  })

  router.post('/books/:bookId/copies/bulk', requirePermission('copy.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res
      .status(201)
      .json(
        services.catalog.bulkCreateCopies(
          numericId(req.params.bookId, '图书编号'),
          req.body || {},
          actor,
          ip,
        ),
      )
  })

  router.get('/copies', requirePermission('copy.manage'), (req, res) => {
    res.json(services.catalog.listCopies(req.query))
  })

  router.post('/copies/inventory', requirePermission('copy.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(services.catalog.inventory(req.body || {}, actor, ip))
  })

  router.patch('/copies/:id/status', requirePermission('copy.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.catalog.updateCopyStatus(
        numericId(req.params.id, '副本编号'),
        req.body || {},
        actor,
        ip,
      ),
    )
  })

  router.get('/copies/:id/logs', requirePermission('copy.manage'), (req, res) => {
    res.json({
      items: services.catalog.copyLogs(numericId(req.params.id, '副本编号')),
    })
  })

  router.get('/locations', requirePermission('copy.manage'), (req, res) => {
    res.json({ items: services.catalog.locations() })
  })

  return router
}
