/**
 * 文件职责：请求 ID、API 404 与统一错误响应。
 */

import { randomUUID } from 'node:crypto'
import { AppError, ERR } from '../domain/errors.js'
import { isUniqueConstraint } from '../lib/transaction.js'

export function requestIdMiddleware(req, res, next) {
  const supplied = req.headers['x-request-id']
  req.requestId = typeof supplied === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(supplied) ? supplied : randomUUID()
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
  // 把框架层的 JSON 解析错误和数据库唯一约束转成稳定的业务错误码。
  if (error?.type === 'entity.parse.failed') {
    normalized = new AppError(ERR.VALIDATION, '请求体不是合法的 JSON', 400)
  } else if (error?.type === 'entity.too.large') {
    normalized = new AppError(ERR.VALIDATION, '请求体过大', 413)
  } else if (/database is (locked|busy)/i.test(error?.message || '')) {
    normalized = new AppError('DATABASE_BUSY', '数据库繁忙，请稍后重试', 503)
  } else if (isUniqueConstraint(error)) {
    normalized = new AppError(ERR.CONFLICT, '数据已存在，请检查唯一字段', 409)
  }
  if (!(normalized instanceof AppError)) {
    // 未预期异常只在服务端日志打印堆栈，响应不泄露内部细节。
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
