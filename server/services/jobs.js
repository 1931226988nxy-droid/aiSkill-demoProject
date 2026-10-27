import { writeAudit } from '../lib/audit.js'
import { transaction } from '../lib/transaction.js'
import { endOfShanghaiDayAfter, overdueDays, toShanghaiDateString, toShanghaiDateTimeString } from '../lib/time.js'
import { assignAvailableCopies, releaseReservation } from './reservation-queue.js'

export function runAutomatedJobs({
  db,
  circulation,
  settings,
  notifications,
  clock = () => new Date(),
}) {
  const now = clock()
  const nowIso = now.toISOString()
  const result = {
    overdueFees: 0,
    overdueNotices: 0,
    dueSoonNotices: 0,
    expiredReservations: 0,
    assignedReservations: 0,
    expiredSessions: 0,
  }

  const overdueLoans = db
    .prepare(
      `SELECT l.*, b.title AS book_title, rp.user_id AS reader_user_id
       FROM loans l JOIN books b ON b.id = l.book_id
       JOIN reader_profiles rp ON rp.id = l.reader_id
       WHERE l.returned_at IS NULL AND l.due_at < ?`,
    )
    .all(nowIso)
  for (const loan of overdueLoans) {
    const fee = circulation.syncOverdueFee(loan, now)
    if (fee) result.overdueFees += 1
    const days = overdueDays(loan.due_at, now)
    const notice = notifications.send({
      userId: loan.reader_user_id,
      type: 'loan_overdue',
      title: '图书已逾期',
      content: `《${loan.book_title}》已逾期 ${days} 天，应还日期 ${toShanghaiDateTimeString(loan.due_at)}，请尽快归还。`,
      relatedType: 'loan',
      relatedId: loan.id,
      dedupeKey: `loan-overdue:${loan.id}:${toShanghaiDateString(now)}`,
    })
    if (notice) result.overdueNotices += 1
  }

  const dueSoonDays = settings.get('due_soon_days')
  const threshold = endOfShanghaiDayAfter(now, dueSoonDays)
  const dueSoon = db
    .prepare(
      `SELECT l.*, b.title AS book_title, rp.user_id AS reader_user_id
       FROM loans l JOIN books b ON b.id = l.book_id
       JOIN reader_profiles rp ON rp.id = l.reader_id
       WHERE l.returned_at IS NULL AND l.due_at >= ? AND l.due_at <= ?`,
    )
    .all(nowIso, threshold)
  for (const loan of dueSoon) {
    const notice = notifications.send({
      userId: loan.reader_user_id,
      type: 'loan_due_soon',
      title: '图书即将到期',
      content: `《${loan.book_title}》将于 ${toShanghaiDateTimeString(loan.due_at)} 到期，请及时归还或续借。`,
      relatedType: 'loan',
      relatedId: loan.id,
      dedupeKey: `loan-due:${loan.id}:${toShanghaiDateString(now)}`,
    })
    if (notice) result.dueSoonNotices += 1
  }

  const expired = db
    .prepare(
      `SELECT r.*, b.title AS book_title, rp.user_id AS reader_user_id
       FROM reservations r JOIN books b ON b.id = r.book_id
       JOIN reader_profiles rp ON rp.id = r.reader_id
       WHERE r.status = 'ready' AND r.pickup_expires_at < ?`,
    )
    .all(nowIso)
  for (const reservation of expired) {
    transaction(db, () => {
      releaseReservation({
        db,
        reservation,
        status: 'expired',
        now,
        settings,
        notifications,
        reason: '超过预约保留期限，系统自动失效',
      })
      notifications.send({
        userId: reservation.reader_user_id,
        type: 'reservation_expired',
        title: '预约已过期',
        content: `《${reservation.book_title}》的预约已超过取书期限，系统已释放保留副本。`,
        relatedType: 'reservation',
        relatedId: reservation.id,
        dedupeKey: `reservation-expired:${reservation.id}`,
      })
      writeAudit(db, {
        action: 'reservation.expire',
        objectType: 'reservation',
        objectId: reservation.id,
        details: { bookId: reservation.book_id, readerId: reservation.reader_id },
        createdAt: nowIso,
      })
    })
    result.expiredReservations += 1
  }

  const waitingBooks = db.prepare(
    `SELECT DISTINCT r.book_id FROM reservations r
     JOIN books b ON b.id = r.book_id
     WHERE r.status = 'waiting' AND b.status = 'active'
       AND EXISTS (SELECT 1 FROM copies cp
         WHERE cp.book_id = r.book_id AND cp.status = 'available')`,
  ).all()
  for (const { book_id: bookId } of waitingBooks) {
    result.assignedReservations += transaction(db, () =>
      assignAvailableCopies({ db, bookId, now, settings, notifications }).length,
    )
  }

  result.expiredSessions = Number(
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso).changes,
  )
  return result
}
