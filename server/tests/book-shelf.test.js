import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest, createTestContext, login, startTestServer } from './helpers.js'

function testIsbn(prefix) {
  const sum = [...prefix].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0)
  return `${prefix}${(10 - (sum % 10)) % 10}`
}

test('图书重新上架只恢复随书下架的副本，读者可再次检索', async () => {
  const context = createTestContext()
  const server = await startTestServer(context)
  try {
    const staff = await login(server.base, 'librarian', 'lib123456')
    const reader = await login(server.base, 'reader', 'reader123')
    const isbn = testIsbn('978000000019')
    const created = await apiRequest(server.base, '/api/books', {
      cookie: staff.cookie,
      method: 'POST',
      body: { isbn, title: '上下架回归测试', authors: ['测试作者'], categoryId: 1 },
    })
    assert.equal(created.status, 201)
    const bookId = created.data.id
    const available = context.services.catalog.createCopy(
      bookId, { barcode: 'SHELF-A-001', location: '测试区' }, staff.user,
    )
    const repair = context.services.catalog.createCopy(
      bookId, { barcode: 'SHELF-R-001', location: '测试区' }, staff.user,
    )
    context.services.catalog.updateCopyStatus(
      repair.id, { status: 'repair', reason: '封面破损待修复' }, staff.user,
    )
    const individuallyClosed = context.services.catalog.createCopy(
      bookId, { barcode: 'SHELF-O-001', location: '测试区', status: 'off_shelf' }, staff.user,
    )
    const adjustedAfterClosing = context.services.catalog.createCopy(
      bookId, { barcode: 'SHELF-C-001', location: '测试区' }, staff.user,
    )

    const closed = await apiRequest(server.base, `/api/books/${bookId}/off-shelf`, {
      cookie: staff.cookie, method: 'POST', body: { reason: '调整馆藏陈列' },
    })
    assert.equal(closed.status, 200)
    assert.equal(closed.data.status, 'off_shelf')
    assert.equal(context.services.catalog.getCopy(available.id).status, 'off_shelf')
    assert.equal(context.services.catalog.getCopy(repair.id).status, 'off_shelf')
    context.services.catalog.updateCopyStatus(
      adjustedAfterClosing.id, { status: 'repair', reason: '临时检查' }, staff.user,
    )
    context.services.catalog.updateCopyStatus(
      adjustedAfterClosing.id, { status: 'off_shelf', reason: '调整馆藏陈列' }, staff.user,
    )
    const hidden = await apiRequest(server.base, `/api/books?isbn=${isbn}`, {
      cookie: reader.cookie,
    })
    assert.equal(hidden.data.total, 0)

    const denied = await apiRequest(server.base, `/api/books/${bookId}/on-shelf`, {
      cookie: reader.cookie, method: 'POST', body: {},
    })
    assert.equal(denied.status, 403)
    const reopened = await apiRequest(server.base, `/api/books/${bookId}/on-shelf`, {
      cookie: staff.cookie, method: 'POST', body: {},
    })
    assert.equal(reopened.status, 200)
    assert.equal(reopened.data.status, 'active')
    assert.equal(reopened.data.availableCopies, 1)
    assert.equal(context.services.catalog.getCopy(available.id).status, 'available')
    assert.equal(context.services.catalog.getCopy(repair.id).status, 'repair')
    assert.equal(context.services.catalog.getCopy(repair.id).conditionNote, '封面破损待修复')
    assert.equal(context.services.catalog.getCopy(individuallyClosed.id).status, 'off_shelf')
    assert.equal(context.services.catalog.getCopy(adjustedAfterClosing.id).status, 'off_shelf')
    const visible = await apiRequest(server.base, `/api/books?isbn=${isbn}`, {
      cookie: reader.cookie,
    })
    assert.equal(visible.data.total, 1)
    const audit = context.db.prepare(
      "SELECT details FROM audit_logs WHERE action = 'book.on_shelf' AND object_id = ?",
    ).get(String(bookId))
    assert.equal(JSON.parse(audit.details).restoredCopies, 2)

    const repeated = await apiRequest(server.base, `/api/books/${bookId}/on-shelf`, {
      cookie: staff.cookie, method: 'POST', body: {},
    })
    assert.equal(repeated.status, 200)
    assert.equal(context.db.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'book.on_shelf' AND object_id = ?",
    ).get(String(bookId)).count, 1)
  } finally {
    await server.close()
    context.close()
  }
})

test('旧下架审计没有副本快照时仍可从状态日志恢复', () => {
  const context = createTestContext()
  try {
    const actor = context.services.auth.login({ username: 'librarian', password: 'lib123456' }).user
    const book = context.services.catalog.createBook({
      isbn: testIsbn('978000000020'), title: '旧数据恢复测试', authors: ['测试作者'], categoryId: 1,
    }, actor)
    const copy = context.services.catalog.createCopy(
      book.id, { barcode: 'SHELF-OLD-001', location: '测试区' }, actor,
    )
    context.services.catalog.offShelfBook(book.id, '旧版下架原因', actor)
    const audit = context.db.prepare(
      "SELECT id, details FROM audit_logs WHERE action = 'book.off_shelf' AND object_id = ?",
    ).get(String(book.id))
    const details = JSON.parse(audit.details)
    delete details.closedCopyStates
    context.db.prepare('UPDATE audit_logs SET details = ? WHERE id = ?').run(JSON.stringify(details), audit.id)

    const reopened = context.services.catalog.onShelfBook(book.id, actor)
    assert.equal(reopened.status, 'active')
    assert.equal(context.services.catalog.getCopy(copy.id).status, 'available')
  } finally {
    context.close()
  }
})
