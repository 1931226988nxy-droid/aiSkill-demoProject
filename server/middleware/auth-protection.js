import { createHash } from 'node:crypto'
import { AppError } from '../domain/errors.js'

// 单实例使用数据库保存计数，重启服务不会清除窗口内的限流状态。
export function createAuthProtection({ db, clock = () => new Date() }) {
  function consume(scope, value, max, res) {
    const now = clock().getTime()
    const windowMs = 15 * 60 * 1000
    const key = createHash('sha256').update(`${scope}:${value}`).digest('hex')
    db.prepare('DELETE FROM auth_limits WHERE window_start <= ?').run(now - windowMs)
    db.prepare(`INSERT INTO auth_limits (key, window_start, attempts) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1`).run(key, now)
    const limit = db.prepare('SELECT * FROM auth_limits WHERE key = ?').get(key)
    if (limit.attempts > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((limit.window_start + windowMs - now) / 1000))))
      throw new AppError('RATE_LIMITED', '尝试次数过多，请稍后重试', 429)
    }
    return key
  }
  return {
    login(req, res, next) {
      consume('login-ip', req.ip || 'unknown', 60, res)
      const name = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : ''
      const key = consume('login-account', name, 10, res)
      req.clearLoginLimit = () => db.prepare('DELETE FROM auth_limits WHERE key = ?').run(key)
      next()
    },
    register(req, res, next) {
      consume('register-ip', req.ip || 'unknown', 10, res)
      next()
    },
  }
}
