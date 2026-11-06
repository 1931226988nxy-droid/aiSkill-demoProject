import assert from 'node:assert/strict'
import test from 'node:test'
import { filterAccessibleNavigation, forbiddenRecoveryPath } from '../../src/navigation.js'

const navigation = [
  { type: 'item', path: '/', title: '工作台' },
  {
    type: 'module', code: 'collection', title: '馆藏综合', children: [
      { type: 'group', code: 'books', children: [
        { type: 'item', path: '/catalog', title: '图书检索' },
        { type: 'item', path: '/my/loans', title: '我的借阅' },
      ] },
    ],
  },
  {
    type: 'module', code: 'reader', title: '读者自助', children: [
      { type: 'item', path: '/my/fees', title: '我的费用' },
    ],
  },
]

function resolveRoute(path) {
  const routes = {
    '/': { name: 'workbench', meta: {} },
    '/catalog': { name: 'catalog', meta: { permission: 'book.read' } },
    '/my/loans': { name: 'my-loans', meta: { permission: 'reader.loans.view', readerOnly: true } },
    '/my/fees': { name: 'my-fees', meta: { permission: 'reader.fees.view', readerOnly: true } },
    '/users': { name: 'users-roles', fullPath: '/users', meta: { permission: 'user.manage' } },
    '/forbidden': { name: 'forbidden', fullPath: '/forbidden', meta: {} },
  }
  return routes[path] || { name: 'not-found', meta: {} }
}

test('管理员权限包含读者权限时，导航仍不展示读者个人页面', () => {
  const visible = filterAccessibleNavigation(navigation, {
    resolveRoute,
    can: () => true,
    isReader: false,
  })
  assert.deepEqual(visible.map((node) => node.title), ['工作台', '馆藏综合'])
  assert.deepEqual(visible[1].children[0].children.map((node) => node.path), ['/catalog'])
})

test('读者角色保留个人页面，未授权的其他入口被筛掉', () => {
  const visible = filterAccessibleNavigation(navigation, {
    resolveRoute,
    can: (code) => code !== 'book.read',
    isReader: true,
  })
  assert.deepEqual(visible.map((node) => node.title), ['工作台', '馆藏综合', '读者自助'])
  assert.deepEqual(visible[1].children[0].children.map((node) => node.path), ['/my/loans'])
})

test('旧版 403 地址返回工作台，恢复权限后返回原目标', () => {
  const options = { resolveRoute, can: () => true, isReader: false }
  assert.equal(forbiddenRecoveryPath(undefined, options), '/')
  assert.equal(forbiddenRecoveryPath('//outside.example', options), '/')
  assert.equal(forbiddenRecoveryPath('/forbidden', options), '/')
  assert.equal(forbiddenRecoveryPath('/users', options), '/users')
  assert.equal(forbiddenRecoveryPath('/my/fees', options), null)
  assert.equal(forbiddenRecoveryPath('/users', { ...options, can: () => false }), null)
})
