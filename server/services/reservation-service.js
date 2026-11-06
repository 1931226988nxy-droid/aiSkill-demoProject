/**
 * 文件职责：读者预约与后台预约队列服务。
 */

import { AppError, ERR } from '../domain/errors.js'
import { writeAudit } from '../lib/audit.js'
import { paged, parsePaging } from '../lib/pagination.js'
import { escapeLike, integer } from '../lib/validation.js'
import { transaction } from '../lib/transaction.js'
import { releaseReservation } from './reservation-queue.js'

const RESERVATION_SELECT = `SELECT r.*, b.title AS book_title, b.isbn, b.cover_url,
    rp.reader_no, rp.full_name AS reader_name, cp.barcode AS copy_barcode,
    -- 队列位置 = 同书所有更早的 waiting/ready 记录数 + 1；不依赖内存排序。
    (SELECT COUNT(*) FROM reservations q
      WHERE q.book_id = r.book_id AND q.status IN ('waiting','ready')
        AND (q.created_at < r.created_at OR (q.created_at = r.created_at AND q.id < r.id))
    ) + 1 AS queue_position
  FROM reservations r
  JOIN books b ON b.id = r.book_id
  JOIN reader_profiles rp ON rp.id = r.reader_id
  LEFT JOIN copies cp ON cp.id = r.copy_id`

function mapReservation(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    readerId: row.reader_id,
    bookTitle: row.book_title,
    isbn: row.isbn,
    coverUrl: row.cover_url,
    readerNo: row.reader_no,
    readerName: row.reader_name,
    status: row.status,
    copyId: row.copy_id,
    copyBarcode: row.copy_barcode,
    queuePosition: Number(row.queue_position || 1),
    createdAt: row.created_at,
    readyAt: row.ready_at,
    pickupExpiresAt: row.pickup_expires_at,
    closedAt: row.closed_at,
    note: row.note,
  }
}

