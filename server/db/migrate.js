/**
 * 文件职责：按文件名顺序执行 SQL 迁移并记录版本，保证升级可重复。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationsDir = path.dirname(fileURLToPath(import.meta.url))

export function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
  )
  const files = fs
    .readdirSync(path.join(migrationsDir, 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    // 文件名前缀即版本顺序；已执行版本跳过，保证重复启动幂等。
    .sort()

  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    if (applied.has(version)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, 'migrations', file), 'utf8')
    // 单个迁移失败必须整体回滚，不能留下半升级的表结构。
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        new Date().toISOString(),
      )
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
