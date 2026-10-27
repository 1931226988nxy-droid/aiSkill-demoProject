import { AppError, ERR } from '../domain/errors.js'
import { SESSION_MAX_AGE_SECONDS } from '../domain/constants.js'
import {
  createReaderNumber,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../lib/passwords.js'
import {
  optionalEmail,
  optionalIdCard,
  optionalPhone,
  optionalString,
  password,
  requiredString,
  username,
} from '../lib/validation.js'
import { transaction, isUniqueConstraint } from '../lib/transaction.js'
import { writeAudit } from '../lib/audit.js'

const USER_QUERY = `SELECT u.*, r.code AS role_code, r.name AS role_name,
    rp.id AS reader_id, rp.reader_no, rp.phone, rp.email, rp.id_card, rp.status AS reader_status
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN reader_profiles rp ON rp.user_id = u.id`

function rolesForUser(db, userId) {
  return db
    .prepare(
      `SELECT r.* FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? ORDER BY r.built_in DESC, r.id`,
    )
    .all(userId)
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      builtIn: Boolean(row.built_in),
    }))
}

function permissionsForRole(db, role) {
  if (role.code === 'admin') {
    return db
      .prepare("SELECT code FROM permissions WHERE status = 'active' ORDER BY code")
      .all()
      .map((row) => row.code)
  }
  return db
    .prepare(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ? AND p.status = 'active' ORDER BY p.code`,
    )
    .all(role.id)
    .map((row) => row.code)
}

export function createAuthService({
  db,
  clock = () => new Date(),
  settings,
  notifications = null,
}) {
  function bundle(row, activeRoleId = null) {
    const roles = rolesForUser(db, row.id)
    const activeRole =
      roles.find((role) => role.id === activeRoleId) ||
      roles.find((role) => role.id === row.role_id) ||
      roles[0]
    if (!activeRole) {
      throw new AppError(ERR.FORBIDDEN, '账号尚未分配角色，请联系管理员', 403)
    }
    const permissions = permissionsForRole(db, activeRole)
    return {
      user: {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        status: row.status,
        role: {
          id: activeRole.id,
          code: activeRole.code,
          name: activeRole.name,
        },
        primaryRole: {
          id: row.role_id,
          code: row.role_code,
          name: row.role_name,
        },
        roles,
        readerId: row.reader_id || null,
        readerNo: row.reader_no || null,
        reader: row.reader_id
          ? {
              id: row.reader_id,
              readerNo: row.reader_no,
              status: row.reader_status,
              phone: row.phone || '',
              email: row.email || '',
              idCard: row.id_card || '',
            }
          : null,
        lastLoginAt: row.last_login_at,
      },
      permissions,
      activeRole,
    }
  }

  function getBundle(userId, activeRoleId = null) {
    const row = db.prepare(`${USER_QUERY} WHERE u.id = ?`).get(userId)
    if (!row) throw new AppError(ERR.NOT_FOUND, '用户不存在', 404)
    return bundle(row, activeRoleId)
  }

  function createSession(userId, activeRoleId) {
    const token = createSessionToken()
    const now = clock()
    const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()
    db.prepare(
      `INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at, active_role_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      hashSessionToken(token),
      expires,
      now.toISOString(),
      now.toISOString(),
      activeRoleId,
    )
    return token
  }

  function resolveSession(token) {
    if (!token) return null
    const row = db
      .prepare(`SELECT * FROM sessions WHERE token_hash = ?`)
      .get(hashSessionToken(token))
    if (!row) return null
    if (new Date(row.expires_at).getTime() <= clock().getTime()) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id)
      return null
    }
    const user = db.prepare(`${USER_QUERY} WHERE u.id = ?`).get(row.user_id)
    if (!user || user.status !== 'active') return null
    const result = bundle(user, row.active_role_id)
    if (result.user.role.code === 'reader' && result.user.reader?.status !== 'active') {
      const fallback = result.user.roles.find((role) => role.code !== 'reader')
      if (!fallback) return null
      db.prepare('UPDATE sessions SET active_role_id = ? WHERE id = ?').run(fallback.id, row.id)
      return { ...bundle(user, fallback.id), sessionId: row.id }
    }
    if (result.user.role.id !== row.active_role_id) {
      db.prepare('UPDATE sessions SET active_role_id = ? WHERE id = ?').run(
        result.user.role.id,
        row.id,
      )
    }
    return { ...result, sessionId: row.id }
  }

  function login({ username: rawUsername, password: rawPassword }, { ip = '' } = {}) {
    const name = requiredString(rawUsername, 'username', '用户名', { min: 3, max: 32 })
    const pass = requiredString(rawPassword, 'password', '密码', { min: 1, max: 72 })
    const row = db.prepare(`${USER_QUERY} WHERE u.username = ?`).get(name)
    if (!row || !verifyPassword(pass, row.password_hash)) {
      writeAudit(db, {
        action: 'auth.login',
        objectType: 'user',
        objectId: name,
        result: 'failure',
        details: { reason: 'invalid_credentials' },
        ip,
        createdAt: clock().toISOString(),
      })
      throw new AppError(ERR.INVALID_CREDENTIALS, '用户名或密码错误', 401)
    }
    if (row.status !== 'active') {
      throw new AppError(ERR.ACCOUNT_DISABLED, '账号已被停用，请联系管理员', 403)
    }
    const primaryBundle = bundle(row, row.role_id)
    let activeBundle = primaryBundle
    if (
      primaryBundle.user.role.code === 'reader' &&
      primaryBundle.user.reader?.status !== 'active'
    ) {
      const fallback = primaryBundle.user.roles.find((role) => role.code !== 'reader')
      if (!fallback) {
        throw new AppError(ERR.READER_DISABLED, '读者证已停用，请联系馆员', 403)
      }
      activeBundle = getBundle(row.id, fallback.id)
    }
    const token = createSession(row.id, activeBundle.user.role.id)
    const now = clock().toISOString()
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, row.id)
    writeAudit(db, {
      actor: { id: row.id, displayName: row.display_name, username: row.username },
      action: 'auth.login',
      objectType: 'user',
      objectId: row.id,
      details: { activeRole: activeBundle.user.role.code },
      ip,
      createdAt: now,
    })
    return { token, ...activeBundle }
  }

  function register(input, { ip = '' } = {}) {
    if (!settings.get('allow_registration')) {
      throw new AppError(ERR.FORBIDDEN, '当前未开放读者自助注册，请联系馆员', 403)
    }
    const name = username(input.username)
    const pass = password(input.password)
    const displayName = requiredString(input.displayName, 'displayName', '姓名', { max: 50 })
    const phone = optionalPhone(input.phone)
    const email = optionalEmail(input.email)
    const idCard = optionalIdCard(input.idCard)
    if (!phone && !email) {
      throw new AppError(ERR.VALIDATION, '请至少填写手机号或邮箱', 422, {
        fields: { phone: '请至少填写手机号或邮箱' },
      })
    }
    try {
      return transaction(db, () => {
        const role = db.prepare("SELECT id FROM roles WHERE code = 'reader'").get()
        if (!role) throw new AppError(ERR.CONFLICT, '读者角色未初始化', 500)
        const now = clock().toISOString()
        const userResult = db
          .prepare(
            `INSERT INTO users (username, password_hash, display_name, role_id, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'active', ?, ?)`,
          )
          .run(name, hashPassword(pass), displayName, role.id, now, now)
        const userId = Number(userResult.lastInsertRowid)
        db.prepare('INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)').run(
          userId,
          role.id,
          now,
        )
        const maxProfile = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM reader_profiles').get()
        let sequence = Number(maxProfile.maxId) + 1
        let readerNo = createReaderNumber(sequence)
        while (db.prepare('SELECT 1 FROM reader_profiles WHERE reader_no = ?').get(readerNo)) {
          sequence += 1
          readerNo = createReaderNumber(sequence)
        }
        db.prepare(
          `INSERT INTO reader_profiles
            (user_id, reader_no, full_name, id_card, phone, email, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        ).run(userId, readerNo, displayName, idCard || null, phone || null, email || null, now, now)
        writeAudit(db, {
          actor: { id: userId, displayName, username: name },
          action: 'auth.register',
          objectType: 'reader',
          objectId: userId,
          details: { readerNo },
          ip,
          createdAt: now,
        })
        const token = createSession(userId, role.id)
        if (notifications) {
          notifications.send({
            userId,
            type: 'welcome',
            title: '欢迎使用图书馆管理系统',
            content: `读者证号 ${readerNo}，您可以在线检索馆藏、预约图书并查看借阅记录。`,
          })
        }
        return { token, ...getBundle(userId, role.id) }
      })
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new AppError(ERR.CONFLICT, '用户名、身份证号或读者证号已存在', 409)
      }
      throw error
    }
  }

  function updateOwnProfile(userId, input, activeRoleId = null) {
    const row = db.prepare(`${USER_QUERY} WHERE u.id = ?`).get(userId)
    if (!row) throw new AppError(ERR.NOT_FOUND, '用户不存在', 404)
    const displayName = optionalString(input.displayName, 'displayName', '姓名', { max: 50 }) || null
    const phone = optionalPhone(input.phone === undefined ? row.phone : input.phone)
    const email = optionalEmail(input.email === undefined ? row.email : input.email)
    const idCard = optionalIdCard(input.idCard === undefined ? row.id_card : input.idCard)
    try {
      transaction(db, () => {
        const now = clock().toISOString()
        if (displayName) {
          db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(
            displayName,
            now,
            userId,
          )
        }
        if (row.reader_id) {
          db.prepare(
            `UPDATE reader_profiles SET full_name = COALESCE(?, full_name), phone = ?,
              email = ?, id_card = ?, updated_at = ? WHERE id = ?`,
          ).run(
            displayName,
            phone || null,
            email || null,
            idCard || null,
            now,
            row.reader_id,
          )
        }
        writeAudit(db, {
          actor: { id: userId, displayName: displayName || row.display_name, username: row.username },
          action: 'profile.update',
          objectType: 'user',
          objectId: userId,
          ip: '',
          createdAt: now,
        })
      })
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new AppError(ERR.CONFLICT, '身份证号已被其他读者使用', 409)
      }
      throw error
    }
    return getBundle(userId, activeRoleId)
  }

  function switchRole(userId, roleCode, sessionId, { ip = '' } = {}) {
    const role = rolesForUser(db, userId).find((item) => item.code === roleCode)
    if (!role) {
      throw new AppError(ERR.FORBIDDEN, '账号没有该角色，不能切换', 403)
    }
    if (role.code === 'reader') {
      const profile = db
        .prepare('SELECT status FROM reader_profiles WHERE user_id = ?')
        .get(userId)
      if (!profile || profile.status !== 'active') {
        throw new AppError(ERR.READER_DISABLED, '读者档案不存在或已停用，不能切换到读者角色', 403)
      }
    }
    const now = clock().toISOString()
    const user = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(userId)
    db.prepare('UPDATE sessions SET active_role_id = ? WHERE id = ?').run(role.id, sessionId)
    writeAudit(db, {
      actor: { id: userId, displayName: user?.display_name, username: user?.username },
      action: 'auth.switch_role',
      objectType: 'user',
      objectId: userId,
      details: { roleCode },
      ip,
      createdAt: now,
    })
    return { ...getBundle(userId, role.id), activeRole: role }
  }

  function changePassword(userId, { oldPassword, newPassword }, currentSessionId = null) {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!row) throw new AppError(ERR.NOT_FOUND, '用户不存在', 404)
    if (!verifyPassword(String(oldPassword || ''), row.password_hash)) {
      throw new AppError(ERR.INVALID_CREDENTIALS, '原密码不正确', 400)
    }
    const nextPassword = password(newPassword)
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(nextPassword),
      clock().toISOString(),
      userId,
    )
    if (currentSessionId) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, currentSessionId)
    } else {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    }
    return { changed: true }
  }

  function logout(token, { ip = '' } = {}) {
    if (!token) return
    const row = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get(hashSessionToken(token))
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token))
    if (row) {
      writeAudit(db, {
        action: 'auth.logout',
        objectType: 'user',
        objectId: row.user_id,
        ip,
        createdAt: clock().toISOString(),
      })
    }
  }

  return {
    login,
    register,
    resolveSession,
    getBundle,
    updateOwnProfile,
    switchRole,
    changePassword,
    logout,
    rolesForUser,
    permissionsForRole,
  }
}
