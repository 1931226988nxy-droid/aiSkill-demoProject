/**
 * 文件职责：预约分配、费用累计、权限提升等业务回归测试。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest, createTestContext, startTestServer } from './helpers.js'
import { seedDatabase } from '../db/seed.js'

function staff(context) {
  return context.services.auth.login({ username: 'librarian', password: 'lib123456' }).user
}

test('新入库可借副本会立即分配给等待队列', () => {
  const context = createTestContext()
  try {
    const copy = context.services.catalog.createCopy(
      8, { barcode: 'QUEUE-NEW-001', location: '测试区' }, staff(context),
    )
    assert.equal(copy.status, 'reserved')
    const reservation = context.db.prepare(
      "SELECT status, copy_id FROM reservations WHERE book_id = 8 AND reader_id = 1",
    ).get()
    assert.equal(reservation.status, 'ready')
    assert.equal(reservation.copy_id, copy.id)
    const loan = context.services.circulation.borrow(
      { readerNo: 'R20260001', barcode: copy.barcode }, staff(context),
    )
    assert.equal(loan.status, 'active')
  } finally {
    context.close()
  }
})

test('过了取书期限，即使定时任务未运行也不能借出', () => {
  const context = createTestContext()
  try {
    context.services.circulation.returnCopy({ barcode: 'LIB-08-001' }, staff(context))
    context.advance(4)
    assert.throws(
      () => context.services.circulation.borrow(
        { readerNo: 'R20260001', barcode: 'LIB-08-001' }, staff(context),
      ),
      (error) => error.code === 'COPY_RESERVED',
    )
  } finally {
    context.close()
  }
})

test('结清后继续逾期会生成剩余天数的补充费用', () => {
  const context = createTestContext()
  try {
    const original = context.db.prepare(
      "SELECT id, loan_id, amount_cents FROM fees WHERE type = 'overdue' LIMIT 1",
    ).get()
    context.services.fees.handle(original.id, { action: 'settle', note: '现金已收' }, staff(context))
    context.advance(2)
    context.services.runJobs()
    const fees = context.db.prepare(
      "SELECT status, amount_cents FROM fees WHERE loan_id = ? AND type = 'overdue' ORDER BY id",
    ).all(original.loan_id)
    assert.deepEqual(fees.map((fee) => [fee.status, fee.amount_cents]), [
      ['settled', 200], ['pending', 100],
    ])
    const returned = context.services.circulation.returnCopy({ barcode: 'LIB-02-001' }, staff(context))
    assert.equal(returned.fee.amount, 1)
  } finally {
    context.close()
  }
})

test('归还后有未缴费用的读者暂不能借新书', () => {
  const context = createTestContext()
  try {
    context.services.circulation.returnCopy({ barcode: 'LIB-02-001' }, staff(context))
    assert.throws(
      () => context.services.circulation.borrow(
        { readerNo: 'R20260002', barcode: 'LIB-01-001' }, staff(context),
      ),
      (error) => error.code === 'PENDING_FEES_BLOCK',
    )
    const fee = context.db.prepare(
      "SELECT id FROM fees WHERE reader_id = 2 AND status = 'pending' LIMIT 1",
    ).get()
    context.services.fees.handle(fee.id, { action: 'settle', note: '现金已收' }, staff(context))
    const loan = context.services.circulation.borrow(
      { readerNo: 'R20260002', barcode: 'LIB-01-001' }, staff(context),
    )
    assert.equal(loan.status, 'active')
  } finally {
    context.close()
  }
})

test('过期读者证不能继续预约', () => {
  const context = createTestContext()
  try {
    context.services.readers.create({
      username: 'expiredreader', password: 'password123', fullName: '过期读者',
      phone: '13800009999', expiresAt: '2026-10-26',
    }, staff(context))
    const user = context.services.auth.login({
      username: 'expiredreader', password: 'password123',
    }).user
    assert.throws(
      () => context.services.reservations.create({ bookId: 8 }, user),
      (error) => error.code === 'READER_EXPIRED',
    )
  } finally {
    context.close()
  }
})

test('个人资料局部更新保留未提交的联系方式', () => {
  const context = createTestContext()
  try {
    const before = context.services.auth.getBundle(3).user.reader
    const after = context.services.auth.updateOwnProfile(3, { displayName: '新姓名' }).user.reader
    assert.equal(after.phone, before.phone)
    assert.equal(after.email, before.email)
    assert.equal(after.idCard, before.idCard)
  } finally {
    context.close()
  }
})

test('系统参数校验失败不会保存同批次的其他参数', () => {
  const context = createTestContext()
  try {
    assert.throws(
      () => context.services.settings.update({ loan_days: 31, max_borrow: 'invalid' }),
      (error) => error.code === 'VALIDATION_ERROR',
    )
    assert.equal(context.services.settings.get('loan_days'), 30)
  } finally {
    context.close()
  }
})

test('定时任务修复等待预约与可借副本并存的历史状态', () => {
  const context = createTestContext()
  try {
    context.db.prepare("UPDATE copies SET status = 'available' WHERE barcode = 'LIB-08-001'").run()
    const result = context.services.runJobs()
    assert.equal(result.assignedReservations, 1)
    assert.equal(context.db.prepare("SELECT status FROM copies WHERE barcode = 'LIB-08-001'").get().status, 'reserved')
    assert.equal(context.db.prepare('SELECT status FROM reservations WHERE book_id = 8 AND reader_id = 1').get().status, 'ready')
  } finally {
    context.close()
  }
})

test('普通馆员即使获得账号管理权限也不能提升到管理员权限', () => {
  const context = createTestContext()
  try {
    context.db.prepare(`INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.code = 'librarian' AND p.code = 'user.manage'`).run()
    const actor = staff(context)
    assert.throws(() => context.services.admin.createUser({
      username: 'newadmin', password: 'password123', displayName: '新管理员', roleCodes: ['admin'],
    }, actor), (error) => error.code === 'FORBIDDEN')
    assert.throws(() => context.services.admin.resetPassword(1, {
      newPassword: 'password123',
    }, actor), (error) => error.code === 'FORBIDDEN')
    const librarianRole = context.db.prepare("SELECT id FROM roles WHERE code = 'librarian'").get()
    assert.throws(() => context.services.admin.setRolePermissions(
      librarianRole.id, ['user.manage', 'settings.manage'], actor,
    ), (error) => error.code === 'FORBIDDEN')
    assert.throws(() => context.services.admin.setRolePermissions(
      librarianRole.id, ['user.manage'], actor,
    ), (error) => error.code === 'FORBIDDEN')
    const customRole = context.services.admin.createRole({
      code: 'assistant_staff', name: '助理馆员',
    }, context.services.auth.login({ username: 'admin', password: 'admin123' }).user)
    assert.throws(() => context.services.admin.setRolePermissions(
      customRole.id, ['settings.manage'], actor,
    ), (error) => error.code === 'FORBIDDEN')
    assert.deepEqual(context.services.admin.setRolePermissions(
      customRole.id, ['user.manage'], actor,
    ).permissions, ['user.manage'])
    const created = context.services.admin.createUser({
      username: 'newstaff', password: 'password123', displayName: '新馆员', roleCodes: ['librarian'],
    }, actor)
    assert.equal(created.username, 'newstaff')
  } finally {
    context.close()
  }
})

test('生产环境空库仅创建独立管理员并关闭自助注册', () => {
  const context = createTestContext({ seed: false })
  try {
    assert.throws(() => seedDatabase(context.db, { demo: false }), /INITIAL_ADMIN_PASSWORD/)
    const result = seedDatabase(context.db, {
      demo: false,
      initialAdmin: { username: 'firstadmin', password: 'strong-password-123' },
    })
    assert.deepEqual(result, { seeded: true, demo: false })
    assert.equal(context.db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1)
    assert.equal(context.db.prepare('SELECT COUNT(*) AS count FROM books').get().count, 0)
    assert.equal(context.services.settings.get('allow_registration'), false)
    assert.equal(context.services.auth.login({
      username: 'firstadmin', password: 'strong-password-123',
    }).user.role.code, 'admin')
  } finally {
    context.close()
  }
})

test('登录页选项接口公开返回当前注册开关', async () => {
  const context = createTestContext()
  const server = await startTestServer(context)
  try {
    const options = await apiRequest(server.base, '/api/auth/options')
    assert.equal(options.status, 200)
    assert.deepEqual(options.data, { allowRegistration: true, demoAccounts: true })
    context.services.settings.update({ allow_registration: false })
    const disabled = await apiRequest(server.base, '/api/auth/options')
    assert.equal(disabled.data.allowRegistration, false)
  } finally {
    await server.close()
    context.close()
  }
})
