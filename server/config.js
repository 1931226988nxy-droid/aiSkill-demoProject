/**
 * 文件职责：读取端口、数据库路径、生产模式和 Cookie Secure 等运行配置。
 */

import path from 'node:path'

export function loadConfig({ argv = process.argv, env = process.env } = {}) {
  const production = argv.includes('--production') || env.NODE_ENV === 'production'
  if (production && !env.DB_PATH) throw new Error('生产环境必须显式设置独立的 DB_PATH')
  if (production && env.COOKIE_SECURE === 'false') throw new Error('生产环境必须启用 COOKIE_SECURE')
  return {
    production,
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH || path.resolve(process.cwd(), 'data', 'library.db'),
    staticDir: path.resolve(process.cwd(), 'dist'),
    cookieSecure: production || env.COOKIE_SECURE === 'true',
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY.split(',').map((value) => value.trim()).filter(Boolean) : false,
    sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
    initialAdminUsername: env.INITIAL_ADMIN_USERNAME || 'admin',
    initialAdminPassword: env.INITIAL_ADMIN_PASSWORD || '',
  }
}
