/**
 * 文件职责：动态权限/菜单和多角色接口测试。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest, createTestContext, login, startTestServer } from './helpers.js'

test('多角色登录、角色切换和至少一个角色约束', async () => {
  const context = createTestContext()
  try {
    const { services } = context
    const admin = (await services.auth.login({ username: 'admin', password: 'admin123' }))
    assert.deepEqual(admin.user.roles.map((role) => role.code).sort(), ['admin', 'librarian'])
    assert.equal(admin.user.role.code, 'admin')
    assert.equal(admin.permissions.includes('permission.manage'), true)

    const session = services.auth.resolveSession(admin.token)
    const switched = services.auth.switchRole(admin.user.id, 'librarian', session.sessionId)
    assert.equal(switched.user.role.code, 'librarian')
    assert.equal(switched.permissions.includes('permission.manage'), false)
    const nav = services.navigation.forPermissions(switched.permissions)
    assert.equal(nav.some((item) => item.code === 'system'), false)

    assert.throws(
      () =>
        services.auth.switchRole(admin.user.id, 'reader', session.sessionId),
      (error) => error.code === 'FORBIDDEN' || error.code === 'READER_DISABLED',
    )
    assert.throws(
      () =>
        services.admin.createUser(
          {
            username: 'no_role',
            password: 'reader12345',
            displayName: '无角色',
            roleCodes: [],
          },
          admin.user,
        ),
      (error) => error.code === 'VALIDATION_ERROR',
    )

    const readerRole = services.admin
      .listRoles()
      .find((role) => role.code === 'reader')
    const librarianRole = services.admin
      .listRoles()
      .find((role) => role.code === 'librarian')
    const multi = services.admin.createUser(
      {
        username: 'multi_role',
        password: 'reader12345',
        displayName: '多角色用户',
        roleCodes: ['reader', 'librarian'],
        primaryRoleCode: 'reader',
      },
      admin.user,
    )
    assert.deepEqual(multi.roles.map((role) => role.code).sort(), ['librarian', 'reader'])
    assert.equal(multi.primaryRoleCode, 'reader')
    assert.ok(readerRole && librarianRole)
    const multiLogin = (await services.auth.login({ username: 'multi_role', password: 'reader12345' }))
    assert.equal(multiLogin.user.role.code, 'reader')
    assert.equal(multiLogin.user.readerNo.startsWith('R'), true)
    const multiSession = services.auth.resolveSession(multiLogin.token)
    const multiSwitched = services.auth.switchRole(
      multiLogin.user.id,
      'librarian',
      multiSession.sessionId,
    )
    assert.equal(multiSwitched.user.role.code, 'librarian')
    assert.equal(multiSwitched.permissions.includes('book.manage'), true)
  } finally {
    context.close()
  }
})

test('动态权限和菜单自动创建权限、按角色过滤导航', async () => {
  const context = createTestContext()
  try {
    const { services } = context
    const admin = (await services.auth.login({ username: 'admin', password: 'admin123' })).user
    const createdPermission = services.access.createPermission(
      {
        code: 'archive.inspect',
        name: '档案检查',
        group: '档案',
        description: '测试动态权限',
      },
      admin,
    )
    assert.equal(createdPermission.code, 'archive.inspect')

    const moduleResult = services.access.createMenu(
      {
        type: 'module',
        code: 'archive',
        title: '档案综合',
        icon: 'FileTextOutlined',
        description: '档案业务模块',
        sortOrder: 50,
        permissions: [],
      },
      admin,
    )
    const groupResult = services.access.createMenu(
      {
        type: 'group',
        parentId: moduleResult.menu.id,
        code: 'archive-review',
        title: '档案考评',
        icon: 'FileTextOutlined',
        sortOrder: 10,
        permissions: [],
      },
      admin,
    )
    const itemResult = services.access.createMenu(
      {
        type: 'item',
        parentId: groupResult.menu.id,
        code: 'archive-inspect',
        title: '档案检查方案',
        path: '/catalog',
        icon: 'SearchOutlined',
        sortOrder: 10,
        permissions: ['archive.inspect', 'archive.auto.created'],
      },
      admin,
    )
    assert.deepEqual(itemResult.autoCreated, ['archive.auto.created'])
    assert.ok(
      services.access
        .listPermissions()
        .some((permission) => permission.code === 'archive.auto.created'),
    )

    const reader = (await services.auth.login({ username: 'reader', password: 'reader123' })).user
    const readerRole = services.admin.listRoles().find((role) => role.code === 'reader')
    const currentReaderPermissions = readerRole.permissions
    services.admin.setRolePermissions(
      readerRole.id,
      [...new Set([...currentReaderPermissions, 'archive.inspect', 'archive.auto.created'])],
      admin,
    )
    const readerBundle = (await services.auth.login({ username: 'reader', password: 'reader123' }))
    const readerNav = services.navigation.forPermissions(readerBundle.permissions)
    const archiveModule = readerNav.find((item) => item.code === 'archive')
    assert.ok(archiveModule)
    assert.equal(archiveModule.children[0].title, '档案考评')
    assert.equal(archiveModule.children[0].children[0].title, '档案检查方案')

    const librarianBundle = (await services.auth.login({ username: 'librarian', password: 'lib123456' }))
    const librarianNav = services.navigation.forPermissions(librarianBundle.permissions)
    assert.equal(librarianNav.some((item) => item.code === 'archive'), false)
  } finally {
    context.close()
  }
})

test('导航和菜单管理接口受后端权限保护并可角色切换', async () => {
  const context = createTestContext()
  const server = await startTestServer(context)
  try {
    const admin = await login(server.base, 'admin', 'admin123')
    const navigation = await apiRequest(server.base, '/api/navigation', {
      cookie: admin.cookie,
    })
    assert.equal(navigation.status, 200)
    assert.ok(navigation.data.items.some((item) => item.code === 'system'))

    const switched = await apiRequest(server.base, '/api/auth/role', {
      cookie: admin.cookie,
      method: 'POST',
      body: { roleCode: 'librarian' },
    })
    assert.equal(switched.status, 200)
    assert.equal(switched.data.user.role.code, 'librarian')
    const librarianNavigation = await apiRequest(server.base, '/api/navigation', {
      cookie: admin.cookie,
    })
    assert.equal(librarianNavigation.status, 200)
    assert.equal(
      librarianNavigation.data.items.some((item) => item.code === 'system'),
      false,
    )

    await apiRequest(server.base, '/api/auth/role', {
      cookie: admin.cookie,
      method: 'POST',
      body: { roleCode: 'admin' },
    })
    const createdMenu = await apiRequest(server.base, '/api/admin/menus', {
      cookie: admin.cookie,
      method: 'POST',
      body: {
        type: 'item',
        code: 'http-dynamic-item',
        title: 'HTTP 动态功能',
        path: '/catalog',
        icon: 'SearchOutlined',
        permissions: ['http.dynamic.permission'],
      },
    })
    assert.equal(createdMenu.status, 201)
    assert.deepEqual(createdMenu.data.autoCreated, ['http.dynamic.permission'])

    const reader = await login(server.base, 'reader', 'reader123')
    const denied = await apiRequest(server.base, '/api/admin/menus', {
      cookie: reader.cookie,
    })
    assert.equal(denied.status, 403)
  } finally {
    await server.close()
    context.close()
  }
})
