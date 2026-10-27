import { randomUUID } from 'node:crypto'
import { AppError, ERR } from '../domain/errors.js'
import { isUniqueConstraint } from '../lib/transaction.js'

export function requestIdMiddleware(req, res, next) {
  req.requestId = req.headers['x-request-id'] || randomUUID()
  res.setHeader('X-Request-Id', req.requestId)
  next()
}

export function apiNotFound(req, res) {
  res.status(404).json({
    code: ERR.NOT_FOUND,
    message: '接口不存在',
    details: null,
    requestId: req.requestId,
  })
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  let normalized = error
  if (error?.type === 'entity.parse.failed') {
    normalized = new AppError(ERR.VALIDATION, '请求体不是合法的 JSON', 400)
  } else if (isUniqueConstraint(error)) {
    normalized = new AppError(ERR.CONFLICT, '数据已存在，请检查唯一字段', 409)
  }
  if (!(normalized instanceof AppError)) {
    console.error(`[${req.requestId}]`, error)
    normalized = new AppError('INTERNAL_ERROR', '服务器内部错误，请稍后重试', 500)
  }
  res.status(normalized.status).json({
    code: normalized.code,
    message: normalized.message,
    details: normalized.details || null,
    requestId: req.requestId,
  })
}
