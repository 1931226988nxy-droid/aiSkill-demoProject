import { Router } from 'express'

export function createNavigationRouter({ services, middleware }) {
  const router = Router()
  router.use(middleware.requireAuth)
  router.get('/navigation', (req, res) => {
    res.json({
      items: services.navigation.forPermissions(req.permissions),
      role: req.auth.user.role,
    })
  })
  return router
}
