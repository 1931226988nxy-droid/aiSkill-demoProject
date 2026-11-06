import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('工作台切换管理员与读者身份后重新加载对应数据', async ({ page, request }) => {
  const username = 'browser_multi_' + randomUUID().slice(0, 8)
  await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } })
  const created = await request.post('/api/admin/users', { data: { username, password: 'BrowserPass123', displayName: '浏览器双角色', roleCodes: ['admin', 'reader'], primaryRoleCode: 'admin' } })
  expect(created.ok()).toBeTruthy()
  await page.goto('/login')
  await page.request.post('/api/auth/login', { data: { username, password: 'BrowserPass123' } })
  await page.goto('/')
  await expect(page.getByText('今日借出', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '账号与角色', exact: true }).click()
  await page.getByRole('radio', { name: '读者', exact: true }).click()
  await expect(page.locator('.account-trigger__role')).toHaveText('读者')
  await expect(page.getByText('今日借出', { exact: true })).toHaveCount(0)
  await expect(page.getByText('当前借阅', { exact: true }).first()).toBeVisible()
})

test('单独授予菜单管理权限可进入对应页签', async ({ page, request }) => {
  const code = 'browser_menu_' + randomUUID().slice(0, 8)
  await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } })
  const role = await (await request.post('/api/admin/roles', { data: { code, name: '仅菜单管理' } })).json()
  await request.patch(`/api/admin/roles/${role.id}/permissions`, { data: { permissions: ['menu.manage'] } })
  const created = await request.post('/api/admin/users', { data: { username: code, password: 'BrowserPass123', displayName: '菜单管理员', roleCodes: [code] } })
  expect(created.ok()).toBeTruthy()
  await page.goto('/login')
  await page.request.post('/api/auth/login', { data: { username: code, password: 'BrowserPass123' } })
  await page.goto('/system/access')
  await expect(page.getByRole('tab', { name: '菜单管理', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '权限管理', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /新增模块$/ })).toBeVisible()
})

test('管理员从登录表单进入系统，主要业务页面没有接口或脚本错误', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/login')
  await page.getByLabel('账号', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('admin123')
  await page.getByRole('button', { name: /登\s*录/, exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  const failedRequests = []
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
  })
  await page.setViewportSize({ width: 881, height: 892 })
  for (const route of ['/catalog', '/catalog/1', '/staff/catalog', '/staff/copies', '/staff/readers', '/staff/desk', '/staff/reservations', '/staff/fees', '/reports', '/users', '/system/access', '/settings', '/audit', '/announcements/manage', '/announcements', '/notifications', '/profile', '/modules/collection']) {
    await page.goto(route)
    await expect(page.locator('#main-content')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('当前账号没有访问权限', { exact: true })).toHaveCount(0)
    expect(failedRequests, route).toEqual([])
    expect(errors, route).toEqual([])
  }
})

test('图书编辑弹窗携带版本保存并刷新列表', async ({ page }) => {
  const loggedIn = await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } })
  expect(loggedIn.ok()).toBeTruthy()
  await page.goto('/staff/catalog')
  const row = page.locator('.ant-table-tbody tr[data-row-key]').first()
  await expect(row).toBeVisible()
  const id = await row.getAttribute('data-row-key')
  const before = await (await page.request.get(`/api/books/${id}`)).json()
  await row.getByRole('button', { name: /编辑$/ }).click()
  const dialog = page.getByRole('dialog')
  const title = '浏览器回归图书-' + randomUUID().slice(0, 8)
  await dialog.getByLabel('书名', { exact: true }).fill(title)
  const saved = page.waitForResponse((response) => response.url().endsWith(`/api/books/${id}`) && response.request().method() === 'PATCH')
  await dialog.getByRole('button', { name: /保\s*存/, exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(200)
  const after = await response.json()
  expect(after.version).toBe(before.version + 1)
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.table-book-cell__title').filter({ hasText: title })).toBeVisible()
})
