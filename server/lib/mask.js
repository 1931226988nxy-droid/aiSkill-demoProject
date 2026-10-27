export function maskPhone(value) {
  const text = String(value || '')
  if (!text) return ''
  return text.length >= 7 ? `${text.slice(0, 3)}****${text.slice(-4)}` : '****'
}

export function maskIdCard(value) {
  const text = String(value || '')
  if (!text) return ''
  return text.length >= 8 ? `${text.slice(0, 4)}**********${text.slice(-4)}` : '****'
}

export function serializeReader(row, { revealSensitive = false } = {}) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    readerNo: row.reader_no,
    fullName: row.full_name,
    phone: revealSensitive ? row.phone || '' : maskPhone(row.phone),
    idCard: revealSensitive ? row.id_card || '' : maskIdCard(row.id_card),
    email: row.email || '',
    status: row.status,
    maxBorrowOverride: row.max_borrow_override,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    username: row.username || undefined,
  }
}
