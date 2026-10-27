import { createApp } from '../app.js'
import { openDatabase } from '../db/index.js'
import { runMigrations } from '../db/migrate.js'
import { seedDatabase } from '../db/seed.js'
import { createServices } from '../services/index.js'
import { runAutomatedJobs } from '../services/jobs.js'

export function createTestContext({ seed = true, now = '2026-10-27T02:00:00.000Z' } = {}) {
  const state = { now: new Date(now) }
  const clock = () => new Date(state.now)
  const db = openDatabase(':memory:')
  runMigrations(db)
  if (seed) seedDatabase(db, { clock })
  const services = createServices({ db, clock })
  services.runJobs = () =>
    runAutomatedJobs({
      db,
      circulation: services.circulation,
      settings: services.settings,
      notifications: services.notifications,
      clock,
    })
  services.runJobs()
  const app = createApp({
    db,
    services,
    config: { cookieSecure: false, sessionMaxAgeSeconds: 7 * 24 * 60 * 60 },
    clock,
  })
  return {
    db,
    services,
    app,
    state,
    advance(days = 0) {
      state.now = new Date(state.now.getTime() + days * 24 * 60 * 60 * 1000)
    },
    close() {
      db.close()
    },
  }
}

export async function startTestServer(context) {
  const server = context.app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

export async function apiRequest(base, path, { cookie = '', method = 'GET', body } = {}) {
  const headers = {}
  if (cookie) headers.Cookie = cookie
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { response, status: response.status, data }
}

export async function login(base, username, password) {
  const result = await apiRequest(base, '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  if (result.status !== 200) throw new Error(`登录失败: ${JSON.stringify(result.data)}`)
  const setCookie = result.response.headers.get('set-cookie') || ''
  return {
    cookie: setCookie.split(';')[0],
    user: result.data.user,
    permissions: result.data.permissions,
  }
}

export function staffActor(username = 'librarian', password = 'lib123456') {
  return { id: username === 'admin' ? 1 : 2, username, displayName: username, role: { code: username } }
}