export function createReservationService({ db, clock = () => new Date(), settings, notifications }) {
  function getDetail(id) {
    return db.prepare(`${RESERVATION_SELECT} WHERE r.id = ?`).get(id)
  }

  function create(input, user, ip = '') {
    if (!user.readerId) throw new AppError(ERR.FORBIDDEN, '当前账号没有读者档案', 403)
    const bookId = integer(input.bookId, 'bookId', '图书', { min: 1 })
    const book = db
      .prepare("SELECT * FROM books WHERE id = ? AND status = 'active'")
      .get(bookId)
    if (!book) throw new AppError(ERR.NOT_FOUND, '图书不存在或已下架', 404)
    const reader = db.prepare('SELECT * FROM reader_profiles WHERE id = ?').get(user.readerId)
    // 预约前同时检查读者证状态、有效期和图书是否已在借，避免无效排队。
    if (!reader || reader.status !== 'active') {
      throw new AppError(ERR.READER_DISABLED, '读者证已停用', 403)
    }
    if (reader.expires_at && new Date(reader.expires_at).getTime() < clock().getTime()) {
      throw new AppError(ERR.READER_EXPIRED, '读者证已过期，不能预约', 403)
    }
    const activeLoan = db
      .prepare('SELECT id FROM loans WHERE reader_id = ? AND book_id = ? AND returned_at IS NULL')
      .get(user.readerId, bookId)
    if (activeLoan) {
      throw new AppError(ERR.RESERVATION_NOT_ALLOWED, '该图书已在借阅中，无需预约', 409)
    }
    const duplicate = db
      .prepare(
        `SELECT id FROM reservations WHERE reader_id = ? AND book_id = ?
         AND status IN ('waiting','ready')`,
      )
      .get(user.readerId, bookId)
    if (duplicate) {
      throw new AppError(ERR.RESERVATION_DUPLICATE, '您已预约这本书，请勿重复预约', 409, {
        reservationId: duplicate.id,
      })
    }
    // 有可借副本时不允许预约，避免绕过正常借阅流程占用队列。
    const available = db
      .prepare("SELECT COUNT(*) AS count FROM copies WHERE book_id = ? AND status = 'available'")
      .get(bookId)
    if (Number(available.count) > 0) {
      throw new AppError(ERR.RESERVATION_NOT_ALLOWED, '该图书当前有可借副本，无需预约', 409)
    }
    const nowIso = clock().toISOString()
    return transaction(db, () => {
      const result = db
        .prepare(
          `INSERT INTO reservations (book_id, reader_id, status, created_at, note)
           VALUES (?, ?, 'waiting', ?, '')`,
        )
        .run(bookId, user.readerId, nowIso)
      const id = Number(result.lastInsertRowid)
      const detail = getDetail(id)
      notifications.forReader(user.readerId, {
        type: 'reservation_created',
        title: '预约成功',
        content: `《${book.title}》预约成功，当前排队第 ${detail.queue_position} 位。有副本归还后将通知您取书。`,
        relatedType: 'reservation',
        relatedId: id,
        dedupeKey: `reservation-created:${id}`,
      })
      writeAudit(db, {
        actor: user,
        action: 'reservation.create',
        objectType: 'reservation',
        objectId: id,
        details: { bookId, queuePosition: detail.queue_position },
        ip,
        createdAt: nowIso,
      })
      return mapReservation(detail)
    })
  }

  function listMy(user, filters = {}) {
    if (!user.readerId) throw new AppError(ERR.FORBIDDEN, '当前账号没有读者档案', 403)
    const { page, pageSize, offset } = parsePaging(filters)
    const where = ['r.reader_id = ?']
    const params = [user.readerId]
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'active') where.push("r.status IN ('waiting','ready')")
      else if (filters.status === 'closed') {
        where.push("r.status IN ('fulfilled','cancelled','expired')")
      } else {
        where.push('r.status = ?')
        params.push(filters.status)
      }
    }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const total = Number(
      db.prepare(`SELECT COUNT(*) AS count FROM reservations r ${whereSql}`).get(...params).count,
    )
    const rows = db
      .prepare(`${RESERVATION_SELECT} ${whereSql} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset)
    return paged(rows.map(mapReservation), total, page, pageSize)
  }

  function listStaff(filters = {}) {
    const { page, pageSize, offset } = parsePaging(filters)
    const where = []
    const params = []
    if (filters.q) {
      const value = `%${escapeLike(filters.q)}%`
      where.push(
        `(b.title LIKE ? ESCAPE '\\' OR b.isbn LIKE ? ESCAPE '\\'
          OR rp.reader_no LIKE ? ESCAPE '\\' OR rp.full_name LIKE ? ESCAPE '\\')`,
      )
      params.push(value, value, value, value)
    }
    if (filters.status && filters.status !== 'all') {
      where.push('r.status = ?')
      params.push(filters.status)
    }
    if (filters.bookId) {
      where.push('r.book_id = ?')
      params.push(integer(filters.bookId, 'bookId', '图书', { min: 1 }))
    }
    if (filters.readerId) {
      where.push('r.reader_id = ?')
      params.push(integer(filters.readerId, 'readerId', '读者', { min: 1 }))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM reservations r
           JOIN books b ON b.id = r.book_id JOIN reader_profiles rp ON rp.id = r.reader_id ${whereSql}`,
        )
        .get(...params).count,
    )
    const rows = db
      .prepare(`${RESERVATION_SELECT} ${whereSql} ORDER BY
        CASE r.status WHEN 'ready' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,
        r.created_at ASC, r.id ASC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset)
    return paged(rows.map(mapReservation), total, page, pageSize)
  }

  function cancel(id, actor, { allowManage = false, ip = '' } = {}) {
    const row = getDetail(id)
    if (!row) throw new AppError(ERR.NOT_FOUND, '预约记录不存在', 404)
    // 读者只能取消自己的预约；馆员通过 allowManage 处理全量队列。
    if (!allowManage && row.reader_id !== actor.readerId) {
      throw new AppError(ERR.FORBIDDEN, '不能操作他人的预约', 403)
    }
    if (!['waiting', 'ready'].includes(row.status)) {
      throw new AppError(ERR.CONFLICT, '该预约已结束，不能取消', 409)
    }
    const now = clock()
    return transaction(db, () => {
      // 若取消的是 ready 预约，releaseReservation 会把保留副本顺延给下一位或恢复可借。
      const result = releaseReservation({
        db,
        reservation: row,
        status: 'cancelled',
        now,
        settings,
        notifications,
        reason: row.note || '读者取消预约',
      })
      notifications.forReader(row.reader_id, {
        type: 'reservation_cancelled',
        title: '预约已取消',
        content: `《${row.book_title}》的预约已取消。`,
        relatedType: 'reservation',
        relatedId: row.id,
        dedupeKey: `reservation-cancelled:${row.id}`,
      })
      writeAudit(db, {
        actor,
        action: 'reservation.cancel',
        objectType: 'reservation',
        objectId: row.id,
        details: { readerNo: row.reader_no, bookId: row.book_id },
        ip,
        createdAt: now.toISOString(),
      })
      return mapReservation(result)
    })
  }

  return { create, listMy, listStaff, cancel, getDetail }
}
