import { formatDate } from '@jcc/shared/utils'

export function formatDateTime(value, { dateOnly = false } = {}) {
  return formatDate(value, {
    dateOnly,
    timeZone: 'Asia/Shanghai',
    locale: 'zh-CN',
  })
}

export function formatMoney(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return `¥${amount.toFixed(2)}`
}

export function parseBarcodeText(text) {
  return [
    ...new Set(
      String(text || '')
        .split(/[\n,，;；\s]+/)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    ),
  ]
}

export function statusMeta(map, status) {
  return map[status] || { label: status || '未知', color: 'default' }
}

export function shortDate(value) {
  return formatDateTime(value, { dateOnly: true })
}

export function safeRedirect(value) {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value
  return '/'
}

export function daysOverdue(dueAt) {
  if (!dueAt) return 0
  const diff = Date.now() - new Date(dueAt).getTime()
  return diff > 0 ? Math.floor(diff / 86400000) + 1 : 0
}

export function dueTone(dueAt) {
  const days = daysOverdue(dueAt)
  if (days > 0) return 'danger'
  const remaining = new Date(dueAt).getTime() - Date.now()
  if (remaining <= 3 * 86400000) return 'warning'
  return 'normal'
}
