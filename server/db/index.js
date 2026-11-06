/**
 * 文件职责：创建 SQLite 连接并统一设置外键、WAL 和忙等待策略。
 */

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
  // 外键约束、写锁等待和 WAL 是并发正确性的基础，必须在所有业务查询前设置。
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  // 内存库不支持 WAL，测试环境保持默认日志模式即可。
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  return db
}
