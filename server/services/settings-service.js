/**
 * 文件职责：系统参数读取和整批校验后的事务更新。
 */

import { AppError, ERR } from '../domain/errors.js'
import { DEFAULT_SETTINGS } from '../domain/constants.js'
import { integer, booleanValue } from '../lib/validation.js'
import { transaction } from '../lib/transaction.js'

const SETTING_MAP = new Map(DEFAULT_SETTINGS.map((item) => [item.key, item]))

// 数据库统一存字符串，按 DEFAULT_SETTINGS 声明的类型还原为整数/布尔值。
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
    // 先铺默认值再用数据库覆盖，升级新增参数时即使未写库也能返回完整配置。
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
    // 先校验完所有字段再开事务，避免一个参数非法时同批次其他参数已被写入。
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
    // OR IGNORE 只补缺失参数，不覆盖管理员已保存的配置。
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
