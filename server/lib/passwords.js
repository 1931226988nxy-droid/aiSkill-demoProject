/**
 * 文件职责：scrypt 密码哈希、会话令牌和读者编号生成。
 */

import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { AppError } from '../domain/errors.js'

const KEY_LENGTH = 64
const derive = promisify(scrypt)
let activeDerivations = 0

async function deriveAsync(value, salt) {
  if (activeDerivations >= 4) throw new AppError('AUTH_BUSY', '认证服务繁忙，请稍后重试', 503)
  activeDerivations += 1
  try { return await derive(value, salt, KEY_LENGTH) }
  finally { activeDerivations -= 1 }
}

export async function hashPasswordAsync(password) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${(await deriveAsync(password, salt)).toString('hex')}`
}

export async function verifyPasswordAsync(password, stored) {
  const [algorithm, salt, expected] = String(stored || '').split('$')
  const valid = algorithm === 'scrypt' && /^[a-f0-9]{32}$/i.test(salt || '') && /^[a-f0-9]{128}$/i.test(expected || '')
  const actual = await deriveAsync(String(password), valid ? salt : '0'.repeat(32))
  const expectedBuffer = Buffer.from(valid ? expected : '0'.repeat(128), 'hex')
  return valid && timingSafeEqual(actual, expectedBuffer)
}

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
