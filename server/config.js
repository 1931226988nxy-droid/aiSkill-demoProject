import path from 'node:path'

export function loadConfig({ argv = process.argv, env = process.env } = {}) {
  const production = argv.includes('--production') || env.NODE_ENV === 'production'
  return {
    production,
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH || path.resolve(process.cwd(), 'data', 'library.db'),
    staticDir: path.resolve(process.cwd(), 'dist'),
    cookieSecure: env.COOKIE_SECURE === 'true',
    sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
    initialAdminUsername: env.INITIAL_ADMIN_USERNAME || 'admin',
    initialAdminPassword: env.INITIAL_ADMIN_PASSWORD || '',
  }
}
