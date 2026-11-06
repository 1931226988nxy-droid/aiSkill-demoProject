/**
 * 文件职责：按当前角色组装工作台指标和提醒。
 */

import {
  startOfNextShanghaiDate,
  startOfShanghaiDate,
  toShanghaiDateString,
} from '../lib/time.js'

export function createDashboardService({ db, clock = () => new Date() }) {
  function readerDashboard(user) {
    // 读者工作台只返回当前读者自己的借阅、预约、未读通知和费用。
    const nowIso = clock().toISOString()
    const today = toShanghaiDateString(clock())
    const readerId = user.readerId || user.reader?.id
    const stats = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM loans WHERE reader_id = ? AND returned_at IS NULL) AS active_loans,
          (SELECT COUNT(*) FROM loans WHERE reader_id = ? AND returned_at IS NULL AND due_at < ?) AS overdue_loans,
          (SELECT COUNT(*) FROM reservations WHERE reader_id = ? AND status IN ('waiting','ready')) AS active_reservations,
          (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL) AS unread_notifications,
          (SELECT COALESCE(SUM(amount_cents),0) FROM fees WHERE reader_id = ? AND status = 'pending') AS pending_fee_cents`,
      )
      .get(readerId, readerId, nowIso, readerId, user.id, readerId)
    const loans = db
      .prepare(
        `SELECT l.*, b.title AS book_title, b.isbn, cp.barcode, cp.location
         FROM loans l JOIN books b ON b.id = l.book_id JOIN copies cp ON cp.id = l.copy_id
         WHERE l.reader_id = ? AND l.returned_at IS NULL ORDER BY l.due_at ASC LIMIT 5`,
      )
      .all(readerId)
      .map((row) => ({
        id: row.id,
        bookTitle: row.book_title,
        isbn: row.isbn,
        barcode: row.barcode,
        location: row.location,
        dueAt: row.due_at,
        overdue: row.due_at < nowIso,
      }))
    const reservations = db
      .prepare(
        `SELECT r.*, b.title AS book_title,
          (SELECT COUNT(*) FROM reservations q WHERE q.book_id = r.book_id
            AND q.status IN ('waiting','ready')
            AND (q.created_at < r.created_at OR (q.created_at = r.created_at AND q.id < r.id))) + 1 AS queue_position
         FROM reservations r JOIN books b ON b.id = r.book_id
         WHERE r.reader_id = ? AND r.status IN ('waiting','ready')
         ORDER BY r.created_at LIMIT 5`,
      )
      .all(readerId)
      .map((row) => ({
        id: row.id,
        bookTitle: row.book_title,
        status: row.status,
        queuePosition: Number(row.queue_position),
        pickupExpiresAt: row.pickup_expires_at,
      }))
    const announcements = db
      .prepare(
        `SELECT id, title, content, published_at FROM announcements
         WHERE status = 'published' ORDER BY published_at DESC LIMIT 3`,
      )
      .all()
      .map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        publishedAt: row.published_at,
      }))
    return {
      role: user.role.code,
      libraryName: db.prepare("SELECT value FROM settings WHERE key = 'library_name'").get()?.value || '图书馆',
      date: today,
      stats: [
        { key: 'activeLoans', label: '当前借阅', value: Number(stats.active_loans), unit: '册' },
        { key: 'overdueLoans', label: '逾期未还', value: Number(stats.overdue_loans), unit: '笔', tone: 'danger' },
        { key: 'activeReservations', label: '进行中预约', value: Number(stats.active_reservations), unit: '笔' },
        { key: 'unreadNotifications', label: '未读通知', value: Number(stats.unread_notifications), unit: '条' },
        {
          key: 'pendingFees',
          label: '待处理费用',
          value: Number((Number(stats.pending_fee_cents) / 100).toFixed(2)),
          unit: '元',
        },
      ],
      loans,
      reservations,
      announcements,
    }
  }

  function staffDashboard(user) {
    // 馆员/管理员工作台汇总全馆运营指标，并单独给出今日借还和逾期列表。
    const now = clock()
    const today = toShanghaiDateString(now)
    const dayStart = startOfShanghaiDate(today)
    const nextDay = startOfNextShanghaiDate(today)
    const stats = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM copies) AS copies,
          (SELECT COUNT(*) FROM copies WHERE status = 'available') AS available_copies,
          (SELECT COUNT(*) FROM copies WHERE status = 'borrowed') AS borrowed_copies,
          (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL) AS active_loans,
          (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL AND due_at < ?) AS overdue_loans,
          (SELECT COUNT(*) FROM reservations WHERE status = 'ready') AS ready_reservations,
          (SELECT COUNT(*) FROM reservations WHERE status = 'waiting') AS waiting_reservations,
          (SELECT COUNT(*) FROM loans WHERE borrowed_at >= ? AND borrowed_at < ?) AS today_loans,
          (SELECT COUNT(*) FROM loans WHERE returned_at >= ? AND returned_at < ?) AS today_returns,
          (SELECT COUNT(*) FROM reader_profiles WHERE status = 'active') AS active_readers,
          (SELECT COALESCE(SUM(amount_cents),0) FROM fees WHERE status = 'pending') AS pending_fee_cents`,
      )
      .get(now.toISOString(), dayStart, nextDay, dayStart, nextDay)
    const overdue = db
      .prepare(
        `SELECT l.id, l.due_at, b.title AS book_title, cp.barcode, rp.reader_no, rp.full_name AS reader_name
         FROM loans l JOIN books b ON b.id = l.book_id JOIN copies cp ON cp.id = l.copy_id
         JOIN reader_profiles rp ON rp.id = l.reader_id
         WHERE l.returned_at IS NULL AND l.due_at < ? ORDER BY l.due_at ASC LIMIT 5`,
      )
      .all(now.toISOString())
      .map((row) => ({
        id: row.id,
        overdue: true,
        bookTitle: row.book_title,
        barcode: row.barcode,
        readerNo: row.reader_no,
        readerName: row.reader_name,
        dueAt: row.due_at,
      }))
    const readyReservations = db
      .prepare(
        `SELECT r.id, r.pickup_expires_at, b.title AS book_title, cp.barcode,
                rp.reader_no, rp.full_name AS reader_name
         FROM reservations r JOIN books b ON b.id = r.book_id
         JOIN reader_profiles rp ON rp.id = r.reader_id
         LEFT JOIN copies cp ON cp.id = r.copy_id
         WHERE r.status = 'ready' ORDER BY r.pickup_expires_at ASC LIMIT 5`,
      )
      .all()
      .map((row) => ({
        id: row.id,
        bookTitle: row.book_title,
        barcode: row.barcode,
        readerNo: row.reader_no,
        readerName: row.reader_name,
        pickupExpiresAt: row.pickup_expires_at,
      }))
    const announcements = db
      .prepare(
        `SELECT id, title, content, published_at FROM announcements
         WHERE status = 'published' ORDER BY published_at DESC LIMIT 3`,
      )
      .all()
      .map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        publishedAt: row.published_at,
      }))
    return {
      role: user.role.code,
      libraryName: db.prepare("SELECT value FROM settings WHERE key = 'library_name'").get()?.value || '图书馆',
      date: today,
      stats: [
        { key: 'todayLoans', label: '今日借出', value: Number(stats.today_loans), unit: '笔' },
        { key: 'todayReturns', label: '今日归还', value: Number(stats.today_returns), unit: '笔' },
        { key: 'overdueLoans', label: '逾期未还', value: Number(stats.overdue_loans), unit: '笔', tone: 'danger' },
        { key: 'readyReservations', label: '预约待取', value: Number(stats.ready_reservations), unit: '笔' },
        { key: 'availableCopies', label: '可借副本', value: Number(stats.available_copies), unit: '册' },
        {
          key: 'pendingFees',
          label: '待处理费用',
          value: Number((Number(stats.pending_fee_cents) / 100).toFixed(2)),
          unit: '元',
        },
      ],
      overview: {
        copies: Number(stats.copies),
        activeLoans: Number(stats.active_loans),
        waitingReservations: Number(stats.waiting_reservations),
        activeReaders: Number(stats.active_readers),
        borrowedCopies: Number(stats.borrowed_copies),
      },
      alerts: { overdue, readyReservations },
      announcements,
    }
  }

  function dashboard(user) {
    return user.role.code === 'reader' ? readerDashboard(user) : staffDashboard(user)
  }

  return { dashboard }
}
