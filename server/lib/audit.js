/**
 * 文件职责：写入不可变审计日志的统一辅助函数。
 */

export function writeAudit(
  db,
  {
    actor = null,
    action,
    objectType,
    objectId = null,
    result = 'success',
    details = {},
    ip = '',
    createdAt = new Date().toISOString(),
  },
) {
  // 审计只追加不更新；details 以 JSON 保存，便于按业务对象追溯变更前后值。
  db.prepare(
    `INSERT INTO audit_logs
      (actor_id, actor_name, action, object_type, object_id, result, details, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    actor?.id ?? null,
    actor?.displayName || actor?.username || 'system',
    action,
    objectType,
    objectId == null ? null : String(objectId),
    result,
    JSON.stringify(details ?? {}),
    ip,
    createdAt,
  )
}
