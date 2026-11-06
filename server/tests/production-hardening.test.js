import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest, createTestContext, login, startTestServer } from './helpers.js'
import { seedDatabase } from '../db/seed.js'
import { loadConfig } from '../config.js'
import fs from 'node:fs'
import { openDatabase } from '../db/index.js'
import { runMigrations } from '../db/migrate.js'

async function withServer(work) {
  const context = createTestContext()
  const server = await startTestServer(context)
  try { await work(context, server.base) }
  finally { await server.close(); context.close() }
}

test('空权限角色不获取全馆统计或读者数据，单独菜单权限可见入口', async () => {
  await withServer(async ({ services }, base) => {
    const admin = (await services.auth.login({ username: 'admin', password: 'admin123' })).user
    const role = services.admin.createRole({ code: 'restricted_staff', name: '受限账号' }, admin)
    services.admin.createUser({ username: 'restricted', password: 'ReviewPass123', displayName: '受限账号', roleCodes: [role.code] }, admin)
    const session = await login(base, 'restricted', 'ReviewPass123')
    const dashboard = await apiRequest(base, '/api/dashboard', { cookie: session.cookie })
    assert.equal(dashboard.status, 200)
    assert.deepEqual(dashboard.data.stats, [])
    assert.deepEqual(dashboard.data.overview, {})
    assert.deepEqual(dashboard.data.alerts, { overdue: [], readyReservations: [] })
    services.admin.setRolePermissions(role.id, ['menu.manage'], admin)
    const menus = services.navigation.forPermissions(['menu.manage'])
    assert.ok(JSON.stringify(menus).includes('/system/access'))
  })
})

test('撤销读者权限后查询和自助写入均拒绝，重启播种不恢复权限', async () => {
  await withServer(async ({ services, db }, base) => {
    const admin = (await services.auth.login({ username: 'admin', password: 'admin123' })).user
    const role = services.admin.listRoles().find((item) => item.code === 'reader')
    services.admin.setRolePermissions(role.id, ['book.read'], admin)
    seedDatabase(db)
    assert.deepEqual(services.admin.listRoles().find((item) => item.id === role.id).permissions, ['book.read'])
    const reader = await login(base, 'reader', 'reader123')
    for (const path of ['/my/loans', '/my/fees', '/my/reservations']) {
      assert.equal((await apiRequest(base, '/api' + path, { cookie: reader.cookie })).status, 403)
    }
    for (const path of ['/reservations', '/reservations/1/cancel', '/circulation/loans/1/renew']) {
      assert.equal((await apiRequest(base, '/api' + path, { method: 'POST', cookie: reader.cookie, body: { bookId: 8 } })).status, 403)
    }
    const dashboard = await apiRequest(base, '/api/dashboard', { cookie: reader.cookie })
    assert.deepEqual(dashboard.data.loans, [])
    assert.deepEqual(dashboard.data.reservations, [])
    assert.deepEqual(dashboard.data.stats.map((item) => item.key), ['unreadNotifications'])
  })
})

test('借还权限不暴露完整身份证，读者管理详情保留授权读取', async () => {
  await withServer(async ({ services }, base) => {
    const admin = (await services.auth.login({ username: 'admin', password: 'admin123' })).user
    const role = services.admin.createRole({ code: 'circ_only', name: '仅借还' }, admin)
    services.admin.setRolePermissions(role.id, ['circulation.manage'], admin)
    services.admin.createUser({ username: 'circ_only', password: 'ReviewPass123', displayName: '仅借还', roleCodes: [role.code] }, admin)
    const circ = await login(base, 'circ_only', 'ReviewPass123')
    const lookup = await apiRequest(base, '/api/readers/lookup?readerNo=R20260001', { cookie: circ.cookie })
    assert.equal(lookup.status, 200)
    assert.match(lookup.data.idCard, /\*/)
    assert.match(lookup.data.phone, /\*/)
    const preview = await apiRequest(base, '/api/circulation/borrow/preview', { cookie: circ.cookie, method: 'POST', body: { readerNo: 'R20260001', barcode: 'LIB-01-001' } })
    assert.equal(preview.status, 200)
    assert.match(preview.data.reader.idCard, /\*/)
    const adminSession = await login(base, 'admin', 'admin123')
    const detail = await apiRequest(base, '/api/readers/lookup?readerNo=R20260001', { cookie: adminSession.cookie })
    assert.ok(detail.data.idCard && !detail.data.idCard.includes('*'))
  })
})

