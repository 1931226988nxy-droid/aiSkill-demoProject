/**
 * 文件职责：轻量 Cookie 解析与安全会话 Cookie 序列化。
 */

export function parseCookies(header = '') {
  const result = {}
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!key) continue
    try {
      result[key] = decodeURIComponent(value)
    } catch {
      result[key] = value
    }
  }
  return result
}

export function sessionCookie(token, { secure = false, maxAge = 7 * 24 * 60 * 60 } = {}) {
  // HttpOnly 防 XSS 读取，SameSite=Strict 防跨站携带；HTTPS 部署时通过 secure 追加 Secure。
  return [
    `lib_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

export function clearSessionCookie() {
  return 'lib_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
}
