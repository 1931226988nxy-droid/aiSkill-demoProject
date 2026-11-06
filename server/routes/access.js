/**
 * 文件职责：动态权限与菜单管理接口。
 */

import { Router } from 'express'
import { numericId, requestContext } from './helpers.js'

export function createAccessRouter({ services, middleware }) {
  const router = Router()
  const { requireAuth, requirePermission, requireAnyPermission } = middleware
  router.use(requireAuth)

  // 角色页也需要权限清单，因此读取权限允许 user.manage；写权限只给 permission.manage。
  router.get(
    '/admin/permissions',
    requireAnyPermission(['user.manage', 'permission.manage', 'menu.manage']),
    (req, res) => {
      res.json({ items: services.access.listPermissions() })
    },
  )

  router.post('/admin/permissions', requirePermission('permission.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.access.createPermission(req.body || {}, actor, ip))
  })

  router.patch('/admin/permissions/:id', requirePermission('permission.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.access.updatePermission(
        numericId(req.params.id, '权限编号'),
        req.body || {},
        actor,
        ip,
      ),
    )
  })

  router.get('/admin/menus', requirePermission('menu.manage'), (req, res) => {
    res.json({ items: services.access.listMenus() })
  })

  router.post('/admin/menus', requirePermission('menu.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.access.createMenu(req.body || {}, actor, ip))
  })

  router.patch('/admin/menus/:id', requirePermission('menu.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.access.updateMenu(numericId(req.params.id, '菜单编号'), req.body || {}, actor, ip),
    )
  })

  router.delete('/admin/menus/:id', requirePermission('menu.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(services.access.deleteMenu(numericId(req.params.id, '菜单编号'), actor, ip))
  })

  return router
}
