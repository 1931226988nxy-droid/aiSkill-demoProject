import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest, createTestContext, login, startTestServer } from './helpers.js'

test('分类可新增、编辑和删除；被图书使用时禁止删除', async () => {
  const context = createTestContext()
  const server = await startTestServer(context)
  try {
    const { cookie } = await login(server.base, 'librarian', 'lib123456')
    const created = await apiRequest(server.base, '/api/categories', {
      cookie,
      method: 'POST',
      body: { code: 'TREE_TEST', name: '树管理测试' },
    })
    assert.equal(created.status, 201)
    const id = created.data.id

    const updated = await apiRequest(server.base, `/api/categories/${id}`, {
      cookie,
      method: 'PATCH',
      body: { code: 'TREE_EDIT', name: '树管理已编辑' },
    })
    assert.equal(updated.status, 200)
    assert.equal(updated.data.code, 'TREE_EDIT')
    assert.equal(updated.data.name, '树管理已编辑')

    const used = context.db
      .prepare('SELECT category_id AS id FROM books WHERE category_id IS NOT NULL LIMIT 1')
      .get()
    const blocked = await apiRequest(server.base, `/api/categories/${used.id}`, {
      cookie,
      method: 'DELETE',
    })
    assert.equal(blocked.status, 409)

    const deleted = await apiRequest(server.base, `/api/categories/${id}`, {
      cookie,
      method: 'DELETE',
    })
    assert.equal(deleted.status, 200)
    assert.deepEqual(deleted.data, { id })
    assert.equal(context.db.prepare('SELECT id FROM categories WHERE id = ?').get(id), undefined)
  } finally {
    await server.close()
    context.close()
  }
})
