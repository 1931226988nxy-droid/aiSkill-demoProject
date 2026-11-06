/**
 * 文件职责：按当前激活角色权限返回导航树。
 */

import { Router } from 'express'

export function createNavigationRouter({ services, middleware }) {
  const router = Router()
  router.use(middleware.requireAuth)
  router.get('/navigation', (req, res) => {
    // 导航完全由当前激活角色的 permissions 计算，前端不再维护静态菜单数组。
    res.json({
      items: services.navigation.forPermissions(req.permissions),
      role: req.auth.user.role,
    })
  })
  return router
}
