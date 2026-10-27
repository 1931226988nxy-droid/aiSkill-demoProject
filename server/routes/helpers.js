import { AppError, ERR } from '../domain/errors.js'

export function numericId(value, label = '编号') {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(ERR.VALIDATION, `${label}格式不正确`, 422)
  }
  return id
}

export function requestContext(req) {
  return {
    actor: req.auth?.user || null,
    ip: req.ip || '',
  }
}
