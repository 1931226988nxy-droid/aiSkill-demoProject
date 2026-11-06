/**
 * 文件职责：费用查询、登记、线下处理与豁免。
 */

import { AppError, ERR } from '../domain/errors.js'
import { writeAudit } from '../lib/audit.js'
import { paged, parsePaging } from '../lib/pagination.js'
import { transaction } from '../lib/transaction.js'
import {
  enumValue,
  escapeLike,
  integer,
  moneyToCents,
  requiredString,
} from '../lib/validation.js'

const FEE_SELECT = `SELECT f.*, rp.reader_no, rp.full_name AS reader_name,
    b.title AS book_title, l.due_at, l.returned_at
  FROM fees f
  JOIN reader_profiles rp ON rp.id = f.reader_id
  LEFT JOIN loans l ON l.id = f.loan_id
  LEFT JOIN books b ON b.id = l.book_id`

function mapFee(row) {
  return {
    id: row.id,
    readerId: row.reader_id,
    readerNo: row.reader_no,
    readerName: row.reader_name,
    loanId: row.loan_id,
    bookTitle: row.book_title || '',
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    type: row.type,
    amount: Number((row.amount_cents / 100).toFixed(2)),
    status: row.status,
    note: row.note,
    handledBy: row.handled_by,
    handledAt: row.handled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createFeeService({ db, clock = () => new Date(), notifications }) {
  function list(filters = {}, { readerId = null } = {}) {
    const { page, pageSize, offset } = parsePaging(filters)
    const where = []
    const params = []
    if (readerId) {
      where.push('f.reader_id = ?')
      params.push(readerId)
    }
    if (filters.status && filters.status !== 'all') {
      where.push('f.status = ?')
      params.push(enumValue(filters.status, 'status', '费用状态', ['pending', 'settled', 'waived']))
    }
    if (filters.type && filters.type !== 'all') {
      where.push('f.type = ?')
      params.push(enumValue(filters.type, 'type', '费用类型', ['overdue', 'lost', 'damage', 'manual']))
    }
    if (filters.readerId) {
      where.push('f.reader_id = ?')
      params.push(integer(filters.readerId, 'readerId', '读者', { min: 1 }))
    }
    if (filters.q) {
      const value = `%${escapeLike(filters.q)}%`
      where.push(
        `(rp.reader_no LIKE ? ESCAPE '\\' OR rp.full_name LIKE ? ESCAPE '\\'
          OR b.title LIKE ? ESCAPE '\\')`,
      )
      params.push(value, value, value)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM fees f
           JOIN reader_profiles rp ON rp.id = f.reader_id
           LEFT JOIN loans l ON l.id = f.loan_id LEFT JOIN books b ON b.id = l.book_id ${whereSql}`,
        )
        .get(...params).count,
    )
    const rows = db
      .prepare(`${FEE_SELECT} ${whereSql} ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset)
    return paged(rows.map(mapFee), total, page, pageSize)
  }

  function listMy(user, filters = {}) {
    if (!user.readerId) throw new AppError(ERR.FORBIDDEN, '当前账号没有读者档案', 403)
    return list(filters, { readerId: user.readerId })
  }

  function handle(id, { action, note }, actor, ip = '') {
    const row = db.prepare(`${FEE_SELECT} WHERE f.id = ?`).get(id)
    if (!row) throw new AppError(ERR.NOT_FOUND, '费用记录不存在', 404)
    // 费用只允许从 pending 流转一次，settled/waived 都是终态。
    if (row.status !== 'pending') {
      throw new AppError(ERR.FEE_ALREADY_HANDLED, '该费用已处理，不能重复操作', 409)
    }
    const next = action === 'settle' ? 'settled' : action === 'waive' ? 'waived' : null
    if (!next) {
      throw new AppError(ERR.VALIDATION, '处理动作必须是 settle 或 waive', 422)
    }
    const reason = requiredString(note, 'note', '处理说明', { min: 2, max: 300 })
    const now = clock().toISOString()
    return transaction(db, () => {
      // 条件 status='pending' 防止两个馆员同时处理同一笔费用。
      db.prepare(
        `UPDATE fees SET status = ?, note = ?, handled_by = ?, handled_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      ).run(next, reason, actor.id, now, now, id)
      notifications.forReader(row.reader_id, {
        type: 'fee_handled',
        title: next === 'settled' ? '费用已处理' : '费用已豁免',
        content: `金额 ${Number((row.amount_cents / 100).toFixed(2))} 元的${row.type === 'overdue' ? '逾期费用' : '费用'}已${next === 'settled' ? '完成线下处理' : '豁免'}。`,
        relatedType: 'fee',
        relatedId: id,
        dedupeKey: `fee-handled:${id}`,
      })
      writeAudit(db, {
        actor,
        action: next === 'settled' ? 'fee.settle' : 'fee.waive',
        objectType: 'fee',
        objectId: id,
        details: { readerNo: row.reader_no, amountCents: row.amount_cents, note: reason },
        ip,
        createdAt: now,
      })
      return mapFee(db.prepare(`${FEE_SELECT} WHERE f.id = ?`).get(id))
    })
  }

  function createManual(input, actor, ip = '') {
    // 手工费用只允许 lost/damage/manual，逾期费必须由借阅归还/定时任务自动计算。
    const readerId = integer(input.readerId, 'readerId', '读者', { min: 1 })
    const reader = db.prepare('SELECT * FROM reader_profiles WHERE id = ?').get(readerId)
    if (!reader) throw new AppError(ERR.NOT_FOUND, '读者不存在', 404)
    const type = enumValue(input.type, 'type', '费用类型', ['lost', 'damage', 'manual'])
    const amountCents = moneyToCents(input.amount, 'amount', '费用金额')
    if (amountCents <= 0) {
      throw new AppError(ERR.VALIDATION, '费用金额必须大于 0', 422, {
        fields: { amount: '费用金额必须大于 0' },
      })
    }
    const note = requiredString(input.note, 'note', '费用说明', { min: 2, max: 300 })
    const now = clock().toISOString()
    return transaction(db, () => {
      const result = db
        .prepare(
          `INSERT INTO fees (reader_id, loan_id, type, amount_cents, status, note, created_at, updated_at)
           VALUES (?, NULL, ?, ?, 'pending', ?, ?, ?)`,
        )
        .run(readerId, type, amountCents, note, now, now)
      const id = Number(result.lastInsertRowid)
      notifications.forReader(readerId, {
        type: 'fee_created',
        title: '新增待处理费用',
        content: `${note}，金额 ${Number((amountCents / 100).toFixed(2))} 元，请到馆处理。`,
        relatedType: 'fee',
        relatedId: id,
        dedupeKey: `fee-created:${id}`,
      })
      writeAudit(db, {
        actor,
        action: 'fee.create',
        objectType: 'fee',
        objectId: id,
        details: { readerNo: reader.reader_no, amountCents, type, note },
        ip,
        createdAt: now,
      })
      return mapFee(db.prepare(`${FEE_SELECT} WHERE f.id = ?`).get(id))
    })
  }

  return { list, listMy, handle, createManual }
}
