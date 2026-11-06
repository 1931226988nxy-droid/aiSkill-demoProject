/**
 * 文件职责：scrypt 密码哈希、会话令牌和读者编号生成。
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

export function hashPassword(password) {
  // 每个密码使用独立随机盐；存储格式：scrypt$salt$hash。
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  const [algorithm, salt, expected] = String(stored || '').split('$')
  if (algorithm !== 'scrypt' || !salt || !expected) return false
  const actual = scryptSync(String(password), salt, KEY_LENGTH)
  const expectedBuffer = Buffer.from(expected, 'hex')
  // 恒定时间比较，降低通过响应时间猜测哈希的风险。
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
}

export function createSessionToken() {
  // 只把随机令牌返回给客户端，数据库存 SHA-256，数据库泄露也不能直接复用会话。
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

export function createReaderNumber(sequence = Date.now()) {
  const suffix = String(sequence).padStart(6, '0').slice(-6)
  return `R${new Date().getFullYear()}${suffix}`
}
