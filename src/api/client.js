/**
 * 文件职责：基于共享 createHttpClient 的请求客户端与错误文案。
 */

import { createHttpClient } from '@jcc/shared/api'

let unauthorizedHandler = null

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

export const request = createHttpClient({
  baseURL: '/api',
  // 统一会话失效处理：由 main.js 注册跳转登录，避免每个页面重复判断 401。
  onUnauthorized: async () => {
    unauthorizedHandler?.()
  },
})

export function getErrorMessage(error) {
  // 优先展示后端字段级错误，其次才是通用 message，表单错误定位更准确。
  const fieldErrors = error?.details?.fields
  if (fieldErrors && typeof fieldErrors === 'object') {
    const first = Object.values(fieldErrors)[0]
    if (typeof first === 'string' && first) return first
  }
  return error?.message || '操作失败，请稍后重试'
}

export function getErrorCode(error) {
  return error?.details?.code || error?.code || ''
}
