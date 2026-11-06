/**
 * 文件职责：登录、注册、个人资料、修改密码与角色切换接口。
 */

import { Router } from 'express'
import { AppError, ERR } from '../domain/errors.js'
import { clearSessionCookie, sessionCookie } from '../lib/cookies.js'
import { createAuthProtection } from '../middleware/auth-protection.js'

export function createAuthRouter({ services, middleware, config }) {
  const router = Router()
  const { requireAuth } = middleware
  const protection = createAuthProtection({ db: services.db, clock: services.clock })

  function setCookie(res, token) {
    res.setHeader(
      'Set-Cookie',
      sessionCookie(token, {
        secure: config.cookieSecure,
        maxAge: config.sessionMaxAgeSeconds,
      }),
    )
  }

  router.get('/options', (req, res) => {
    // 登录页在未登录状态读取注册开关和演示账号提示，不能要求认证。
    res.json({
      allowRegistration: services.settings.get('allow_registration'),
      demoAccounts: !config.production,
    })
  })

  router.post('/login', protection.login, async (req, res) => {
    const result = await services.auth.login(req.body || {}, { ip: req.ip || '' })
    req.clearLoginLimit()
    setCookie(res, result.token)
    res.json({ user: result.user, permissions: result.permissions })
  })

  router.post('/register', protection.register, async (req, res) => {
    const result = await services.auth.register(req.body || {}, { ip: req.ip || '' })
    setCookie(res, result.token)
    res.status(201).json({ user: result.user, permissions: result.permissions })
  })

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.auth.user, permissions: req.auth.permissions })
  })

  router.post('/logout', requireAuth, (req, res) => {
    services.auth.logout(req.sessionToken, { ip: req.ip || '' })
    res.setHeader('Set-Cookie', clearSessionCookie())
    res.json({ ok: true })
  })

  router.patch('/profile', requireAuth, (req, res) => {
    const result = services.auth.updateOwnProfile(
      req.auth.user.id,
      req.body || {},
      req.auth.user.role.id,
    )
    res.json(result)
  })

  router.post('/role', requireAuth, (req, res) => {
    // 切换只改变当前会话的 active_role_id，不修改用户主角色。
    const roleCode = req.body?.roleCode
    if (!roleCode) throw new AppError(ERR.VALIDATION, '请选择要切换的角色', 422)
    res.json(
      services.auth.switchRole(req.auth.user.id, String(roleCode), req.auth.sessionId, {
        ip: req.ip || '',
      }),
    )
  })

  router.post('/password', requireAuth, async (req, res) => {
    const { oldPassword, newPassword } = req.body || {}
    if (!oldPassword || !newPassword) {
      throw new AppError(ERR.VALIDATION, '请填写原密码和新密码', 422)
    }
    res.json(
      await services.auth.changePassword(
        req.auth.user.id,
        { oldPassword, newPassword },
        req.auth.sessionId,
      ),
    )
  })

  return router
}
