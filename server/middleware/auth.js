/**
 * 文件职责：从会话令牌解析当前用户，并提供认证与权限中间件。
 */

import { AppError, ERR } from '../domain/errors.js'
import { parseCookies } from '../lib/cookies.js'

export function createAuthMiddleware({ auth }) {
  function attach(req, res, next) {
    // attach 只解析身份，不强制登录；公开接口也需要它来识别可选会话。
    const token = parseCookies(req.headers.cookie || '').lib_session || null
    const session = auth.resolveSession(token)
    req.sessionToken = token
    req.auth = session
    req.user = session?.user || null
    req.permissions = session?.permissions || []
    next()
  }

  function requireAuth(req, res, next) {
    if (!req.auth) throw new AppError(ERR.AUTH_REQUIRED, '请先登录', 401)
    next()
  }

  function requirePermission(code) {
    // 权限校验使用“当前激活角色”的 permissions；角色切换后自动生效。
    return (req, res, next) => {
      if (!req.auth) throw new AppError(ERR.AUTH_REQUIRED, '请先登录', 401)
      if (!req.permissions.includes(code)) {
        throw new AppError(ERR.FORBIDDEN, '当前账号没有此操作权限', 403, { permission: code })
      }
      next()
    }
  }

  function requireAnyPermission(codes) {
    return (req, res, next) => {
      if (!req.auth) throw new AppError(ERR.AUTH_REQUIRED, '请先登录', 401)
      if (!codes.some((code) => req.permissions.includes(code))) {
        throw new AppError(ERR.FORBIDDEN, '当前账号没有此操作权限', 403, { permissions: codes })
      }
      next()
    }
  }

  function allowPermission(code) {
    return (req) => req.permissions.includes(code)
  }

  return { attach, requireAuth, requirePermission, requireAnyPermission, allowPermission }
}
