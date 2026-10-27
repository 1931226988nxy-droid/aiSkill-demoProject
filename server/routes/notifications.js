import { Router } from 'express'
import { AppError, ERR } from '../domain/errors.js'
import { paged, parsePaging } from '../lib/pagination.js'
import { numericId } from './helpers.js'

export function createNotificationRouter({ services, middleware }) {
  const router = Router()
  const { requireAuth } = middleware
  router.use(requireAuth)

  router.get('/notifications', (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query)
    const where = ['user_id = ?']
    const params = [req.auth.user.id]
    if (req.query.unread === '1' || req.query.unread === 'true') {
      where.push('read_at IS NULL')
    }
    if (req.query.type) {
      where.push('type = ?')
      params.push(String(req.query.type))
    }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const total = Number(
      services.db.prepare(`SELECT COUNT(*) AS count FROM notifications ${whereSql}`).get(...params)
        .count,
    )
    const rows = services.db
      .prepare(
        `SELECT * FROM notifications ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset)
    res.json(
      paged(
        rows.map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          content: row.content,
          relatedType: row.related_type,
          relatedId: row.related_id,
          readAt: row.read_at,
          createdAt: row.created_at,
        })),
        total,
        page,
        pageSize,
      ),
    )
  })

  router.get('/notifications/unread-count', (req, res) => {
    const row = services.db
      .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(req.auth.user.id)
    res.json({ count: Number(row.count) })
  })

  router.post('/notifications/read-all', (req, res) => {
    const result = services.db
      .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
      .run(new Date().toISOString(), req.auth.user.id)
    res.json({ updated: Number(result.changes) })
  })

  router.post('/notifications/:id/read', (req, res) => {
    const id = numericId(req.params.id, '通知编号')
    const row = services.db
      .prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?')
      .get(id, req.auth.user.id)
    if (!row) throw new AppError(ERR.NOT_FOUND, '通知不存在', 404)
    if (!row.read_at) {
      services.db
        .prepare('UPDATE notifications SET read_at = ? WHERE id = ?')
        .run(new Date().toISOString(), id)
    }
    res.json({ ok: true })
  })

  router.get('/announcements', (req, res) => {
    res.json({ items: services.admin.listPublishedAnnouncements() })
  })

  return router
}