test('密码首尾空格可登录；账号停用后旧会话永久失效；空闲会话过期', async () => {
  await withServer(async (context, base) => {
    const { services } = context
    const admin = (await services.auth.login({ username: 'admin', password: 'admin123' })).user
    const user = services.admin.createUser({ username: 'space_pass', password: ' ReviewPass123 ', displayName: '空格密码', roleCodes: ['reader'] }, admin)
    const session = await login(base, 'space_pass', ' ReviewPass123 ')
    services.admin.updateUser(user.id, { status: 'disabled' }, admin)
    services.admin.updateUser(user.id, { status: 'active' }, admin)
    assert.equal((await apiRequest(base, '/api/auth/me', { cookie: session.cookie })).status, 401)
    const next = await login(base, 'space_pass', ' ReviewPass123 ')
    context.state.now = new Date(context.state.now.getTime() + 31 * 60_000)
    assert.equal((await apiRequest(base, '/api/auth/me', { cookie: next.cookie })).status, 401)
  })
})

test('登录限流返回 429 与重试时间，窗口结束后可重新登录', async () => {
  await withServer(async (context, base) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal((await apiRequest(base, '/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'incorrect' } })).status, 401)
    }
    const blocked = await apiRequest(base, '/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.response.headers.get('Retry-After')) > 0)
    context.state.now = new Date(context.state.now.getTime() + 16 * 60_000)
    assert.equal((await apiRequest(base, '/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })).status, 200)
  })
})

test('异步注册和修改密码保持接口契约，修改密码撤销其他会话', async () => {
  await withServer(async (context, base) => {
    const register = await apiRequest(base, '/api/auth/register', { method: 'POST', body: { username: 'registered_async', password: ' NewPass123 ', displayName: '异步注册', email: 'review@example.test' } })
    assert.equal(register.status, 201)
    const firstCookie = register.response.headers.get('set-cookie').split(';')[0]
    const second = await login(base, 'registered_async', ' NewPass123 ')
    const changed = await apiRequest(base, '/api/auth/password', { cookie: second.cookie, method: 'POST', body: { oldPassword: ' NewPass123 ', newPassword: 'NextPass123' } })
    assert.equal(changed.status, 200)
    assert.equal((await apiRequest(base, '/api/auth/me', { cookie: firstCookie })).status, 401)
    assert.equal((await apiRequest(base, '/api/auth/me', { cookie: second.cookie })).status, 200)
    await login(base, 'registered_async', 'NextPass123')
    const foreignOrigin = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(foreignOrigin.status, 403)
    assert.equal(register.response.headers.get('cache-control'), 'no-store')
  })
})

test('旧版数据库升级补齐费率和版本，重复迁移不覆盖快照', () => {
  const db = openDatabase(':memory:')
  try {
    db.exec('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
    for (const name of ['001_initial', '002_rbac_menus', '003_overdue_fee_installments']) {
      db.exec(fs.readFileSync(new URL(`../db/migrations/${name}.sql`, import.meta.url), 'utf8'))
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, new Date().toISOString())
    }
    seedDatabase(db)
    db.prepare("UPDATE settings SET value = '75' WHERE key = 'fine_per_day_cents'").run()
    runMigrations(db)
    assert.equal(db.prepare('SELECT fine_rate_cents FROM loans LIMIT 1').get().fine_rate_cents, 75)
    assert.equal(db.prepare('SELECT version FROM books LIMIT 1').get().version, 1)
    db.prepare("UPDATE settings SET value = '100' WHERE key = 'fine_per_day_cents'").run()
    runMigrations(db)
    assert.equal(db.prepare('SELECT fine_rate_cents FROM loans LIMIT 1').get().fine_rate_cents, 75)
  } finally { db.close() }
})

test('调价不追溯旧借阅，新借阅保存新费率，结清金额不被再次追收', async () => {
  const context = createTestContext()
  try {
    const { services, db, state } = context
    const admin = (await services.auth.login({ username: 'admin', password: 'admin123' })).user
    const loan = db.prepare('SELECT * FROM loans WHERE returned_at IS NULL AND due_at < ?').get(state.now.toISOString())
    const oldFee = services.circulation.syncOverdueFee(loan, state.now)
    services.fees.handle(oldFee.id, { action: 'settle', note: '已收现金' }, admin)
    services.settings.update({ fine_per_day_cents: 100 })
    assert.equal(services.circulation.syncOverdueFee(loan, state.now), null)
    const newLoan = services.circulation.borrow({ readerNo: 'R20260001', barcode: 'LIB-01-001' }, admin)
    assert.equal(db.prepare('SELECT fine_rate_cents FROM loans WHERE id = ?').get(newLoan.id).fine_rate_cents, 100)
    context.advance(2)
    const extra = services.circulation.syncOverdueFee(loan, state.now)
    assert.equal(extra.amount_cents, 100)
  } finally { context.close() }
})

test('并发旧表单保存返回冲突，不覆盖新内容；CSV 分类公式按文本输出', async () => {
  const context = createTestContext()
  try {
    const { services } = context
    const admin = (await services.auth.login({ username: 'admin', password: 'admin123' })).user
    const book = services.catalog.getBook(1)
    const updated = services.catalog.updateBook(book.id, { version: book.version, title: '新标题' }, admin)
    assert.equal(updated.version, book.version + 1)
    assert.throws(() => services.catalog.updateBook(book.id, { version: book.version, title: '旧表单覆盖' }, admin), (error) => error.status === 409)
    assert.equal(services.catalog.getBook(book.id).title, '新标题')
    services.catalog.updateCategory(book.categoryId, { name: '=1+1' }, admin)
    const csv = services.reports.exportCsv()
    assert.ok(csv.includes('"\t=1+1",'))
    assert.ok(!csv.split('\r\n').some((line) => line.startsWith('=1+1,')))
  } finally { context.close() }
})

test('生产配置要求独立数据库和安全 Cookie，拒绝演示库', () => {
  assert.throws(() => loadConfig({ argv: ['--production'], env: {} }), /DB_PATH/)
  assert.throws(() => loadConfig({ argv: ['--production'], env: { DB_PATH: 'prod.db', COOKIE_SECURE: 'false' } }), /COOKIE_SECURE/)
  assert.equal(loadConfig({ argv: ['--production'], env: { DB_PATH: 'prod.db' } }).cookieSecure, true)
  const context = createTestContext()
  try { assert.throws(() => seedDatabase(context.db, { demo: false }), /演示/)}
  finally { context.close() }
})

test('健康检查真实访问数据库，运维统计需要授权', async () => {
  await withServer(async ({ services }, base) => {
    assert.equal((await apiRequest(base, '/api/health')).status, 200)
    const reader = await login(base, 'reader', 'reader123')
    assert.equal((await apiRequest(base, '/api/admin/operations', { cookie: reader.cookie })).status, 403)
    const admin = await login(base, 'admin', 'admin123')
    const metrics = await apiRequest(base, '/api/admin/operations', { cookie: admin.cookie })
    assert.equal(metrics.status, 200)
    assert.ok(metrics.data.requests >= 3)
    const prepare = services.db.prepare.bind(services.db)
    services.db.prepare = () => { throw new Error('unavailable') }
    assert.equal((await apiRequest(base, '/api/health')).status, 503)
    assert.equal((await apiRequest(base, '/api/health', { cookie: admin.cookie })).status, 503)
    assert.equal((await apiRequest(base, '/api/health/live', { cookie: admin.cookie })).status, 200)
    services.db.prepare = prepare
  })
})

test('后台通知轮询不延长空闲会话，真实业务请求会更新活跃时间', async () => {
  await withServer(async (context, base) => {
    const reader = await login(base, 'reader', 'reader123')
    for (let minute = 1; minute <= 29; minute += 1) {
      context.state.now = new Date(context.state.now.getTime() + 60_000)
      assert.equal((await apiRequest(base, '/api/notifications/unread-count', { cookie: reader.cookie })).status, 200)
    }
    context.state.now = new Date(context.state.now.getTime() + 60_000)
    assert.equal((await apiRequest(base, '/api/notifications/unread-count', { cookie: reader.cookie })).status, 401)
    const next = await login(base, 'reader', 'reader123')
    context.state.now = new Date(context.state.now.getTime() + 20 * 60_000)
    assert.equal((await apiRequest(base, '/api/my/loans', { cookie: next.cookie })).status, 200)
    context.state.now = new Date(context.state.now.getTime() + 20 * 60_000)
    assert.equal((await apiRequest(base, '/api/my/loans', { cookie: next.cookie })).status, 200)
  })
})

test('注册接口拒绝对象或数组形式的密码', async () => {
  await withServer(async (context, base) => {
    for (const password of [{ value: 'password123' }, ['password123'], 123456789]) {
      const result = await apiRequest(base, '/api/auth/register', { method: 'POST', body: { username: 'invalid_password', password, displayName: '测试', email: 'review@example.test' } })
      assert.equal(result.status, 422)
    }
  })
})
