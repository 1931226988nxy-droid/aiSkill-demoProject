import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { openDatabase } from '../db/index.js'
import { runMigrations } from '../db/migrate.js'
import { backupDatabase, copyDatabase, verifyDatabase } from '../../scripts/database.mjs'

test('在线 WAL 备份可验证并恢复，恢复拒绝覆盖现有数据库', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'library-backup-test-'))
  const source = path.join(directory, 'source.db')
  const db = openDatabase(source)
  try {
    runMigrations(db)
    db.exec('CREATE TABLE backup_probe (value TEXT); INSERT INTO backup_probe VALUES (\'未 checkpoint 的数据\')')
    const file = await backupDatabase(source, path.join(directory, 'backups'))
    await verifyDatabase(file)
    const restored = await copyDatabase(file, path.join(directory, 'restored.db'))
    const copy = openDatabase(restored)
    try { assert.equal(copy.prepare('SELECT value FROM backup_probe').get().value, '未 checkpoint 的数据') }
    finally { copy.close() }
    await assert.rejects(() => copyDatabase(file, source), /EEXIST/)
    await fs.copyFile(file, path.join(directory, 'backups', 'library-9999-12-31T23-59-59.999Z-00000000-0000-0000-0000-000000000000.db'))
    const latest = await backupDatabase(source, path.join(directory, 'backups'), { keep: 1 })
    await fs.access(latest)
    assert.equal((await fs.readdir(path.join(directory, 'backups'))).length, 1)
  } finally { db.close(); await fs.rm(directory, { recursive: true, force: true }) }
})

test('源数据库无法打开时清除空目标文件', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'library-backup-invalid-'))
  const target = path.join(directory, 'output.db')
  try {
    await assert.rejects(() => copyDatabase(directory, target))
    await assert.rejects(() => fs.access(target), /ENOENT/)
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
