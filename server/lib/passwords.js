import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  const [algorithm, salt, expected] = String(stored || '').split('$')
  if (algorithm !== 'scrypt' || !salt || !expected) return false
  const actual = scryptSync(String(password), salt, KEY_LENGTH)
  const expectedBuffer = Buffer.from(expected, 'hex')
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

export function createReaderNumber(sequence = Date.now()) {
  const suffix = String(sequence).padStart(6, '0').slice(-6)
  return `R${new Date().getFullYear()}${suffix}`
}
