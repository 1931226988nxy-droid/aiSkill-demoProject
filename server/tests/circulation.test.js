import assert from 'node:assert/strict'
import test from 'node:test'
import { createTestContext } from './helpers.js'

function loginStaff(services) {
  return services.auth.login({ username: 'librarian', password: 'lib123456' }).user
}

function loginReader(services, username = 'reader') {
  return services.auth.login({ username, password: 'reader123' }).user
}

test('借书后副本状态、到期时间和重复借阅校验一致', () => {
  const context = createTestContext()
  try {
    const { services } = context
    const staff = loginStaff(services)
    const loan = services.circulation.borrow(
      { readerNo: 'R20260001', barcode: 'LIB-01-001' },
      staff,
    )
    assert.equal(loan.status, 'active')
    assert.equal(loan.dueAt, '2026-11-26T15:59:59.999Z')
    assert.equal(services.catalog.getCopy(loan.copyId).status, 'borrowed')
    assert.equal(services.circulation.listMyLoans(loginReader(services), {}).total, 1)

    assert.throws(
      () => services.circulation.borrow({ readerNo: 'R20260003', barcode: 'LIB-01-001' }, staff),
      (error) => error.code === 'COPY_NOT_AVAILABLE' || error.code === 'ALREADY_BORROWED_BOOK',
    )
  } finally {
    context.close()
  }
})

test('归还原书时计算逾期费用并更新副本状态', () => {
  const context = createTestContext()
  try {
    const { services } = context
    const staff = loginStaff(services)
    const preview = services.circulation.previewReturn({ barcode: 'LIB-02-001' })
    assert.equal(preview.overdueDays, 4)
    assert.equal(preview.fine, 2)
    const result = services.circulation.returnCopy({ barcode: 'LIB-02-001' }, staff)
    assert.equal(result.loan.status, 'returned')
    assert.equal(result.fee.amount, 2)
    assert.equal(services.catalog.getCopy(result.loan.copyId).status, 'available')
    const fee = context.db.prepare('SELECT * FROM fees WHERE loan_id = ?').get(result.loan.id)
    assert.equal(fee.status, 'pending')
    assert.equal(fee.amount_cents, 200)
  } finally {
    context.close()
  }
})

test('预约队列在归还后保留副本，且只能由当前预约读者借出', () => {
  const context = createTestContext()
  try {
    const { services, db } = context
    const staff = loginStaff(services)
    const admin = services.auth.login({ username: 'admin', password: 'admin123' }).user
    const reader1 = loginReader(services)
    const fourth = services.readers.create(
      {
        username: 'reader4',
        password: 'reader12345',
        fullName: '赵六',
        phone: '13800000004',
      },
      admin,
    )
    const returned = services.circulation.returnCopy({ barcode: 'LIB-08-001' }, staff)
    assert.equal(returned.nextReservation.readerNo, 'R20260001')
    assert.equal(services.catalog.getCopy(returned.loan.copyId).status, 'reserved')
    const reservation = db
      .prepare("SELECT * FROM reservations WHERE status = 'ready' AND reader_id = ?")
      .get(reader1.readerId)
    assert.ok(reservation)
    assert.throws(
      () =>
        services.circulation.borrow(
          { readerNo: fourth.readerNo, barcode: 'LIB-08-001' },
          staff,
        ),
      (error) => error.code === 'COPY_RESERVED',
    )
    const borrowed = services.circulation.borrow(
      { readerNo: 'R20260001', barcode: 'LIB-08-001' },
      staff,
    )
    assert.equal(borrowed.status, 'active')
    assert.equal(
      db.prepare('SELECT status FROM reservations WHERE id = ?').get(reservation.id).status,
      'fulfilled',
    )
    assert.equal(services.catalog.getCopy(borrowed.copyId).status, 'borrowed')
  } finally {
    context.close()
  }
})

test('续借检查次数、逾期和预约队列', () => {
  const context = createTestContext()
  try {
    const { services } = context
    const staff = loginStaff(services)
    const reader1 = loginReader(services)
    const reader2 = loginReader(services, 'reader2')
    const loan = services.circulation.borrow(
      { readerNo: 'R20260001', barcode: 'LIB-01-001' },
      staff,
    )
    assert.equal(services.circulation.renew(loan.id, reader1).renewals, 1)
    assert.equal(services.circulation.renew(loan.id, reader1).renewals, 2)
    assert.throws(
      () => services.circulation.renew(loan.id, reader1),
      (error) => error.code === 'RENEW_LIMIT',
    )
    const overdueLoan = context.db
      .prepare("SELECT id FROM loans WHERE returned_at IS NULL AND due_at < ?")
      .get(context.state.now.toISOString())
    assert.throws(
      () => services.circulation.renew(overdueLoan.id, reader2, { allowManage: true }),
      (error) => error.code === 'RENEW_OVERDUE',
    )

    const book = services.catalog.createBook(
      {
        isbn: '9780132350884',
        title: '测试续借预约阻断',
        authors: ['测试作者'],
        categoryId: 2,
        price: 10,
      },
      staff,
    )
    const copy = services.catalog.createCopy(
      book.id,
      { barcode: 'TEST-RENEW-001', location: '测试借阅区' },
      staff,
    )
    const newLoan = services.circulation.borrow(
      { readerNo: 'R20260001', barcode: copy.barcode },
      staff,
    )
    services.reservations.create({ bookId: book.id }, reader2)
    assert.throws(
      () => services.circulation.renew(newLoan.id, reader1),
      (error) => error.code === 'RENEW_RESERVED',
    )
  } finally {
    context.close()
  }
})

test('预约超过保留期限后自动失效并释放副本', () => {
  const context = createTestContext()
  try {
    const { services, db } = context
    const staff = loginStaff(services)
    services.circulation.returnCopy({ barcode: 'LIB-08-001' }, staff)
    const ready = db.prepare("SELECT * FROM reservations WHERE status = 'ready'").get()
    assert.ok(ready)
    context.advance(4)
    const result = services.runJobs()
    assert.equal(result.expiredReservations, 1)
    const expired = db.prepare('SELECT * FROM reservations WHERE id = ?').get(ready.id)
    assert.equal(expired.status, 'expired')
    assert.equal(services.catalog.getCopy(ready.copy_id).status, 'available')
  } finally {
    context.close()
  }
})

test('上海时区日期边界与数据库存储', () => {
  const context = createTestContext()
  try {
    const now = context.state.now
    const loan = context.services.circulation.borrow(
      { readerNo: 'R20260001', barcode: 'LIB-01-001' },
      loginStaff(context.services),
    )
    assert.equal(loan.borrowedAt, now.toISOString())
    assert.equal(loan.dueAt.endsWith('15:59:59.999Z'), true)
    const shanghai = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(loan.dueAt))
    assert.match(shanghai, /23:59/)
  } finally {
    context.close()
  }
})
