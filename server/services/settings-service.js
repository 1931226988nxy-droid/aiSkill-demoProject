import { AppError, ERR } from '../domain/errors.js'
import { DEFAULT_SETTINGS } from '../domain/constants.js'
import { integer, booleanValue } from '../lib/validation.js'
import { transaction } from '../lib/transaction.js'

const SETTING_MAP = new Map(DEFAULT_SETTINGS.map((item) => [item.key, item]))

function decode(row) {
  if (row.type === 'integer') return Number(row.value)
  if (row.type === 'boolean') return row.value === 'true'
  return row.value
}

export function createSettingsService({ db, clock = () => new Date() }) {
  function rows() {
    return db.prepare('SELECT * FROM settings ORDER BY key').all()
  }

  function getAll() {
    const result = {}
    for (const item of DEFAULT_SETTINGS) result[item.key] = decode({ ...item })
    for (const row of rows()) result[row.key] = decode(row)
    return result
  }

  function get(key) {
    const value = getAll()[key]
    if (value === undefined) throw new AppError(ERR.NOT_FOUND, '系统参数不存在', 404)
    return value
  }

  function update(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new AppError(ERR.VALIDATION, '参数格式不正确', 422)
    }
    const entries = Object.entries(values)
    if (!entries.length) throw new AppError(ERR.VALIDATION, '没有需要保存的参数', 422)
    const validated = entries.map(([key, raw]) => {
      if (!SETTING_MAP.has(key)) {
        throw new AppError(ERR.VALIDATION, `未知参数：${key}`, 422, { fields: { [key]: '未知参数' } })
      }
      let value
      if (SETTING_MAP.get(key).type === 'integer') {
        value = integer(raw, key, SETTING_MAP.get(key).label, { min: 0, max: 3650 })
      } else if (SETTING_MAP.get(key).type === 'boolean') {
        value = booleanValue(raw, key, SETTING_MAP.get(key).label)
      } else {
        value = String(raw ?? '').trim()
        if (!value || value.length > 80) {
          throw new AppError(ERR.VALIDATION, '图书馆名称不能为空', 422, {
            fields: { [key]: '图书馆名称不能为空' },
          })
        }
      }
      return [key, String(value)]
    })
    const now = clock().toISOString()
    transaction(db, () => {
      const update = db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?')
      for (const [key, value] of validated) update.run(value, now, key)
    })
    return getAll()
  }

  function seedDefaults() {
    const now = clock().toISOString()
    const insert = db.prepare(
      `INSERT OR IGNORE INTO settings (key, value, type, label, description, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const item of DEFAULT_SETTINGS) {
      insert.run(item.key, item.value, item.type, item.label, item.description, now)
    }
  }

  return { getAll, get, update, seedDefaults }
}
