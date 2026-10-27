import { AppError, ERR } from '../domain/errors.js'
import {
  startOfNextShanghaiDate,
  startOfShanghaiDate,
  toShanghaiDateString,
} from '../lib/time.js'
import { isValidDateOnly } from '../lib/time.js'

function resolveRange(filters, clock) {
  const today = toShanghaiDateString(clock())
  const defaultFrom = new Date(clock().getTime() - 29 * 24 * 60 * 60 * 1000)
  const from = filters.from || toShanghaiDateString(defaultFrom)
  const to = filters.to || today
  if (!isValidDateOnly(from) || !isValidDateOnly(to)) {
    throw new AppError(ERR.VALIDATION, '日期范围格式应为 YYYY-MM-DD', 422)
  }
  if (from > to) throw new AppError(ERR.VALIDATION, '开始日期不能晚于结束日期', 422)
  return {
    from,
    to,
    fromIso: startOfShanghaiDate(from),
    toExclusiveIso: startOfNextShanghaiDate(to),
  }
}

function money(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2))
}

export function createReportService({ db, clock = () => new Date() }) {
  function summary(filters = {}) {
    const { from, to, fromIso, toExclusiveIso } = resolveRange(filters, clock)
    const nowIso = clock().toISOString()
    const totals = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM books WHERE status = 'active') AS titles,
          (SELECT COUNT(*) FROM copies) AS copies,
          (SELECT COUNT(*) FROM copies WHERE status = 'available') AS available_copies,
          (SELECT COUNT(*) FROM copies WHERE status = 'borrowed') AS borrowed_copies,
          (SELECT COUNT(*) FROM copies WHERE status = 'reserved') AS reserved_copies,
          (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL) AS active_loans,
          (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL AND due_at < ?) AS overdue_loans,
          (SELECT COUNT(*) FROM reader_profiles WHERE status = 'active') AS active_readers,
          (SELECT COALESCE(SUM(amount_cents), 0) FROM fees WHERE status = 'pending') AS pending_fee_cents,
          (SELECT COUNT(*) FROM loans WHERE borrowed_at >= ? AND borrowed_at < ?) AS range_loans,
          (SELECT COUNT(*) FROM loans WHERE returned_at >= ? AND returned_at < ?) AS range_returns,
          (SELECT COUNT(*) FROM reservations WHERE status IN ('waiting','ready')) AS active_reservations`,
      )
      .get(nowIso, fromIso, toExclusiveIso, fromIso, toExclusiveIso)

    const popular = db
      .prepare(
        `SELECT b.id, b.title, b.isbn,
                (SELECT GROUP_CONCAT(a.name, '、') FROM book_authors ba JOIN authors a ON a.id = ba.author_id
                  WHERE ba.book_id = b.id) AS author_names,
                COUNT(l.id) AS loan_count
         FROM loans l JOIN books b ON b.id = l.book_id
         WHERE l.borrowed_at >= ? AND l.borrowed_at < ?
         GROUP BY b.id ORDER BY loan_count DESC, b.title ASC LIMIT 10`,
      )
      .all(fromIso, toExclusiveIso)
      .map((row) => ({
        id: row.id,
        title: row.title,
        isbn: row.isbn,
        authors: row.author_names ? row.author_names.split('、') : [],
        loanCount: Number(row.loan_count),
      }))

    const categories = db
      .prepare(
        `SELECT COALESCE(c.name, '未分类') AS name, COUNT(cp.id) AS copies,
                SUM(CASE WHEN cp.status = 'available' THEN 1 ELSE 0 END) AS available
         FROM copies cp
         JOIN books b ON b.id = cp.book_id
         LEFT JOIN categories c ON c.id = b.category_id
         GROUP BY c.id ORDER BY copies DESC, name ASC`,
      )
      .all()
      .map((row) => ({
        name: row.name,
        copies: Number(row.copies),
        available: Number(row.available || 0),
      }))

    const loanTrend = db
      .prepare(
        `SELECT strftime('%Y-%m-%d', datetime(borrowed_at, '+8 hours')) AS day, COUNT(*) AS count
         FROM loans WHERE borrowed_at >= ? AND borrowed_at < ? GROUP BY day ORDER BY day`,
      )
      .all(fromIso, toExclusiveIso)
    const returnTrend = db
      .prepare(
        `SELECT strftime('%Y-%m-%d', datetime(returned_at, '+8 hours')) AS day, COUNT(*) AS count
         FROM loans WHERE returned_at IS NOT NULL AND returned_at >= ? AND returned_at < ?
         GROUP BY day ORDER BY day`,
      )
      .all(fromIso, toExclusiveIso)
    const trendMap = new Map()
    for (const row of loanTrend) {
      trendMap.set(row.day, { date: row.day, loans: Number(row.count), returns: 0 })
    }
    for (const row of returnTrend) {
      const item = trendMap.get(row.day) || { date: row.day, loans: 0, returns: 0 }
      item.returns = Number(row.count)
      trendMap.set(row.day, item)
    }
    const trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date))

    return {
      from,
      to,
      totals: {
        titles: Number(totals.titles),
        copies: Number(totals.copies),
        availableCopies: Number(totals.available_copies),
        borrowedCopies: Number(totals.borrowed_copies),
        reservedCopies: Number(totals.reserved_copies),
        activeLoans: Number(totals.active_loans),
        overdueLoans: Number(totals.overdue_loans),
        activeReaders: Number(totals.active_readers),
        pendingFees: money(totals.pending_fee_cents),
        rangeLoans: Number(totals.range_loans),
        rangeReturns: Number(totals.range_returns),
        activeReservations: Number(totals.active_reservations),
      },
      popular,
      categories,
      trend,
    }
  }

  function exportCsv(filters = {}) {
    const data = summary(filters)
    const rows = [
      ['图书馆统计报表'],
      ['统计范围', `${data.from} 至 ${data.to}（Asia/Shanghai）`],
      [],
      ['指标', '数值'],
      ['馆藏品种数', data.totals.titles],
      ['馆藏副本总量', data.totals.copies],
      ['可借副本数', data.totals.availableCopies],
      ['在借副本数', data.totals.borrowedCopies],
      ['预约保留副本数', data.totals.reservedCopies],
      ['当前在借记录', data.totals.activeLoans],
      ['当前逾期记录', data.totals.overdueLoans],
      ['活跃读者数', data.totals.activeReaders],
      ['待处理费用（元）', data.totals.pendingFees],
      ['区间借阅量', data.totals.rangeLoans],
      ['区间归还量', data.totals.rangeReturns],
      [],
      ['热门图书', 'ISBN', '作者', '借阅次数'],
      ...data.popular.map((book) => [book.title, book.isbn, book.authors.join('、'), book.loanCount]),
      [],
      ['分类分布', '副本数', '可借数'],
      ...data.categories.map((item) => [item.name, item.copies, item.available]),
    ]
    const escape = (value) => {
      const text = String(value ?? '')
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
    }
    return `\ufeff${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`
  }

  return { summary, exportCsv, resolveRange }
}
