import assert from 'node:assert/strict'
import test from 'node:test'
import { backDestination, findModuleForPath } from '../../src/navigation.js'

const navigation = [{
  type: 'module', code: 'catalog', title: '馆藏综合', path: '/modules/catalog',
  children: [{
    type: 'group', code: 'search', children: [{ type: 'item', path: '/catalog' }],
  }],
}]

test('模块和功能页面都有稳定的返回目标', () => {
  assert.equal(findModuleForPath(navigation, '/catalog')?.code, 'catalog')
  assert.deepEqual(backDestination(navigation, {
    name: 'module', path: '/modules/catalog', meta: {},
  }), { path: '/', label: '工作台' })
  assert.deepEqual(backDestination(navigation, {
    name: 'catalog', path: '/catalog', meta: { menu: '/catalog' },
  }), { path: '/modules/catalog', label: '馆藏综合' })
  assert.deepEqual(backDestination(navigation, {
    name: 'profile', path: '/profile', meta: {},
  }), { path: '/', label: '工作台' })
  assert.equal(backDestination(navigation, { name: 'workbench', path: '/', meta: {} }), null)
})
