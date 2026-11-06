/**
 * 站内通知是默认渠道。外部邮件/短信只需实现 send(notification) 适配器并注入，
 * 未配置时绝不伪造发送成功。
 */
export function createNotificationService({ db, clock = () => new Date(), externalAdapter = null }) {
  function send({
    userId,
    type,
    title,
    content,
    relatedType = null,
    relatedId = null,
    dedupeKey = null,
  }) {
    const now = clock().toISOString()
    // dedupeKey 唯一索引让同一业务事件重复扫描时只落一条站内通知。
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO notifications
          (user_id, type, title, content, related_type, related_id, dedupe_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, type, title, content, relatedType, relatedId, dedupeKey, now)
    if (!result.changes) return null
    const notification = db
      .prepare('SELECT * FROM notifications WHERE id = ?')
      .get(Number(result.lastInsertRowid))
    if (externalAdapter?.send) {
      // 外部渠道异步发送且失败不回滚主业务；站内通知已经落库，用户至少能看到。
      Promise.resolve(externalAdapter.send(notification)).catch(() => {
        // 外部渠道失败不能回滚已经完成的借阅/预约业务。
      })
    }
    return notification
  }

  function forReader(readerId, payload) {
    const profile = db.prepare('SELECT user_id FROM reader_profiles WHERE id = ?').get(readerId)
    if (!profile) return null
    return send({ ...payload, userId: profile.user_id })
  }

  return { send, forReader }
}
