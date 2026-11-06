import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

test('真实生产进程使用空库启动，提供静态页面、安全会话和任务指标', { timeout: 20_000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'library-production-test-'))
  await fs.mkdir(path.join(directory, 'dist'))
  await fs.writeFile(path.join(directory, 'dist/index.html'), '<!doctype html><title>Production probe</title>')
  const child = spawn(process.execPath, ['--experimental-sqlite', fileURLToPath(new URL('../index.js', import.meta.url)), '--production'], {
    cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', DB_PATH: path.join(directory, 'production.db'), HOST: '127.0.0.1', PORT: '0', COOKIE_SECURE: 'true', INITIAL_ADMIN_USERNAME: 'bootstrap', INITIAL_ADMIN_PASSWORD: 'ProductionTestPass123' },
  })
  const exited = once(child, 'exit')
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })
  try {
    const base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { clearInterval(interval); reject(new Error('生产启动超时：' + output)) }, 10_000)
      const interval = setInterval(() => {
        const match = output.match(/http:\/\/localhost:(\d+)/)
        if (match) { clearInterval(interval); clearTimeout(timeout); resolve('http://127.0.0.1:' + match[1]) }
        else if (child.exitCode !== null) { clearInterval(interval); clearTimeout(timeout); reject(new Error(output)) }
      }, 50)
    })
    assert.equal((await fetch(base + '/api/health')).status, 200)
    assert.match(await (await fetch(base + '/')).text(), /Production probe/)
    const options = await (await fetch(base + '/api/auth/options')).json()
    assert.deepEqual(options, { allowRegistration: false, demoAccounts: false })
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'bootstrap', password: 'ProductionTestPass123' }) })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('set-cookie'), /; Secure/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const metrics = await fetch(base + '/api/admin/operations', { headers: { Cookie: response.headers.get('set-cookie').split(';')[0] } })
    const operations = await metrics.json()
    assert.equal(metrics.status, 200)
    assert.ok(operations.jobs.lastSuccessAt)
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await exited
    await fs.rm(directory, { recursive: true, force: true })
  }
})
