/**
 * 文件职责：系统管理接口：用户、角色、设置、公告、审计与任务扫描。
 */

import { Router } from 'express'
import { numericId, requestContext } from './helpers.js'

export function createAdminRouter({ services, middleware, runJobs }) {
  const router = Router()
  const { requireAuth, requirePermission } = middleware
  router.use(requireAuth)

  router.get('/admin/users', requirePermission('user.manage'), (req, res) => {
    res.json(services.admin.listUsers(req.query))
  })

  router.post('/admin/users', requirePermission('user.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.admin.createUser(req.body || {}, actor, ip))
  })

  router.patch('/admin/users/:id', requirePermission('user.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.admin.updateUser(
        numericId(req.params.id, '账号编号'),
        req.body || {},
        actor,
        ip,
      ),
    )
  })

  router.post('/admin/users/:id/reset-password', requirePermission('user.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.admin.resetPassword(
        numericId(req.params.id, '账号编号'),
        req.body || {},
        actor,
        ip,
      ),
    )
  })

  router.get('/admin/roles', requirePermission('user.manage'), (req, res) => {
    res.json({ items: services.admin.listRoles() })
  })

  router.post('/admin/roles', requirePermission('user.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.admin.createRole(req.body || {}, actor, ip))
  })

  router.patch('/admin/roles/:id', requirePermission('user.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.admin.updateRole(
        numericId(req.params.id, '角色编号'),
        req.body || {},
        actor,
        ip,
      ),
    )
  })

  router.patch('/admin/roles/:id/permissions', requirePermission('user.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.admin.setRolePermissions(
        numericId(req.params.id, '角色编号'),
        req.body?.permissions,
        actor,
        ip,
      ),
    )
  })

  router.delete('/admin/roles/:id', requirePermission('user.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(services.admin.deleteRole(numericId(req.params.id, '角色编号'), actor, ip))
  })

  router.get('/admin/settings', requirePermission('settings.manage'), (req, res) => {
    res.json(services.admin.getSettings())
  })

  router.patch('/admin/settings', requirePermission('settings.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(services.admin.updateSettings(req.body || {}, actor, ip))
  })

  router.get('/admin/audit-logs', requirePermission('audit.view'), (req, res) => {
    res.json(services.admin.listAuditLogs(req.query))
  })

  router.get('/admin/announcements', requirePermission('announcement.manage'), (req, res) => {
    res.json(services.admin.listAnnouncements(req.query))
  })

  router.post('/admin/announcements', requirePermission('announcement.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.status(201).json(services.admin.createAnnouncement(req.body || {}, actor, ip))
  })

  router.patch('/admin/announcements/:id', requirePermission('announcement.manage'), (req, res) => {
    const { actor, ip } = requestContext(req)
    res.json(
      services.admin.updateAnnouncement(
        numericId(req.params.id, '公告编号'),
        req.body || {},
        actor,
        ip,
      ),
    )
  })

  router.post(
    '/admin/announcements/:id/status',
    requirePermission('announcement.manage'),
    (req, res) => {
      const { actor, ip } = requestContext(req)
      res.json(
        services.admin.setAnnouncementStatus(
          numericId(req.params.id, '公告编号'),
          req.body?.status,
          actor,
          ip,
        ),
      )
    },
  )

  router.post('/admin/jobs/run', requirePermission('settings.manage'), (req, res) => {
    res.json(runJobs())
  })

  return router
}
