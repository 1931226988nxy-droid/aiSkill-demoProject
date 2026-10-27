import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest, createTestContext, login, startTestServer } from './helpers.js'

test('认证与角色权限由后端独立校验', async () => {
  const context = createTestContext()
  const server = await startTestServer(context)
  try {
    const anonymous = await apiRequest(server.base, '/api/books')
    assert.equal(anonymous.status, 401)
    assert.equal(anonymous.data.code, 'AUTH_REQUIRED')

    const reader = await login(server.base, 'reader', 'reader123')
    const readerAdmin = await apiRequest(server.base, '/api/admin/users', {
      cookie: reader.cookie,
    })
    assert.equal(readerAdmin.status, 403)
    assert.equal(readerAdmin.data.code, 'FORBIDDEN')
    const readerCirculation = await apiRequest(server.base, '/api/circulation/loans', {
      cookie: reader.cookie,
    })
    assert.equal(readerCirculation.status, 403)
    const readerCreateBook = await apiRequest(server.base, '/api/books', {
      cookie: reader.cookie,
      method: 'POST',
      body: { title: '越权创建' },
    })
    assert.equal(readerCreateBook.status, 403)

    const librarian = await login(server.base, 'librarian', 'lib123456')
    const readers = await apiRequest(server.base, '/api/readers', { cookie: librarian.cookie })
    assert.equal(readers.status, 200)
    const librarianUsers = await apiRequest(server.base, '/api/admin/users', {
      cookie: librarian.cookie,
    })
    assert.equal(librarianUsers.status, 403)
    const librarianAudit = await apiRequest(server.base, '/api/admin/audit-logs', {
      cookie: librarian.cookie,
    })
    assert.equal(librarianAudit.status, 403)
    const report = await apiRequest(server.base, '/api/reports/summary', {
      cookie: librarian.cookie,
    })
    assert.equal(report.status, 200)

    const admin = await login(server.base, 'admin', 'admin123')
    const adminUsers = await apiRequest(server.base, '/api/admin/users', {
      cookie: admin.cookie,
    })
    assert.equal(adminUsers.status, 200)
    const audit = await apiRequest(server.base, '/api/admin/audit-logs', {
      cookie: admin.cookie,
    })
    assert.equal(audit.status, 200)
  } finally {
    await server.close()
    context.close()
  }
})

test('读者只能查看自己的费用并只能取消自己的预约', async () => {
  const context = createTestContext()
  const server = await startTestServer(context)
  try {
    const reader1 = await login(server.base, 'reader', 'reader123')
    const reader2 = await login(server.base, 'reader2', 'reader123')
    const fees1 = await apiRequest(server.base, '/api/my/fees?page=1&pageSize=50', {
      cookie: reader1.cookie,
    })
    assert.equal(fees1.status, 200)
    assert.equal(fees1.data.items.every((item) => item.readerNo === 'R20260001'), true)
    const fees2 = await apiRequest(server.base, '/api/my/fees?page=1&pageSize=50', {
      cookie: reader2.cookie,
    })
    assert.equal(fees2.status, 200)
    assert.equal(fees2.data.items.every((item) => item.readerNo === 'R20260002'), true)

    const reservations = await apiRequest(server.base, '/api/my/reservations', {
      cookie: reader1.cookie,
    })
    assert.equal(reservations.status, 200)
    assert.ok(reservations.data.items.length > 0)
    const otherCancel = await apiRequest(
      server.base,
      `/api/reservations/${reservations.data.items[0].id}/cancel`,
      { cookie: reader2.cookie, method: 'POST', body: {} },
    )
    assert.equal(otherCancel.status, 403)
  } finally {
    await server.close()
    context.close()
  }
})
