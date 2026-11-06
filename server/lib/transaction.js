/**
 * 文件职责：SQLite 立即事务封装与唯一约束识别。
 */

export function transaction(db, work) {
  // BEGIN IMMEDIATE 立即获取写锁，避免两个请求都通过读校验后才在写入阶段冲突。
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 事务可能已被 SQLite 自动回滚，忽略二次回滚错误。
    }
    throw error
  }
}

export function isUniqueConstraint(error) {
  return /UNIQUE constraint failed|constraint failed/i.test(String(error?.message || ''))
}
