/**
 * 文件职责：读者档案、账号、启停和敏感信息详情。
 */

import { AppError, ERR } from '../domain/errors.js'
import { writeAudit } from '../lib/audit.js'
import { serializeReader } from '../lib/mask.js'
import { paged, parsePaging } from '../lib/pagination.js'
import { hashPassword } from '../lib/passwords.js'
import { endOfShanghaiDate } from '../lib/time.js'
import { isUniqueConstraint, transaction } from '../lib/transaction.js'
import {
  enumValue,
  escapeLike,
  optionalDateOnly,
  optionalEmail,
  optionalIdCard,
  optionalInteger,
  optionalPhone,
  optionalString,
  password,
  requiredString,
  username,
} from '../lib/validation.js'

const READER_SELECT = `SELECT rp.*, u.username, u.status AS user_status, u.display_name AS user_display_name
  FROM reader_profiles rp JOIN users u ON u.id = rp.user_id`

function nextReaderNo(db) {
  const year = new Date().getFullYear()
  const max = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM reader_profiles').get()
  let sequence = Number(max.maxId) + 1
  let readerNo = `R${year}${String(sequence).padStart(4, '0')}`
  while (db.prepare('SELECT 1 FROM reader_profiles WHERE reader_no = ?').get(readerNo)) {
    sequence += 1
    readerNo = `R${year}${String(sequence).padStart(4, '0')}`
  }
  return readerNo
}

