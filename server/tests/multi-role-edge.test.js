/**
 * 文件职责：多角色与读者/馆员双身份边界测试。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createTestContext } from './helpers.js'

test('读者管理创建的账号可登录，停用读者证不影响同账号的馆员角色', async () => {
  const context = createTestContext()
  try {
    const { services, db } = context
    const admin = (await services.auth.login({ username: 'admin', password: 'admin123' })).user
    const librarian = (await services.auth.login({ username: 'librarian', password: 'lib123456' })).user
    const reader = services.readers.create(
      {
        username: 'created_reader',
        password: 'reader12345',
        fullName: '新建读者',
        phone: '13900000002',
      },
      librarian,
    )
    const login = (await services.auth.login({ username: 'created_reader', password: 'reader12345' }))
    assert.equal(login.user.role.code, 'reader')
    assert.equal(login.user.readerNo, reader.readerNo)

    const combined = services.admin.createUser(
      {
        username: 'combined_staff',
        password: 'reader12345',
        displayName: '双身份用户',
        roleCodes: ['reader', 'librarian'],
        primaryRoleCode: 'reader',
      },
      admin,
    )
    const profile = db.prepare('SELECT id FROM reader_profiles WHERE user_id = ?').get(combined.id)
    assert.ok(profile)
    services.readers.setStatus(profile.id, 'disabled', '读者证暂停使用', admin)
    const user = db.prepare('SELECT status FROM users WHERE id = ?').get(combined.id)
    assert.equal(user.status, 'active')
    const fallbackLogin = (await services.auth.login({
      username: 'combined_staff',
      password: 'reader12345',
    }))
    assert.equal(fallbackLogin.user.role.code, 'librarian')
  } finally {
    context.close()
  }
})
