import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function resolveDatabasePath(env = process.env) {
  return env.DB_PATH || path.resolve(process.cwd(), 'data', 'library.db')
}

export function openDatabase(filename = resolveDatabasePath()) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true })
  }
  const db = new DatabaseSync(filename)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  return db
}