export function createReaderService({ db, clock = () => new Date() }) {
  function statsFor(readerId) {
    const nowIso = clock().toISOString()
    return db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM loans WHERE reader_id = ? AND returned_at IS NULL) AS active_loans,
          (SELECT COUNT(*) FROM loans WHERE reader_id = ? AND returned_at IS NULL AND due_at < ?) AS overdue_loans,
          (SELECT COUNT(*) FROM reservations WHERE reader_id = ? AND status IN ('waiting','ready')) AS active_reservations,
          (SELECT COALESCE(SUM(amount_cents),0) FROM fees WHERE reader_id = ? AND status = 'pending') AS pending_fee_cents`,
      )
      .get(readerId, readerId, nowIso, readerId, readerId)
  }

  function decorate(row, revealSensitive) {
    const stats = statsFor(row.id)
    return {
      ...serializeReader(row, { revealSensitive }),
      username: row.username,
      userStatus: row.user_status,
      activeLoans: Number(stats.active_loans),
      overdueLoans: Number(stats.overdue_loans),
      activeReservations: Number(stats.active_reservations),
      pendingFees: Number((Number(stats.pending_fee_cents) / 100).toFixed(2)),
    }
  }

  function list(filters = {}) {
    const { page, pageSize, offset } = parsePaging(filters)
    const where = []
    const params = []
    if (filters.q) {
      const value = `%${escapeLike(filters.q)}%`
      where.push(
        `(rp.reader_no LIKE ? ESCAPE '\\' OR rp.full_name LIKE ? ESCAPE '\\'
          OR rp.phone LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')`,
      )
      params.push(value, value, value, value)
    }
    if (filters.status && filters.status !== 'all') {
      where.push('rp.status = ?')
      params.push(enumValue(filters.status, 'status', '读者状态', ['active', 'disabled']))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(
      db.prepare(`SELECT COUNT(*) AS count FROM reader_profiles rp JOIN users u ON u.id = rp.user_id ${whereSql}`).get(...params).count,
    )
    const rows = db
      .prepare(
        `${READER_SELECT} ${whereSql} ORDER BY rp.created_at DESC, rp.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset)
    return paged(
      rows.map((row) => decorate(row, false)),
      total,
      page,
      pageSize,
    )
  }

  function getById(id) {
    const row = db.prepare(`${READER_SELECT} WHERE rp.id = ?`).get(id)
    if (!row) throw new AppError(ERR.NOT_FOUND, '读者不存在', 404)
    return decorate(row, true)
  }

  function create(input, actor, ip = '') {
    const usernameValue = username(input.username)
    const passwordValue = password(input.password)
    const fullName = requiredString(input.fullName, 'fullName', '姓名', { max: 50 })
    const phone = optionalPhone(input.phone)
    const email = optionalEmail(input.email)
    const idCard = optionalIdCard(input.idCard)
    if (!phone && !email) {
      throw new AppError(ERR.VALIDATION, '请至少填写手机号或邮箱', 422, {
        fields: { phone: '请至少填写手机号或邮箱' },
      })
    }
    const maxBorrowOverride = optionalInteger(input.maxBorrowOverride, 'maxBorrowOverride', '借阅上限', {
      min: 1,
      max: 100,
    })
    const expiresDate = optionalDateOnly(input.expiresAt, 'expiresAt', '有效期')
    const expiresAt = expiresDate ? endOfShanghaiDate(expiresDate) : null
    const now = clock().toISOString()
    try {
      // 读者账号必须同时写 users、user_roles、reader_profiles，缺一不可。
      return transaction(db, () => {
        const role = db.prepare("SELECT id FROM roles WHERE code = 'reader'").get()
        const userResult = db
          .prepare(
            `INSERT INTO users (username, password_hash, display_name, role_id, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'active', ?, ?)`,
          )
          .run(usernameValue, hashPassword(passwordValue), fullName, role.id, now, now)
        const userId = Number(userResult.lastInsertRowid)
        db.prepare('INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)').run(
          userId,
          role.id,
          now,
        )
        const readerNo = nextReaderNo(db)
        const profileResult = db
          .prepare(
            `INSERT INTO reader_profiles
              (user_id, reader_no, full_name, id_card, phone, email, status, max_borrow_override,
               expires_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
          )
          .run(
            userId,
            readerNo,
            fullName,
            idCard || null,
            phone || null,
            email || null,
            maxBorrowOverride,
            expiresAt,
            now,
            now,
          )
        writeAudit(db, {
          actor,
          action: 'reader.create',
          objectType: 'reader',
          objectId: Number(profileResult.lastInsertRowid),
          details: { readerNo, username: usernameValue },
          ip,
          createdAt: now,
        })
        return getById(Number(profileResult.lastInsertRowid))
      })
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new AppError(ERR.CONFLICT, '用户名、身份证号或读者编号已存在', 409)
      }
      throw error
    }
  }

  function update(id, input, actor, ip = '') {
    const current = getById(id)
    const fullName = input.fullName === undefined
      ? current.fullName
      : requiredString(input.fullName, 'fullName', '姓名', { max: 50 })
    const phone = optionalPhone(input.phone ?? current.phone)
    const email = optionalEmail(input.email ?? current.email)
    const idCard = optionalIdCard(input.idCard ?? current.idCard)
    if (!phone && !email) {
      throw new AppError(ERR.VALIDATION, '请至少填写手机号或邮箱', 422, {
        fields: { phone: '请至少填写手机号或邮箱' },
      })
    }
    const maxBorrowOverride = optionalInteger(
      input.maxBorrowOverride === undefined ? current.maxBorrowOverride : input.maxBorrowOverride,
      'maxBorrowOverride',
      '借阅上限',
      { min: 1, max: 100 },
    )
    let expiresAt = current.expiresAt
    if (input.expiresAt !== undefined) {
      const date = optionalDateOnly(input.expiresAt, 'expiresAt', '有效期')
      expiresAt = date ? endOfShanghaiDate(date) : null
    }
    const now = clock().toISOString()
    try {
      transaction(db, () => {
        db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(
          fullName,
          now,
          current.userId,
        )
        db.prepare(
          `UPDATE reader_profiles SET full_name = ?, phone = ?, email = ?, id_card = ?,
             max_borrow_override = ?, expires_at = ?, updated_at = ? WHERE id = ?`,
        ).run(
          fullName,
          phone || null,
          email || null,
          idCard || null,
          maxBorrowOverride,
          expiresAt,
          now,
          id,
        )
        writeAudit(db, {
          actor,
          action: 'reader.update',
          objectType: 'reader',
          objectId: id,
          details: { readerNo: current.readerNo },
          ip,
          createdAt: now,
        })
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '身份证号已存在', 409)
      throw error
    }
    return getById(id)
  }

  function setStatus(id, status, reason, actor, ip = '') {
    const next = enumValue(status, 'status', '读者状态', ['active', 'disabled'])
    const current = getById(id)
    const text = requiredString(reason, 'reason', '原因', { min: 2, max: 300 })
    const now = clock().toISOString()
    transaction(db, () => {
      db.prepare('UPDATE reader_profiles SET status = ?, updated_at = ? WHERE id = ?').run(
        next,
        now,
        id,
      )
      if (next === 'disabled') {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(current.userId)
      }
      // 只有纯读者账号才同步停用登录账号；馆员+读者双身份不能因读者证停用而失去馆员登录。
      const staffRoles = db
        .prepare(
          `SELECT COUNT(*) AS count FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = ? AND r.code != 'reader'`,
        )
        .get(current.userId)
      if (Number(staffRoles.count) === 0) {
        db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(
          next,
          now,
          current.userId,
        )
      }
      writeAudit(db, {
        actor,
        action: 'reader.status_change',
        objectType: 'reader',
        objectId: id,
        details: { readerNo: current.readerNo, from: current.status, to: next, reason: text },
        ip,
        createdAt: now,
      })
    })
    return getById(id)
  }

  return { list, getById, create, update, setStatus }
}
