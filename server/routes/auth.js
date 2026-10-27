import { Router } from 'express'
import { AppError, ERR } from '../domain/errors.js'
import { clearSessionCookie, sessionCookie } from '../lib/cookies.js'

export function createAuthRouter({ services, middleware, config }) {
  const router = Router()
  const { requireAuth } = middleware

  function setCookie(res, token) {
    res.setHeader(
      'Set-Cookie',
      sessionCookie(token, {
        secure: config.cookieSecure,
        maxAge: config.sessionMaxAgeSeconds,
      }),
    )
  }

  router.post('/login', (req, res) => {
    const result = services.auth.login(req.body || {}, { ip: req.ip || '' })
    setCookie(res, result.token)
    res.json({ user: result.user, permissions: result.permissions })
  })

  router.post('/register', (req, res) => {
    const result = services.auth.register(req.body || {}, { ip: req.ip || '' })
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
    const roleCode = req.body?.roleCode
    if (!roleCode) throw new AppError(ERR.VALIDATION, '请选择要切换的角色', 422)
    res.json(
      services.auth.switchRole(req.auth.user.id, String(roleCode), req.auth.sessionId, {
        ip: req.ip || '',
      }),
    )
  })

  router.post('/password', requireAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body || {}
    if (!oldPassword || !newPassword) {
      throw new AppError(ERR.VALIDATION, '请填写原密码和新密码', 422)
    }
    res.json(
      services.auth.changePassword(
        req.auth.user.id,
        { oldPassword, newPassword },
        req.auth.sessionId,
      ),
    )
  })

  return router
}
