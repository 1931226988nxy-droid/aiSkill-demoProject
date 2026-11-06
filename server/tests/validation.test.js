/**
 * 文件职责：ISBN、脱敏、密码和逾期规则测试。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createTestContext } from './helpers.js'

function staff(context) {
  return context.services.auth.login({ username: 'librarian', password: 'lib123456' }).user
}

test('ISBN 校验、重复版本号冲突与搜索筛选', () => {
  const context = createTestContext()
  try {
    const { services } = context
    const actor = staff(context)
    assert.throws(
      () =>
        services.catalog.createBook(
          { isbn: '1234567890', title: '非法 ISBN', authors: ['测试'], categoryId: 1 },
          actor,
        ),
      (error) => error.code === 'VALIDATION_ERROR',
    )
    assert.throws(
      () =>
        services.catalog.createBook(
          {
            isbn: '9787506365437',
            title: '重复 ISBN',
            authors: ['测试'],
            categoryId: 1,
          },
          actor,
        ),
      (error) => error.code === 'CONFLICT',
    )
    const result = services.catalog.listBooks({ author: '刘慈欣', categoryId: 1 })
    assert.equal(result.total, 1)
    assert.equal(result.items[0].title, '三体')
    const paged = services.catalog.listBooks({ page: 1, pageSize: 3, sort: 'title', order: 'asc' })
    assert.equal(paged.items.length, 3)
    assert.equal(paged.pageSize, 3)
    const readerList = services.readers.list({ q: '张三' })
    assert.equal(readerList.items[0].phone, '138****0001')
    assert.match(readerList.items[0].idCard, /^1101\*{10}1234$/)
  } finally {
    context.close()
  }
})

test('密码以 scrypt 哈希存储，不保存明文', () => {
  const context = createTestContext()
  try {
    const row = context.db.prepare("SELECT password_hash FROM users WHERE username = 'reader'").get()
    assert.notEqual(row.password_hash, 'reader123')
    assert.match(row.password_hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/)
  } finally {
    context.close()
  }
})

test('逾期读者不能借书；重复预约和有可借副本时预约被拒绝', () => {
  const context = createTestContext()
  try {
    const { services } = context
    const staffUser = staff(context)
    assert.throws(
      () =>
        services.circulation.borrow(
          { readerNo: 'R20260002', barcode: 'LIB-01-001' },
          staffUser,
        ),
      (error) => error.code === 'OVERDUE_BLOCK',
    )
    const reader1 = services.auth.login({ username: 'reader', password: 'reader123' }).user
    assert.throws(
      () => services.reservations.create({ bookId: 8 }, reader1),
      (error) => error.code === 'RESERVATION_DUPLICATE',
    )
    assert.throws(
      () => services.reservations.create({ bookId: 1 }, reader1),
      (error) => error.code === 'RESERVATION_NOT_ALLOWED',
    )
  } finally {
    context.close()
  }
})
