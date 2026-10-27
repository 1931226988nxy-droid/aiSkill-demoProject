import { createHttpClient } from '@jcc/shared/api'

let unauthorizedHandler = null

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

export const request = createHttpClient({
  baseURL: '/api',
  onUnauthorized: async () => {
    unauthorizedHandler?.()
  },
})

export function getErrorMessage(error) {
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
