import { endOfShanghaiDayAfter, toShanghaiDateTimeString } from '../lib/time.js'

export function getNextWaitingReservation(db, bookId) {
  return db
    .prepare(
      `SELECT r.*, rp.user_id, rp.reader_no, rp.full_name AS reader_name, b.title AS book_title
       FROM reservations r
       JOIN reader_profiles rp ON rp.id = r.reader_id
       JOIN books b ON b.id = r.book_id
       WHERE r.book_id = ? AND r.status = 'waiting'
       ORDER BY r.created_at ASC, r.id ASC
       LIMIT 1`,
    )
    .get(bookId)
}

export function getReservationDetail(db, reservationId) {
  return db
    .prepare(
      `SELECT r.*, b.title AS book_title, b.isbn, rp.reader_no, rp.full_name AS reader_name,
              cp.barcode AS copy_barcode
       FROM reservations r
       JOIN books b ON b.id = r.book_id
       JOIN reader_profiles rp ON rp.id = r.reader_id
       LEFT JOIN copies cp ON cp.id = r.copy_id
       WHERE r.id = ?`,
    )
    .get(reservationId)
}

/** 将某本图书的下一顺位预约置为“待取书”，并把归还副本置为预约保留。 */
export function promoteNextReservation({
  db,
  bookId,
  copyId,
  now = new Date(),
  settings,
  notifications,
}) {
  const next = getNextWaitingReservation(db, bookId)
  if (!next) return null
  const nowIso = now.toISOString()
  const pickupExpiresAt = endOfShanghaiDayAfter(now, settings.get('reservation_hold_days'))
  db.prepare(
    `UPDATE reservations
     SET status = 'ready', copy_id = ?, ready_at = ?, pickup_expires_at = ?
     WHERE id = ? AND status = 'waiting'`,
  ).run(copyId, nowIso, pickupExpiresAt, next.id)
  db.prepare("UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?").run(
    nowIso,
    copyId,
  )
  if (notifications) {
    notifications.forReader(next.reader_id, {
      type: 'reservation_ready',
      title: '预约图书已到馆',
      content: `《${next.book_title || ''}》已为您保留，请在 ${toShanghaiDateTimeString(pickupExpiresAt)} 前到馆取书。`,
      relatedType: 'reservation',
      relatedId: next.id,
      dedupeKey: `reservation-ready:${next.id}`,
    })
  }
  return getReservationDetail(db, next.id)
}

/** 取消/过期/放弃取书时，释放副本并按队列顺延。 */
export function releaseReservation({
  db,
  reservation,
  status,
  now = new Date(),
  settings,
  notifications,
  reason = '',
}) {
  const nowIso = now.toISOString()
  db.prepare('UPDATE reservations SET status = ?, closed_at = ?, note = ? WHERE id = ?').run(
    status,
    nowIso,
    reason || reservation.note || '',
    reservation.id,
  )
  if (reservation.copy_id) {
    const copy = db.prepare('SELECT * FROM copies WHERE id = ?').get(reservation.copy_id)
    if (copy && copy.status === 'reserved') {
      const promoted = promoteNextReservation({
        db,
        bookId: reservation.book_id,
        copyId: copy.id,
        now,
        settings,
        notifications,
      })
      if (!promoted) {
        db.prepare("UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?").run(
          nowIso,
          copy.id,
        )
      }
    }
  }
  return getReservationDetail(db, reservation.id)
}
