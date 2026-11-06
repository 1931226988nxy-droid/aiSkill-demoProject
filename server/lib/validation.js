/**
 * 文件职责：服务端字段校验、ISBN 校验、金额转换和 LIKE 转义。
 */

import { AppError, ERR } from '../domain/errors.js'
import { isValidDateOnly } from './time.js'

function invalid(field, message) {
  throw new AppError(ERR.VALIDATION, message, 422, { fields: { [field]: message } })
}

export function requiredString(value, field, label, { min = 1, max = 200 } = {}) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length < min) invalid(field, `${label}不能为空`)
  if (text.length > max) invalid(field, `${label}不能超过 ${max} 个字符`)
  return text
}

export function optionalString(value, field, label, { max = 2000 } = {}) {
  if (value == null) return ''
  if (typeof value !== 'string') invalid(field, `${label}格式不正确`)
  const text = value.trim()
  if (text.length > max) invalid(field, `${label}不能超过 ${max} 个字符`)
  return text
}

export function integer(value, field, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (!Number.isInteger(number) || number < min || number > max) {
    invalid(field, `${label}必须是 ${min} 到 ${max} 之间的整数`)
  }
  return number
}

export function optionalInteger(value, field, label, options = {}) {
  if (value == null || value === '') return null
  return integer(value, field, label, options)
}

export function booleanValue(value, field, label) {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  invalid(field, `${label}必须是布尔值`)
}

export function enumValue(value, field, label, allowed) {
  if (!allowed.includes(value)) invalid(field, `${label}不在允许范围内`)
  return value
}

export function username(value) {
  const text = requiredString(value, 'username', '用户名', { min: 3, max: 32 })
  if (!/^[A-Za-z0-9_]+$/.test(text)) invalid('username', '用户名只能包含字母、数字和下划线')
  return text
}

export function password(value, field = 'password') {
  const text = String(value || '')
  if (text.length < 8) invalid(field, '密码至少需要 8 个字符')
  if (text.length > 72) invalid(field, '密码不能超过 72 个字符')
  return text
}

export function optionalPhone(value, field = 'phone') {
  const text = optionalString(value, field, '手机号', { max: 20 })
  if (text && !/^1[3-9]\d{9}$/.test(text)) invalid(field, '手机号格式不正确')
  return text
}

export function optionalEmail(value, field = 'email') {
  const text = optionalString(value, field, '邮箱', { max: 120 })
  if (text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) invalid(field, '邮箱格式不正确')
  return text
}

export function optionalIdCard(value, field = 'idCard') {
  const text = optionalString(value, field, '身份证号', { max: 18 })
  if (text && !/^(\d{15}|\d{17}[\dXx])$/.test(text)) invalid(field, '身份证号格式不正确')
  return text ? text.toUpperCase() : ''
}

export function optionalDateOnly(value, field, label) {
  if (value == null || value === '') return null
  const text = String(value)
  if (!isValidDateOnly(text)) invalid(field, `${label}格式应为 YYYY-MM-DD`)
  return text
}

export function normalizeIsbn(value) {
  // 去掉空格/连字符后，ISBN-10 做加权校验，ISBN-13 做 1/3 交替加权校验。
  const text = String(value || '').replace(/[\s-]/g, '').toUpperCase()
  if (!/^(?:\d{9}[\dX]|\d{13})$/.test(text)) return null
  if (text.length === 10) {
    let sum = 0
    for (let index = 0; index < 10; index += 1) {
      const char = text[index]
      const digit = char === 'X' ? 10 : Number(char)
      if (!Number.isInteger(digit)) return null
      sum += (10 - index) * digit
    }
    return sum % 11 === 0 ? text : null
  }
  let sum = 0
  for (let index = 0; index < 13; index += 1) {
    sum += Number(text[index]) * (index % 2 === 0 ? 1 : 3)
  }
  return sum % 10 === 0 ? text : null
}

export function isbn(value) {
  const normalized = normalizeIsbn(value)
  if (!normalized) invalid('isbn', 'ISBN 校验失败，请输入有效的 ISBN-10 或 ISBN-13')
  return normalized
}

export function moneyToCents(value, field = 'price', label = '金额', { max = 100_000_000 } = {}) {
  // 金额 API 用元，数据库用分；四舍五入到整数分，避免浮点累计误差。
  const amount = typeof value === 'string' && value.trim() === '' ? 0 : Number(value)
  if (!Number.isFinite(amount) || amount < 0 || amount > max) invalid(field, `${label}格式不正确`)
  return Math.round(amount * 100)
}

export function formatCents(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2))
}

export function escapeLike(value) {
  // 配合 SQL 的 ESCAPE '\' 使用，避免用户输入的 %/_ 变成通配符。
  return String(value || '').replace(/[\\%_]/g, (char) => `\\${char}`)
}

export function assertFound(value, code, message) {
  if (!value) throw new AppError(code, message, 404)
  return value
}
