export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // A failed transaction may already be rolled back by SQLite.
    }
    throw error
  }
}

export function isUniqueConstraint(error) {
  return /UNIQUE constraint failed|constraint failed/i.test(String(error?.message || ''))
}
