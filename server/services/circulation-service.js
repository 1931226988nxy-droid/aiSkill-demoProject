/**
 * 文件职责：借书、还书、续借、遗失和借阅查询核心事务。
 */

import { AppError, ERR } from '../domain/errors.js'
import { writeAudit } from '../lib/audit.js'
import { serializeReader } from '../lib/mask.js'
import { paged, parsePaging } from '../lib/pagination.js'
import {
  endOfShanghaiDayAfter,
  overdueDays,
  startOfNextShanghaiDate,
  startOfShanghaiDate,
  toShanghaiDateTimeString,
} from '../lib/time.js'
import { isUniqueConstraint, transaction } from '../lib/transaction.js'
import {
  enumValue,
  escapeLike,
  integer,
  moneyToCents,
  optionalString,
  requiredString,
} from '../lib/validation.js'
import { promoteNextReservation } from './reservation-queue.js'

const LOAN_SELECT = `SELECT l.*, b.title AS book_title, b.isbn, b.cover_url,
    cp.barcode, cp.location, cp.shelf,
    rp.reader_no, rp.full_name AS reader_name, rp.user_id AS reader_user_id,
    (SELECT COALESCE(SUM(f.amount_cents), 0) FROM fees f
      WHERE f.loan_id = l.id AND f.type = 'overdue')
      AS overdue_fee_cents
  FROM loans l
  JOIN books b ON b.id = l.book_id
  JOIN copies cp ON cp.id = l.copy_id
  JOIN reader_profiles rp ON rp.id = l.reader_id`

function mapLoan(row, now = new Date()) {
  const active = !row.returned_at
  const days = active ? overdueDays(row.due_at, now) : 0
  return {
    id: row.id,
    copyId: row.copy_id,
    bookId: row.book_id,
    readerId: row.reader_id,
    bookTitle: row.book_title,
    isbn: row.isbn,
    coverUrl: row.cover_url,
    barcode: row.barcode,
    location: row.location,
    shelf: row.shelf,
    readerNo: row.reader_no,
    readerName: row.reader_name,
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    renewals: row.renewals,
    status: row.status,
    overdue: active && days > 0,
    overdueDays: days,
    overdueFee: Number(((row.overdue_fee_cents || 0) / 100).toFixed(2)),
    returnCondition: row.return_condition,
    createdAt: row.created_at,
  }
}

