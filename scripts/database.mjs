import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync, backup } from 'node:sqlite'

export async function verifyDatabase(filename) {
  const db = new DatabaseSync(filename, { readOnly: true })
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('数据库完整性检查失败')
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('数据库外键检查失败')
    db.prepare('SELECT version FROM schema_migrations LIMIT 1').get()
  } finally { db.close() }
}

export async function copyDatabase(source, destination) {
  const input = path.resolve(source)
  const output = path.resolve(destination)
  if (input === output) throw new Error('源文件与目标文件不能相同')
  await fs.access(input)
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 })
  // 排他创建，防止恢复命令覆盖现有生产库。
  const reservation = await fs.open(output, 'wx', 0o600)
  await reservation.close()
  let db
  try {
    db = new DatabaseSync(input, { readOnly: true })
    await backup(db, output)
    const snapshot = new DatabaseSync(output)
    try { snapshot.exec('PRAGMA journal_mode = DELETE') }
    finally { snapshot.close() }
    await verifyDatabase(output)
    return output
  } catch (error) {
    await fs.unlink(output).catch(() => {})
    throw error
  } finally { db?.close() }
}

export async function backupDatabase(source, directory, { keep = 14 } = {}) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('备份保留份数必须为正整数')
  const root = path.resolve(directory)
  const name = `library-${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID()}.db`
  const output = await copyDatabase(source, path.join(root, name))
  const files = (await fs.readdir(root)).filter((file) => file !== path.basename(output) && /^library-\d{4}-\d{2}-\d{2}T[\d.-]+Z-[a-f0-9-]+\.db$/.test(file)).sort().reverse()
  // 仅清理由本工具生成、位于备份目录内的普通备份文件；验证新备份成功后才轮换。
  for (const file of files.slice(keep - 1)) {
    const target = path.resolve(root, file)
    if (path.dirname(target) !== root) throw new Error('无效备份路径')
    if ((await fs.lstat(target)).isFile()) await fs.unlink(target)
  }
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [action, source, destination] = process.argv.slice(2)
    let result
    if (action === 'backup') {
      const database = source || process.env.DB_PATH
      if (!database) throw new Error('请通过 DB_PATH 或参数指定要备份的数据库')
      result = await backupDatabase(database, destination || process.env.BACKUP_DIR || './backups', { keep: Number(process.env.BACKUP_KEEP || 14) })
    } else if (action === 'restore' && source && destination) {
      await verifyDatabase(source)
      result = await copyDatabase(source, destination)
    } else throw new Error('用法：db:backup -- [源数据库] [备份目录]；db:restore -- 备份文件 新数据库路径')
    console.log(JSON.stringify({ action, file: result, verified: true }))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
