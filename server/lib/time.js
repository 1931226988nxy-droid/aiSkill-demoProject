/**
 * 文件职责：Asia/Shanghai 时间边界、逾期天数和数据库 UTC 时间工具。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

// 不依赖运行机器时区：先把时间平移到 UTC+8，再用 getUTC* 读取上海本地年月日。
export function shanghaiParts(value) {
  const date = value instanceof Date ? value : new Date(value)
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

export function toShanghaiDateString(value) {
  const { year, month, day } = shanghaiParts(value)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function toShanghaiDateTimeString(value) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function startOfShanghaiDate(dateOnly) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly || ''))
  if (!match) return null
  const [, year, month, day] = match
  // 上海 00:00 对应 UTC 前一日 16:00，因此用 -8 小时构造。
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), -8, 0, 0, 0)).toISOString()
}

export function endOfShanghaiDate(dateOnly) {
  const start = startOfShanghaiDate(dateOnly)
  if (!start) return null
  // 结束时间是次日 00:00 前 1ms，数据库比较可直接使用 < 或 <=。
  return new Date(new Date(start).getTime() + DAY_MS - 1).toISOString()
}

export function startOfNextShanghaiDate(dateOnly) {
  const start = startOfShanghaiDate(dateOnly)
  if (!start) return null
  return new Date(new Date(start).getTime() + DAY_MS).toISOString()
}

/** 从某个时间点起，按上海时区自然日结束后移 N 天（23:59:59.999）。 */
export function endOfShanghaiDayAfter(value, days = 0) {
  const date = value instanceof Date ? value : new Date(value)
  const { year, month, day } = shanghaiParts(date)
  // UTC 15:59:59.999 正好是上海次日 23:59:59.999。
  return new Date(Date.UTC(year, month - 1, day + days, 15, 59, 59, 999)).toISOString()
}

export function addShanghaiDays(value, days) {
  return endOfShanghaiDayAfter(value, days)
}

/** 逾期自然日数；未到期返回 0。 */
export function overdueDays(dueAt, now = new Date()) {
  const due = new Date(dueAt).getTime()
  const current = (now instanceof Date ? now : new Date(now)).getTime()
  if (!Number.isFinite(due) || current <= due) return 0
  // 超过到期时间哪怕 1ms 也按第 1 天计费，符合“到期日次日开始逾期”的业务口径。
  return Math.floor((current - due) / DAY_MS) + 1
}

export function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isWithin(dateIso, from, toExclusive) {
  const time = new Date(dateIso).getTime()
  return time >= new Date(from).getTime() && time < new Date(toExclusive).getTime()
}