export function createCirculationService({
  db,
  clock = () => new Date(),
  settings,
  notifications,
}) {
  function getReaderByNo(readerNo) {
    const row = db
      .prepare(
        `SELECT rp.*, u.username, u.status AS user_status, u.display_name AS user_display_name
         FROM reader_profiles rp JOIN users u ON u.id = rp.user_id
         WHERE rp.reader_no = ?`,
      )
      .get(String(readerNo || '').trim())
    if (!row) return null
    const nowIso = clock().toISOString()
    const stats = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM loans WHERE reader_id = ? AND returned_at IS NULL) AS active_loans,
          (SELECT COUNT(*) FROM loans WHERE reader_id = ? AND returned_at IS NULL AND due_at < ?) AS overdue_loans,
          (SELECT COUNT(*) FROM reservations WHERE reader_id = ? AND status IN ('waiting','ready')) AS active_reservations,
          (SELECT COALESCE(SUM(amount_cents),0) FROM fees WHERE reader_id = ? AND status = 'pending') AS pending_fee_cents`,
      )
      .get(row.id, row.id, nowIso, row.id, row.id)
    return {
      ...serializeReader(row, { revealSensitive: true }),
      userId: row.user_id,
      username: row.username,
      userStatus: row.user_status,
      activeLoans: Number(stats.active_loans),
      overdueLoans: Number(stats.overdue_loans),
      activeReservations: Number(stats.active_reservations),
      pendingFees: Number((Number(stats.pending_fee_cents) / 100).toFixed(2)),
    }
  }

  function getReaderById(readerId) {
    const row = db.prepare('SELECT reader_no FROM reader_profiles WHERE id = ?').get(readerId)
    return row ? getReaderByNo(row.reader_no) : null
  }

  function evaluateBorrow({ readerNo, barcode }, now) {
    // 借书前统一做“读者资格 → 借阅限额 → 副本状态 → 预约优先权”四层校验。
    // previewBorrow 与 borrow 共用此函数，保证预览和实际借出规则一致。
    const reader = getReaderByNo(readerNo)
    if (!reader) throw new AppError(ERR.NOT_FOUND, '读者不存在，请核对读者编号', 404)
    if (reader.status !== 'active' || reader.userStatus !== 'active') {
      throw new AppError(ERR.READER_DISABLED, '读者证或账号已停用', 403)
    }
    if (reader.expiresAt && new Date(reader.expiresAt).getTime() < now.getTime()) {
      throw new AppError(ERR.READER_EXPIRED, '读者证已过期', 403)
    }
    if (reader.overdueLoans > 0) {
      throw new AppError(ERR.OVERDUE_BLOCK, `读者有 ${reader.overdueLoans} 笔逾期借阅，暂不能借书`, 409, {
        overdueLoans: reader.overdueLoans,
      })
    }
    // 未缴费用和逾期一样属于借阅阻断条件，必须线下结清或豁免后才能继续借书。
    if (reader.pendingFees > 0) {
      throw new AppError(ERR.PENDING_FEES_BLOCK, '读者有未缴费用，请先处理后再借书', 409, {
        pendingFees: reader.pendingFees,
      })
    }
    const maxBorrow = reader.maxBorrowOverride || settings.get('max_borrow')
    if (reader.activeLoans >= maxBorrow) {
      throw new AppError(ERR.BORROW_LIMIT, `已达到借阅上限（${maxBorrow} 册）`, 409, {
        maxBorrow,
      })
    }
    const copyRow = db
      .prepare(
        `SELECT cp.*, b.title AS book_title, b.isbn, b.status AS book_status
         FROM copies cp JOIN books b ON b.id = cp.book_id
         WHERE cp.barcode = ? COLLATE NOCASE`,
      )
      .get(String(barcode || '').trim().toUpperCase())
    if (!copyRow) throw new AppError(ERR.NOT_FOUND, '未找到该条码对应的馆藏副本', 404)
    if (copyRow.book_status !== 'active') {
      throw new AppError(ERR.BOOK_OFF_SHELF, '该图书已下架，不能借阅', 409)
    }
    const existing = db
      .prepare(
        'SELECT id FROM loans WHERE reader_id = ? AND book_id = ? AND returned_at IS NULL',
      )
      .get(reader.id, copyRow.book_id)
    if (existing) {
      throw new AppError(ERR.ALREADY_BORROWED_BOOK, '该读者已借阅这本书，请先归还', 409)
    }
    let reservation = null
    if (copyRow.status === 'reserved') {
      // 预约保留副本只能由对应读者在取书期限内借出。
      reservation = db
        .prepare(
          `SELECT * FROM reservations WHERE copy_id = ? AND book_id = ?
           AND status = 'ready' AND reader_id = ? AND pickup_expires_at >= ?`,
        )
        .get(copyRow.id, copyRow.book_id, reader.id, now.toISOString())
      if (!reservation) {
        throw new AppError(ERR.COPY_RESERVED, '该副本已为其他预约读者保留', 409)
      }
    } else if (copyRow.status === 'available') {
      // 只要存在 waiting/ready 预约，可借副本也不能绕过队列直接借给普通读者。
      const queue = db
        .prepare(
          `SELECT id, reader_id FROM reservations
           WHERE book_id = ? AND status IN ('waiting','ready') ORDER BY created_at LIMIT 1`,
        )
        .get(copyRow.book_id)
      if (queue) {
        throw new AppError(ERR.COPY_RESERVED, '该图书有预约队列，当前副本应优先满足预约读者', 409)
      }
    } else {
      throw new AppError(
        ERR.COPY_NOT_AVAILABLE,
        `副本当前状态不可借（${copyRow.status}）`,
        409,
        { status: copyRow.status },
      )
    }
    return {
      reader,
      copy: copyRow,
      reservation,
      dueAt: endOfShanghaiDayAfter(now, settings.get('loan_days')),
      maxBorrow,
    }
  }

  function previewBorrow(input) {
    const now = clock()
    const result = evaluateBorrow(input, now)
    return {
      reader: result.reader,
      book: {
        id: result.copy.book_id,
        title: result.copy.book_title,
        isbn: result.copy.isbn,
      },
      copy: {
        id: result.copy.id,
        barcode: result.copy.barcode,
        location: result.copy.location,
        shelf: result.copy.shelf,
        status: result.copy.status,
      },
      dueAt: result.dueAt,
      loanDays: settings.get('loan_days'),
      maxBorrow: result.maxBorrow,
    }
  }

  function borrow(input, actor, ip = '') {
    const now = clock()
    try {
      // 事务内重跑 evaluateBorrow：预览后副本/预约可能变化，不能只依赖前端预览结果。
      return transaction(db, () => {
        const result = evaluateBorrow(input, now)
        const nowIso = now.toISOString()
        // 条件更新是并发兜底：只有仍处于预览时的副本状态才能被借出。
        const updated = db
          .prepare("UPDATE copies SET status = 'borrowed', updated_at = ? WHERE id = ? AND status = ?")
          .run(nowIso, result.copy.id, result.copy.status)
        if (!updated.changes) {
          throw new AppError(ERR.COPY_NOT_AVAILABLE, '副本状态已变化，请重新操作', 409)
        }
        const loanResult = db
          .prepare(
            `INSERT INTO loans
              (copy_id, book_id, reader_id, borrowed_by, borrowed_at, due_at, renewals, status,
               return_condition, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, 'active', '', ?, ?)`,
          )
          .run(
            result.copy.id,
            result.copy.book_id,
            result.reader.id,
            actor.id,
            nowIso,
            result.dueAt,
            nowIso,
            nowIso,
          )
        const loanId = Number(loanResult.lastInsertRowid)
        // 完成预约借出后关闭对应 ready 预约，避免队列残留。
        if (result.reservation) {
          db.prepare(
            `UPDATE reservations SET status = 'fulfilled', copy_id = ?, closed_at = ?
             WHERE id = ? AND status = 'ready'`,
          ).run(result.copy.id, nowIso, result.reservation.id)
        }
        db.prepare(
          `INSERT INTO copy_status_logs (copy_id, from_status, to_status, reason, operator_id, created_at)
           VALUES (?, ?, 'borrowed', ?, ?, ?)`,
        ).run(
          result.copy.id,
          result.copy.status,
          `借阅至读者 ${result.reader.readerNo}`,
          actor.id,
          nowIso,
        )
        notifications.forReader(result.reader.id, {
          type: 'loan_borrowed',
          title: '借阅成功',
          content: `《${result.copy.book_title}》已借出，应还日期 ${toShanghaiDateTimeString(result.dueAt)}。`,
          relatedType: 'loan',
          relatedId: loanId,
          dedupeKey: `loan-borrowed:${loanId}`,
        })
        writeAudit(db, {
          actor,
          action: 'loan.borrow',
          objectType: 'loan',
          objectId: loanId,
          details: {
            readerNo: result.reader.readerNo,
            barcode: result.copy.barcode,
            dueAt: result.dueAt,
          },
          ip,
          createdAt: nowIso,
        })
        return mapLoan(db.prepare(`${LOAN_SELECT} WHERE l.id = ?`).get(loanId), now)
      })
    } catch (error) {
      // 唯一索引冲突通常意味着并发请求已抢先借出同一副本或已有同书在借。
      if (isUniqueConstraint(error)) {
        throw new AppError(ERR.COPY_NOT_AVAILABLE, '该副本已被借出或有重复借阅记录', 409)
      }
      throw error
    }
  }

  function findActiveLoanByBarcode(barcode) {
    return db
      .prepare(`${LOAN_SELECT} WHERE cp.barcode = ? COLLATE NOCASE AND l.returned_at IS NULL`)
      .get(String(barcode || '').trim().toUpperCase())
  }

  function previewReturn({ barcode }) {
    const now = clock()
    const row = findActiveLoanByBarcode(barcode)
    if (!row) throw new AppError(ERR.LOAN_NOT_FOUND, '未找到该条码对应的在借记录', 404)
    const days = overdueDays(row.due_at, now)
    const fine = days * settings.get('fine_per_day_cents')
    return {
      loan: mapLoan(row, now),
      overdueDays: days,
      fine: Number((fine / 100).toFixed(2)),
      finePerDay: Number((settings.get('fine_per_day_cents') / 100).toFixed(2)),
    }
  }

  function syncOverdueFee(loan, now) {
    // 逾期费用按“当前应收总额 - 已结算/已豁免金额”计算，已结清后继续逾期只会产生差额补充费用。
    const days = overdueDays(loan.due_at, now)
    const rate = settings.get('fine_per_day_cents')
    if (days <= 0 || rate <= 0) return null
    const amount = days * rate
    const nowIso = now.toISOString()
    const fees = db
      .prepare("SELECT * FROM fees WHERE loan_id = ? AND type = 'overdue' ORDER BY id")
      .all(loan.id)
    const settledAmount = fees
      .filter((fee) => fee.status !== 'pending')
      .reduce((total, fee) => total + Number(fee.amount_cents), 0)
    const remainingAmount = Math.max(0, amount - settledAmount)
    const pending = fees.find((fee) => fee.status === 'pending')
    // 同一借阅最多保留一条 pending 逾期费；金额变化时原位更新，不重复插入。
    if (pending) {
      if (Number(pending.amount_cents) !== remainingAmount) {
        db.prepare('UPDATE fees SET amount_cents = ?, updated_at = ? WHERE id = ?').run(
          remainingAmount,
          nowIso,
          pending.id,
        )
      }
      return db.prepare('SELECT * FROM fees WHERE id = ?').get(pending.id)
    }
    if (remainingAmount === 0) return null
    const result = db
      .prepare(
        `INSERT INTO fees (reader_id, loan_id, type, amount_cents, status, note, created_at, updated_at)
         VALUES (?, ?, 'overdue', ?, 'pending', ?, ?, ?)`,
      )
      .run(
        loan.reader_id,
        loan.id,
        remainingAmount,
        `逾期 ${days} 天，按每天 ${Number((rate / 100).toFixed(2))} 元自动计算`,
        nowIso,
        nowIso,
      )
    return db.prepare('SELECT * FROM fees WHERE id = ?').get(Number(result.lastInsertRowid))
  }

  function returnCopy({ barcode, condition = '' }, actor, ip = '') {
    const now = clock()
    const nowIso = now.toISOString()
    // 还书在单个事务内完成：结清逾期费、关闭借阅、顺延预约或释放副本。
    return transaction(db, () => {
      const row = findActiveLoanByBarcode(barcode)
      if (!row) throw new AppError(ERR.LOAN_NOT_FOUND, '未找到该条码对应的在借记录', 404)
      const fee = syncOverdueFee(row, now)
      const updated = db
        .prepare(
          `UPDATE loans SET returned_at = ?, status = 'returned', returned_by = ?,
             return_condition = ?, updated_at = ? WHERE id = ? AND returned_at IS NULL`,
        )
        .run(nowIso, actor.id, optionalString(condition, 'condition', '归还状态', { max: 300 }), nowIso, row.id)
      if (!updated.changes) throw new AppError(ERR.CONFLICT, '该借阅已归还，请刷新后重试', 409)
      // 有等待队列时副本直接转为 reserved 并生成 ready 预约；否则才恢复 available。
      const nextReservation = promoteNextReservation({
        db,
        bookId: row.book_id,
        copyId: row.copy_id,
        now,
        settings,
        notifications,
      })
      if (!nextReservation) {
        db.prepare("UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?").run(
          nowIso,
          row.copy_id,
        )
      }
      db.prepare(
        `INSERT INTO copy_status_logs (copy_id, from_status, to_status, reason, operator_id, created_at)
         VALUES (?, 'borrowed', ?, ?, ?, ?)`,
      ).run(
        row.copy_id,
        nextReservation ? 'reserved' : 'available',
        `归还：${row.reader_no}`,
        actor.id,
        nowIso,
      )
      const fineText = fee
        ? `逾期费用 ${Number((fee.amount_cents / 100).toFixed(2))} 元已生成。`
        : ''
      notifications.forReader(row.reader_id, {
        type: 'loan_returned',
        title: '归还成功',
        content: `《${row.book_title}》已归还。${fineText}`,
        relatedType: 'loan',
        relatedId: row.id,
        dedupeKey: `loan-returned:${row.id}`,
      })
      writeAudit(db, {
        actor,
        action: 'loan.return',
        objectType: 'loan',
        objectId: row.id,
        details: {
          barcode: row.barcode,
          readerNo: row.reader_no,
          overdueDays: overdueDays(row.due_at, now),
          fineCents: fee?.amount_cents || 0,
          nextReservationId: nextReservation?.id || null,
        },
        ip,
        createdAt: nowIso,
      })
      return {
        loan: mapLoan(db.prepare(`${LOAN_SELECT} WHERE l.id = ?`).get(row.id), now),
        fee: fee ? { id: fee.id, amount: Number((fee.amount_cents / 100).toFixed(2)) } : null,
        nextReservation: nextReservation
          ? {
              id: nextReservation.id,
              bookId: nextReservation.book_id,
              readerId: nextReservation.reader_id,
              readerNo: nextReservation.reader_no,
              readerName: nextReservation.reader_name,
              bookTitle: nextReservation.book_title,
              copyId: nextReservation.copy_id,
              copyBarcode: nextReservation.copy_barcode,
              status: nextReservation.status,
              pickupExpiresAt: nextReservation.pickup_expires_at,
            }
          : null,
      }
    })
  }

  function renew(loanId, actor, { allowManage = false, ip = '' } = {}) {
    const now = clock()
    const nowIso = now.toISOString()
    const row = db.prepare(`${LOAN_SELECT} WHERE l.id = ?`).get(loanId)
    if (!row) throw new AppError(ERR.NOT_FOUND, '借阅记录不存在', 404)
    if (!allowManage && row.reader_user_id !== actor.id) {
      throw new AppError(ERR.FORBIDDEN, '不能操作他人的借阅记录', 403)
    }
    if (row.returned_at) throw new AppError(ERR.CONFLICT, '该借阅已归还，不能续借', 409)
    // 续借规则：未逾期、未达次数上限、当前没有人等待这本书。
    const days = overdueDays(row.due_at, now)
    if (days > 0) {
      throw new AppError(ERR.RENEW_OVERDUE, '逾期借阅不能续借，请先归还并处理费用', 409)
    }
    if (row.renewals >= settings.get('max_renewals')) {
      throw new AppError(ERR.RENEW_LIMIT, '已达到最大续借次数', 409)
    }
    const queue = db
      .prepare(
        `SELECT id FROM reservations WHERE book_id = ? AND status IN ('waiting','ready') LIMIT 1`,
      )
      .get(row.book_id)
    if (queue) {
      throw new AppError(ERR.RENEW_RESERVED, '该图书已有读者预约，不能续借', 409)
    }
    const nextDueAt = endOfShanghaiDayAfter(new Date(row.due_at), settings.get('renewal_days'))
    return transaction(db, () => {
      // 条件更新 returned_at IS NULL，防止“续借”和“还书”并发时把已还记录改坏。
      const updated = db
        .prepare(
          'UPDATE loans SET due_at = ?, renewals = renewals + 1, updated_at = ? WHERE id = ? AND returned_at IS NULL',
        )
        .run(nextDueAt, nowIso, loanId)
      if (!updated.changes) throw new AppError(ERR.CONFLICT, '借阅状态已变化，请刷新后重试', 409)
      notifications.forReader(row.reader_id, {
        type: 'loan_renewed',
        title: '续借成功',
        content: `《${row.book_title}》已续借，新的应还日期为 ${toShanghaiDateTimeString(nextDueAt)}。`,
        relatedType: 'loan',
        relatedId: loanId,
        dedupeKey: `loan-renewed:${loanId}:${nowIso}`,
      })
      writeAudit(db, {
        actor,
        action: 'loan.renew',
        objectType: 'loan',
        objectId: loanId,
        details: { readerNo: row.reader_no, dueAt: nextDueAt, renewals: row.renewals + 1 },
        ip,
        createdAt: nowIso,
      })
      return mapLoan(db.prepare(`${LOAN_SELECT} WHERE l.id = ?`).get(loanId), now)
    })
  }

  function markLost(loanId, { amount, note }, actor, ip = '') {
    // 遗失登记会同时结束借阅、把副本标为 lost，并按填写金额生成一笔待处理赔偿费用。
    const now = clock()
    const nowIso = now.toISOString()
    const row = db.prepare(`${LOAN_SELECT} WHERE l.id = ?`).get(loanId)
    if (!row) throw new AppError(ERR.NOT_FOUND, '借阅记录不存在', 404)
    if (row.returned_at) throw new AppError(ERR.CONFLICT, '该借阅已结束，不能登记遗失', 409)
    const amountCents = moneyToCents(amount ?? 0, 'amount', '遗失赔偿金额')
    const reason = requiredString(note, 'note', '处理说明', { min: 2, max: 300 })
    return transaction(db, () => {
      db.prepare(
        `UPDATE loans SET returned_at = ?, status = 'returned', return_condition = ?,
           returned_by = ?, updated_at = ? WHERE id = ?`,
      ).run(nowIso, `遗失：${reason}`, actor.id, nowIso, loanId)
      db.prepare("UPDATE copies SET status = 'lost', condition_note = ?, updated_at = ? WHERE id = ?").run(
        reason,
        nowIso,
        row.copy_id,
      )
      db.prepare(
        `INSERT INTO copy_status_logs (copy_id, from_status, to_status, reason, operator_id, created_at)
         VALUES (?, 'borrowed', 'lost', ?, ?, ?)`,
      ).run(row.copy_id, reason, actor.id, nowIso)
      let fee = null
      if (amountCents > 0) {
        const existing = db
          .prepare("SELECT * FROM fees WHERE loan_id = ? AND type = 'lost'")
          .get(loanId)
        if (existing) {
          fee = existing
        } else {
          const result = db
            .prepare(
              `INSERT INTO fees (reader_id, loan_id, type, amount_cents, status, note, created_at, updated_at)
               VALUES (?, ?, 'lost', ?, 'pending', ?, ?, ?)`,
            )
            .run(row.reader_id, loanId, amountCents, reason, nowIso, nowIso)
          fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(Number(result.lastInsertRowid))
        }
      }
      notifications.forReader(row.reader_id, {
        type: 'loan_lost',
        title: '遗失登记',
        content: `《${row.book_title}》已登记遗失。${fee ? `待处理赔偿 ${Number((fee.amount_cents / 100).toFixed(2))} 元。` : ''}`,
        relatedType: 'loan',
        relatedId: loanId,
        dedupeKey: `loan-lost:${loanId}`,
      })
      writeAudit(db, {
        actor,
        action: 'loan.lost',
        objectType: 'loan',
        objectId: loanId,
        details: {
          readerNo: row.reader_no,
          barcode: row.barcode,
          amountCents,
          note: reason,
        },
        ip,
        createdAt: nowIso,
      })
      return {
        loan: mapLoan(db.prepare(`${LOAN_SELECT} WHERE l.id = ?`).get(loanId), now),
        fee: fee ? { id: fee.id, amount: Number((fee.amount_cents / 100).toFixed(2)) } : null,
      }
    })
  }

  function loanQuery(filters = {}, { readerId = null } = {}) {
    const { page, pageSize, offset } = parsePaging(filters)
    const now = clock()
    const where = []
    const params = []
    if (readerId) {
      where.push('l.reader_id = ?')
      params.push(readerId)
    }
    if (filters.readerId) {
      where.push('l.reader_id = ?')
      params.push(integer(filters.readerId, 'readerId', '读者', { min: 1 }))
    }
    if (filters.q) {
      const value = `%${escapeLike(filters.q)}%`
      where.push(
        `(b.title LIKE ? ESCAPE '\\' OR b.isbn LIKE ? ESCAPE '\\' OR cp.barcode LIKE ? ESCAPE '\\'
          OR rp.reader_no LIKE ? ESCAPE '\\' OR rp.full_name LIKE ? ESCAPE '\\')`,
      )
      params.push(value, value, value, value, value)
    }
    const status = filters.status || 'all'
    if (status === 'active') where.push('l.returned_at IS NULL')
    else if (status === 'returned') where.push('l.returned_at IS NOT NULL')
    else if (status === 'overdue') {
      where.push('l.returned_at IS NULL AND l.due_at < ?')
      params.push(now.toISOString())
    } else if (status !== 'all') {
      enumValue(status, 'status', '借阅状态', ['all', 'active', 'returned', 'overdue'])
    }
    if (filters.from) {
      where.push('l.borrowed_at >= ?')
      params.push(startOfShanghaiDate(filters.from))
    }
    if (filters.to) {
      where.push('l.borrowed_at < ?')
      params.push(startOfNextShanghaiDate(filters.to))
    }
    if (filters.barcode) {
      where.push('cp.barcode = ? COLLATE NOCASE')
      params.push(String(filters.barcode).trim().toUpperCase())
    }
    if (filters.readerNo) {
      where.push('rp.reader_no = ?')
      params.push(String(filters.readerNo).trim())
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM loans l
           JOIN books b ON b.id = l.book_id JOIN copies cp ON cp.id = l.copy_id
           JOIN reader_profiles rp ON rp.id = l.reader_id ${whereSql}`,
        )
        .get(...params).count,
    )
    const rows = db
      .prepare(
        `${LOAN_SELECT} ${whereSql} ORDER BY l.borrowed_at DESC, l.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset)
    return paged(rows.map((row) => mapLoan(row, now)), total, page, pageSize)
  }

  function listMyLoans(user, filters) {
    if (!user.readerId) throw new AppError(ERR.FORBIDDEN, '当前账号没有读者档案', 403)
    return loanQuery(filters, { readerId: user.readerId })
  }

  function listLoans(filters) {
    return loanQuery(filters)
  }

  return {
    getReaderByNo,
    getReaderById,
    previewBorrow,
    borrow,
    previewReturn,
    returnCopy,
    renew,
    markLost,
    listMyLoans,
    listLoans,
    syncOverdueFee,
  }
}
