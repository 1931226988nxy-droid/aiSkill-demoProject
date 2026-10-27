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
