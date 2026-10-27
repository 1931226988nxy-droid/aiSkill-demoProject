import { randomBytes } from 'node:crypto'
import { AppError, ERR } from '../domain/errors.js'
import { writeAudit } from '../lib/audit.js'
import { paged, parsePaging } from '../lib/pagination.js'
import { createReaderNumber, hashPassword } from '../lib/passwords.js'
import { startOfNextShanghaiDate, startOfShanghaiDate } from '../lib/time.js'
import { isUniqueConstraint, transaction } from '../lib/transaction.js'
import {
  enumValue,
  escapeLike,
  integer,
  optionalString,
  password,
  requiredString,
  username,
} from '../lib/validation.js'

const USER_SELECT = `SELECT u.*, r.code AS role_code, r.name AS role_name
  FROM users u JOIN roles r ON r.id = u.role_id`

function mapUser(row, roles = []) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: { id: row.role_id, code: row.role_code, name: row.role_name },
    primaryRoleCode: row.role_code,
    roles,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rolesForUsers(db, userIds) {
  if (!userIds.length) return new Map()
  const placeholders = userIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT ur.user_id, r.id, r.code, r.name, r.description, r.built_in
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id IN (${placeholders})
       ORDER BY r.built_in DESC, r.id`,
    )
    .all(...userIds)
  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, [])
    map.get(row.user_id).push({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      builtIn: Boolean(row.built_in),
    })
  }
  return map
}

function resolveRoleCodes(db, input) {
  const raw = Array.isArray(input.roleCodes)
    ? input.roleCodes
    : input.roleCode
      ? [input.roleCode]
      : []
  const codes = [...new Set(raw.map((code) => String(code || '').trim()).filter(Boolean))]
  if (!codes.length) {
    throw new AppError(ERR.VALIDATION, '每个账号至少需要一个角色', 422, {
      fields: { roleCodes: '请至少选择一个角色' },
    })
  }
  const placeholders = codes.map(() => '?').join(',')
  const roles = db
    .prepare(`SELECT * FROM roles WHERE code IN (${placeholders})`)
    .all(...codes)
  if (roles.length !== codes.length) {
    const found = new Set(roles.map((role) => role.code))
    const missing = codes.filter((code) => !found.has(code))
    throw new AppError(ERR.VALIDATION, `角色不存在：${missing.join('、')}`, 422, {
      fields: { roleCodes: `角色不存在：${missing.join('、')}` },
    })
  }
  return roles
}

function nextReaderNumber(db) {
  const maxProfile = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM reader_profiles').get()
  let sequence = Number(maxProfile.maxId) + 1
  let readerNo = createReaderNumber(sequence)
  while (db.prepare('SELECT 1 FROM reader_profiles WHERE reader_no = ?').get(readerNo)) {
    sequence += 1
    readerNo = createReaderNumber(sequence)
  }
  return readerNo
}

function ensureReaderProfile(db, userId, displayName, roles, now) {
  if (!roles.some((role) => role.code === 'reader')) return null
  const existing = db.prepare('SELECT id FROM reader_profiles WHERE user_id = ?').get(userId)
  if (existing) return existing.id
  const readerNo = nextReaderNumber(db)
  return Number(
    db
      .prepare(
        `INSERT INTO reader_profiles
          (user_id, reader_no, full_name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      )
      .run(userId, readerNo, displayName, now, now).lastInsertRowid,
  )
}

function mapAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    status: row.status,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createAdminService({ db, clock = () => new Date(), settings }) {
  function listUsers(filters = {}) {
    const { page, pageSize, offset } = parsePaging(filters)
    const where = [
      `EXISTS (SELECT 1 FROM user_roles ur0 JOIN roles rr0 ON rr0.id = ur0.role_id
        WHERE ur0.user_id = u.id AND rr0.code != 'reader')`,
    ]
    const params = []
    if (filters.q) {
      const value = `%${escapeLike(filters.q)}%`
      where.push("(u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')")
      params.push(value, value)
    }
    if (filters.roleCode) {
      where.push(`EXISTS (SELECT 1 FROM user_roles urf JOIN roles rf ON rf.id = urf.role_id
        WHERE urf.user_id = u.id AND rf.code = ?)`)
      params.push(filters.roleCode)
    }
    if (filters.status && filters.status !== 'all') {
      where.push('u.status = ?')
      params.push(enumValue(filters.status, 'status', '账号状态', ['active', 'disabled']))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(
      db.prepare(`SELECT COUNT(*) AS count FROM users u ${whereSql}`).get(...params).count,
    )
    const rows = db
      .prepare(`${USER_SELECT} ${whereSql} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset)
    const rolesMap = rolesForUsers(db, rows.map((row) => row.id))
    return paged(
      rows.map((row) => mapUser(row, rolesMap.get(row.id) || [])),
      total,
      page,
      pageSize,
    )
  }

  function createUser(input, actor, ip = '') {
    const name = username(input.username)
    const pass = password(input.password)
    const displayName = requiredString(input.displayName, 'displayName', '姓名', { max: 50 })
    const roles = resolveRoleCodes(db, input)
    const primaryRoleCode = input.primaryRoleCode || roles[0].code
    const primaryRole = roles.find((role) => role.code === primaryRoleCode)
    if (!primaryRole) {
      throw new AppError(ERR.VALIDATION, '主角色必须是已分配角色之一', 422, {
        fields: { primaryRoleCode: '主角色必须是已分配角色之一' },
      })
    }
    const now = clock().toISOString()
    try {
      return transaction(db, () => {
        const result = db
          .prepare(
            `INSERT INTO users (username, password_hash, display_name, role_id, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'active', ?, ?)`,
          )
          .run(name, hashPassword(pass), displayName, primaryRole.id, now, now)
        const userId = Number(result.lastInsertRowid)
        const roleInsert = db.prepare(
          'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)',
        )
        for (const role of roles) roleInsert.run(userId, role.id, now)
        const readerProfileId = ensureReaderProfile(db, userId, displayName, roles, now)
        writeAudit(db, {
          actor,
          action: 'user.create',
          objectType: 'user',
          objectId: userId,
          details: {
            username: name,
            roleCodes: roles.map((role) => role.code),
            primaryRoleCode,
            readerProfileId,
          },
          ip,
          createdAt: now,
        })
        const row = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(userId)
        return mapUser(row, roles.map((role) => ({
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          builtIn: Boolean(role.built_in),
        })))
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '用户名已存在', 409)
      throw error
    }
  }

  function updateUser(id, input, actor, ip = '') {
    const current = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id)
    if (!current) throw new AppError(ERR.NOT_FOUND, '账号不存在', 404)
    const currentRoles = rolesForUsers(db, [id]).get(id) || []
    const displayName = input.displayName === undefined
      ? current.display_name
      : requiredString(input.displayName, 'displayName', '姓名', { max: 50 })
    const status = input.status === undefined
      ? current.status
      : enumValue(input.status, 'status', '账号状态', ['active', 'disabled'])
    const roleCodesProvided = input.roleCodes !== undefined || input.roleCode !== undefined
    const roles = roleCodesProvided ? resolveRoleCodes(db, input) : currentRoles
    const primaryRoleCode = input.primaryRoleCode || roles.find((role) => role.id === current.role_id)?.code || roles[0]?.code
    const primaryRole = roles.find((role) => role.code === primaryRoleCode)
    if (!primaryRole) {
      throw new AppError(ERR.VALIDATION, '主角色必须是已分配角色之一', 422, {
        fields: { primaryRoleCode: '主角色必须是已分配角色之一' },
      })
    }
    const currentCodes = currentRoles.map((role) => role.code).sort().join(',')
    const nextCodes = roles.map((role) => role.code).sort().join(',')
    const rolesChanged = currentCodes !== nextCodes || primaryRole.id !== current.role_id
    if (id === actor.id && (status === 'disabled' || rolesChanged)) {
      throw new AppError(ERR.CONFLICT, '不能停用自己的账号或修改自己的角色', 409)
    }
    const now = clock().toISOString()
    return transaction(db, () => {
      db.prepare(
        'UPDATE users SET display_name = ?, role_id = ?, status = ?, updated_at = ? WHERE id = ?',
      ).run(displayName, primaryRole.id, status, now, id)
      if (roleCodesProvided || rolesChanged) {
        db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(id)
        const insert = db.prepare(
          'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)',
        )
        for (const role of roles) insert.run(id, role.id, now)
      }
      const readerProfileId = ensureReaderProfile(db, id, displayName, roles, now)
      writeAudit(db, {
        actor,
        action: 'user.update',
        objectType: 'user',
        objectId: id,
        details: {
          username: current.username,
          displayName,
          status,
          roleCodes: roles.map((role) => role.code),
          primaryRoleCode,
          readerProfileId,
        },
        ip,
        createdAt: now,
      })
      const row = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id)
      return mapUser(
        row,
        roles.map((role) => ({
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          builtIn: Boolean(role.built_in),
        })),
      )
    })
  }

  function resetPassword(id, input, actor, ip = '') {
    const current = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id)
    if (!current) throw new AppError(ERR.NOT_FOUND, '账号不存在', 404)
    const temporary = input?.newPassword
      ? password(input.newPassword)
      : randomBytes(9).toString('base64url')
    const now = clock().toISOString()
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(temporary),
      now,
      id,
    )
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    writeAudit(db, {
      actor,
      action: 'user.reset_password',
      objectType: 'user',
      objectId: id,
      details: { username: current.username },
      ip,
      createdAt: now,
    })
    return { username: current.username, temporaryPassword: temporary }
  }

  function listPermissions() {
    return db
      .prepare('SELECT * FROM permissions ORDER BY group_name, code')
      .all()
      .map((row) => ({ id: row.id, code: row.code, name: row.name, group: row.group_name }))
  }

  function listRoles() {
    const roles = db.prepare('SELECT * FROM roles ORDER BY built_in DESC, id ASC').all()
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      builtIn: Boolean(role.built_in),
      userCount: Number(
        db.prepare('SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?').get(role.id).count,
      ),
      permissions: role.code === 'admin'
        ? db
            .prepare("SELECT code FROM permissions WHERE status = 'active' ORDER BY code")
            .all()
            .map((row) => row.code)
        : db
            .prepare(
              `SELECT p.code FROM permissions p
               JOIN role_permissions rp ON rp.permission_id = p.id
               WHERE rp.role_id = ? AND p.status = 'active' ORDER BY p.code`,
            )
            .all(role.id)
            .map((row) => row.code),
    }))
  }

  function createRole(input, actor, ip = '') {
    const code = requiredString(input.code, 'code', '角色编码', { max: 40 }).toLowerCase()
    if (!/^[a-z][a-z0-9_]{2,39}$/.test(code)) {
      throw new AppError(ERR.VALIDATION, '角色编码需以小写字母开头，仅含小写字母、数字和下划线', 422, {
        fields: { code: '角色编码格式不正确' },
      })
    }
    const name = requiredString(input.name, 'name', '角色名称', { max: 40 })
    const description = optionalString(input.description, 'description', '说明', { max: 200 })
    const now = clock().toISOString()
    try {
      return transaction(db, () => {
        const result = db
          .prepare(
            'INSERT INTO roles (code, name, description, built_in, created_at) VALUES (?, ?, ?, 0, ?)',
          )
          .run(code, name, description, now)
        const id = Number(result.lastInsertRowid)
        writeAudit(db, {
          actor,
          action: 'role.create',
          objectType: 'role',
          objectId: id,
          details: { code, name },
          ip,
          createdAt: now,
        })
        return listRoles().find((role) => role.id === id)
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '角色编码已存在', 409)
      throw error
    }
  }

  function updateRole(id, input, actor, ip = '') {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id)
    if (!role) throw new AppError(ERR.NOT_FOUND, '角色不存在', 404)
    const name = input.name === undefined
      ? role.name
      : requiredString(input.name, 'name', '角色名称', { max: 40 })
    const description = input.description === undefined
      ? role.description
      : optionalString(input.description, 'description', '说明', { max: 200 })
    const now = clock().toISOString()
    db.prepare('UPDATE roles SET name = ?, description = ? WHERE id = ?').run(name, description, id)
    writeAudit(db, {
      actor,
      action: 'role.update',
      objectType: 'role',
      objectId: id,
      details: { code: role.code, name, description },
      ip,
      createdAt: now,
    })
    return listRoles().find((item) => item.id === id)
  }

  function setRolePermissions(id, codes, actor, ip = '') {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id)
    if (!role) throw new AppError(ERR.NOT_FOUND, '角色不存在', 404)
    if (role.code === 'admin') {
      throw new AppError(ERR.CONFLICT, '管理员角色拥有全部权限，不允许修改', 409)
    }
    if (!Array.isArray(codes)) {
      throw new AppError(ERR.VALIDATION, '权限列表格式不正确', 422)
    }
    const unique = [...new Set(codes.map(String))]
    const allowed = new Set(db.prepare('SELECT code FROM permissions').all().map((row) => row.code))
    const unknown = unique.filter((code) => !allowed.has(code))
    if (unknown.length) {
      throw new AppError(ERR.VALIDATION, `未知权限：${unknown.join('、')}`, 422)
    }
    const now = clock().toISOString()
    return transaction(db, () => {
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id)
      const insert = db.prepare(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT ?, id FROM permissions WHERE code = ?`,
      )
      for (const code of unique) insert.run(id, code)
      writeAudit(db, {
        actor,
        action: 'role.permissions_update',
        objectType: 'role',
        objectId: id,
        details: { code: role.code, permissions: unique },
        ip,
        createdAt: now,
      })
      return listRoles().find((item) => item.id === id)
    })
  }

  function deleteRole(id, actor, ip = '') {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id)
    if (!role) throw new AppError(ERR.NOT_FOUND, '角色不存在', 404)
    if (role.built_in) throw new AppError(ERR.CONFLICT, '内置角色不能删除', 409)
    const users = db.prepare('SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?').get(id)
    if (Number(users.count) > 0) {
      throw new AppError(ERR.CONFLICT, '角色仍有账号使用，不能删除', 409)
    }
    db.prepare('DELETE FROM roles WHERE id = ?').run(id)
    writeAudit(db, {
      actor,
      action: 'role.delete',
      objectType: 'role',
      objectId: id,
      details: { code: role.code },
      ip,
      createdAt: clock().toISOString(),
    })
    return { deleted: true }
  }

  function getSettings() {
    return settings.getAll()
  }

  function updateSettings(values, actor, ip = '') {
    const updated = settings.update(values)
    writeAudit(db, {
      actor,
      action: 'settings.update',
      objectType: 'settings',
      objectId: null,
      details: values,
      ip,
      createdAt: clock().toISOString(),
    })
    return updated
  }

  function listAuditLogs(filters = {}) {
    const { page, pageSize, offset } = parsePaging(filters, { defaultPageSize: 20 })
    const where = []
    const params = []
    if (filters.q) {
      const value = `%${escapeLike(filters.q)}%`
      where.push(
        "(actor_name LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR object_type LIKE ? ESCAPE '\\' OR object_id LIKE ? ESCAPE '\\')",
      )
      params.push(value, value, value, value)
    }
    if (filters.action) {
      where.push('action = ?')
      params.push(filters.action)
    }
    if (filters.result && filters.result !== 'all') {
      where.push('result = ?')
      params.push(filters.result)
    }
    if (filters.from) {
      where.push('created_at >= ?')
      params.push(startOfShanghaiDate(filters.from))
    }
    if (filters.to) {
      where.push('created_at < ?')
      params.push(startOfNextShanghaiDate(filters.to))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(
      db.prepare(`SELECT COUNT(*) AS count FROM audit_logs ${whereSql}`).get(...params).count,
    )
    const rows = db
      .prepare(`SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset)
    return paged(
      rows.map((row) => {
        let details = row.details
        try {
          details = JSON.parse(row.details)
        } catch {
          // Keep raw text when historical data is not valid JSON.
        }
        return {
          id: row.id,
          actorId: row.actor_id,
          actorName: row.actor_name,
          action: row.action,
          objectType: row.object_type,
          objectId: row.object_id,
          result: row.result,
          details,
          ip: row.ip,
          createdAt: row.created_at,
        }
      }),
      total,
      page,
      pageSize,
    )
  }

  function listAnnouncements(filters = {}) {
    const { page, pageSize, offset } = parsePaging(filters)
    const where = []
    const params = []
    if (filters.q) {
      const value = `%${escapeLike(filters.q)}%`
      where.push("(a.title LIKE ? ESCAPE '\\' OR a.content LIKE ? ESCAPE '\\')")
      params.push(value, value)
    }
    if (filters.status && filters.status !== 'all') {
      where.push('a.status = ?')
      params.push(enumValue(filters.status, 'status', '公告状态', ['draft', 'published', 'withdrawn']))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(
      db.prepare(`SELECT COUNT(*) AS count FROM announcements a ${whereSql}`).get(...params).count,
    )
    const rows = db
      .prepare(
        `SELECT a.*, u.display_name AS created_by_name FROM announcements a
         LEFT JOIN users u ON u.id = a.created_by
         ${whereSql} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset)
    return paged(rows.map(mapAnnouncement), total, page, pageSize)
  }

  function listPublishedAnnouncements() {
    return db
      .prepare(
        `SELECT a.*, u.display_name AS created_by_name FROM announcements a
         LEFT JOIN users u ON u.id = a.created_by
         WHERE a.status = 'published' ORDER BY a.published_at DESC, a.id DESC LIMIT 50`,
      )
      .all()
      .map(mapAnnouncement)
  }

  function createAnnouncement(input, actor, ip = '') {
    const title = requiredString(input.title, 'title', '标题', { max: 120 })
    const content = requiredString(input.content, 'content', '内容', { max: 5000 })
    const status = input.status === 'published' ? 'published' : 'draft'
    const now = clock().toISOString()
    const result = db
      .prepare(
        `INSERT INTO announcements (title, content, status, published_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(title, content, status, status === 'published' ? now : null, actor.id, now, now)
    writeAudit(db, {
      actor,
      action: 'announcement.create',
      objectType: 'announcement',
      objectId: Number(result.lastInsertRowid),
      details: { title, status },
      ip,
      createdAt: now,
    })
    return listAnnouncements({ page: 1, pageSize: 100 }).items.find(
      (item) => item.id === Number(result.lastInsertRowid),
    )
  }

  function updateAnnouncement(id, input, actor, ip = '') {
    const current = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id)
    if (!current) throw new AppError(ERR.NOT_FOUND, '公告不存在', 404)
    const title = input.title === undefined
      ? current.title
      : requiredString(input.title, 'title', '标题', { max: 120 })
    const content = input.content === undefined
      ? current.content
      : requiredString(input.content, 'content', '内容', { max: 5000 })
    const now = clock().toISOString()
    db.prepare('UPDATE announcements SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
      title,
      content,
      now,
      id,
    )
    writeAudit(db, {
      actor,
      action: 'announcement.update',
      objectType: 'announcement',
      objectId: id,
      details: { title },
      ip,
      createdAt: now,
    })
    return mapAnnouncement(db.prepare('SELECT * FROM announcements WHERE id = ?').get(id))
  }

  function setAnnouncementStatus(id, status, actor, ip = '') {
    const current = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id)
    if (!current) throw new AppError(ERR.NOT_FOUND, '公告不存在', 404)
    const next = enumValue(status, 'status', '公告状态', ['published', 'withdrawn'])
    const now = clock().toISOString()
    db.prepare(
      `UPDATE announcements SET status = ?, published_at = CASE
         WHEN ? = 'published' AND published_at IS NULL THEN ?
         ELSE published_at END, updated_at = ? WHERE id = ?`,
    ).run(next, next, now, now, id)
    writeAudit(db, {
      actor,
      action: next === 'published' ? 'announcement.publish' : 'announcement.withdraw',
      objectType: 'announcement',
      objectId: id,
      details: { title: current.title },
      ip,
      createdAt: now,
    })
    return mapAnnouncement(db.prepare('SELECT * FROM announcements WHERE id = ?').get(id))
  }

  return {
    listUsers,
    createUser,
    updateUser,
    resetPassword,
    listPermissions,
    listRoles,
    createRole,
    updateRole,
    setRolePermissions,
    deleteRole,
    getSettings,
    updateSettings,
    listAuditLogs,
    listAnnouncements,
    listPublishedAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    setAnnouncementStatus,
  }
}
