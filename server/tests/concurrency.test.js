/**
 * 文件职责：并发借阅一致性测试。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest, createTestContext, login, startTestServer } from './helpers.js'

test('并发借阅同一副本最多只有一个请求成功', async () => {
  const context = createTestContext()
  const server = await startTestServer(context)
  try {
    const librarian = await login(server.base, 'librarian', 'lib123456')
    const payloads = [
      { readerNo: 'R20260001', barcode: 'LIB-01-001' },
      { readerNo: 'R20260003', barcode: 'LIB-01-001' },
    ]
    const results = await Promise.all(
      payloads.map((body) =>
        apiRequest(server.base, '/api/circulation/borrow', {
          cookie: librarian.cookie,
          method: 'POST',
          body,
        }),
      ),
    )
    const statuses = results.map((result) => result.status).sort((a, b) => a - b)
    assert.deepEqual(statuses, [201, 409])
    const active = context.db
      .prepare("SELECT COUNT(*) AS count FROM loans WHERE copy_id = (SELECT id FROM copies WHERE barcode = 'LIB-01-001') AND returned_at IS NULL")
      .get()
    assert.equal(Number(active.count), 1)
    const rejected = results.find((result) => result.status === 409)
    assert.ok(['COPY_NOT_AVAILABLE', 'ALREADY_BORROWED_BOOK'].includes(rejected.data.code))
  } finally {
    await server.close()
    context.close()
  }
})
