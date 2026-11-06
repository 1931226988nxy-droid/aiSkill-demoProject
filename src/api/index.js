/**
 * 文件职责：前端 API 适配层，按业务域封装接口。
 */

import { request } from './client'

// 所有页面只依赖这一层：统一 URL、HTTP 方法、查询参数和二进制响应，不在组件里散落 fetch。
export const api = {
  auth: {
    options: () => request('/auth/options'),
    login: (body) => request('/auth/login', { method: 'POST', body }),
    register: (body) => request('/auth/register', { method: 'POST', body }),
    logout: () => request('/auth/logout', { method: 'POST', body: {} }),
    me: () => request('/auth/me'),
    switchRole: (roleCode) => request('/auth/role', { method: 'POST', body: { roleCode } }),
    updateProfile: (body) => request('/auth/profile', { method: 'PATCH', body }),
    changePassword: (body) => request('/auth/password', { method: 'POST', body }),
  },
  navigation: () => request('/navigation'),
  dashboard: () => request('/dashboard'),
  books: {
    list: (query, options = {}) => request('/books', { query, ...options }),
    get: (id) => request(`/books/${id}`),
    create: (body) => request('/books', { method: 'POST', body }),
    update: (id, body) => request(`/books/${id}`, { method: 'PATCH', body }),
    offShelf: (id, reason) =>
      request(`/books/${id}/off-shelf`, { method: 'POST', body: { reason } }),
    onShelf: (id) => request(`/books/${id}/on-shelf`, { method: 'POST', body: {} }),
    categories: () => request('/categories'),
    createCategory: (body) => request('/categories', { method: 'POST', body }),
    updateCategory: (id, body) => request(`/categories/${id}`, { method: 'PATCH', body }),
    deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
    authors: () => request('/authors'),
  },
  copies: {
    list: (query, options = {}) => request('/copies', { query, ...options }),
    byBook: (bookId) => request(`/books/${bookId}/copies`),
    create: (bookId, body) => request(`/books/${bookId}/copies`, { method: 'POST', body }),
    bulk: (bookId, body) => request(`/books/${bookId}/copies/bulk`, { method: 'POST', body }),
    changeStatus: (id, body) => request(`/copies/${id}/status`, { method: 'PATCH', body }),
    inventory: (body) => request('/copies/inventory', { method: 'POST', body }),
    logs: (id) => request(`/copies/${id}/logs`),
    locations: () => request('/locations'),
  },
  circulation: {
    previewBorrow: (body) => request('/circulation/borrow/preview', { method: 'POST', body }),
    borrow: (body) => request('/circulation/borrow', { method: 'POST', body }),
    previewReturn: (body) => request('/circulation/return/preview', { method: 'POST', body }),
    returnBook: (body) => request('/circulation/return', { method: 'POST', body }),
    loans: (query, options = {}) => request('/circulation/loans', { query, ...options }),
    myLoans: (query, options = {}) => request('/my/loans', { query, ...options }),
    renew: (id) => request(`/circulation/loans/${id}/renew`, { method: 'POST', body: {} }),
    lost: (id, body) => request(`/circulation/loans/${id}/lost`, { method: 'POST', body }),
  },
  reservations: {
    create: (body) => request('/reservations', { method: 'POST', body }),
    my: (query, options = {}) => request('/my/reservations', { query, ...options }),
    list: (query, options = {}) => request('/reservations', { query, ...options }),
    cancel: (id) => request(`/reservations/${id}/cancel`, { method: 'POST', body: {} }),
  },
  readers: {
    list: (query, options = {}) => request('/readers', { query, ...options }),
    get: (id) => request(`/readers/${id}`),
    lookup: (readerNo) => request('/readers/lookup', { query: { readerNo } }),
    create: (body, options = {}) => request('/readers', { method: 'POST', body, ...options }),
    update: (id, body, options = {}) =>
      request(`/readers/${id}`, { method: 'PATCH', body, ...options }),
    setStatus: (id, body) => request(`/readers/${id}/status`, { method: 'POST', body }),
  },
  fees: {
    my: (query, options = {}) => request('/my/fees', { query, ...options }),
    list: (query, options = {}) => request('/fees', { query, ...options }),
    handle: (id, body) => request(`/fees/${id}/handle`, { method: 'POST', body }),
    create: (body, options = {}) => request('/fees', { method: 'POST', body, ...options }),
  },
  notifications: {
    list: (query, options = {}) => request('/notifications', { query, ...options }),
    unreadCount: () => request('/notifications/unread-count'),
    markRead: (id) => request(`/notifications/${id}/read`, { method: 'POST', body: {} }),
    markAllRead: () => request('/notifications/read-all', { method: 'POST', body: {} }),
  },
  announcements: {
    list: () => request('/announcements'),
  },
  reports: {
    summary: (query, options = {}) => request('/reports/summary', { query, ...options }),
    download: (query) => request('/reports/export', { query, responseType: 'blob' }),
  },
  admin: {
    users: (query, options = {}) => request('/admin/users', { query, ...options }),
    createUser: (body, options = {}) =>
      request('/admin/users', { method: 'POST', body, ...options }),
    updateUser: (id, body, options = {}) =>
      request(`/admin/users/${id}`, { method: 'PATCH', body, ...options }),
    resetPassword: (id, body) =>
      request(`/admin/users/${id}/reset-password`, { method: 'POST', body }),
    permissions: () => request('/admin/permissions'),
    createPermission: (body, options = {}) =>
      request('/admin/permissions', { method: 'POST', body, ...options }),
    updatePermission: (id, body, options = {}) =>
      request(`/admin/permissions/${id}`, { method: 'PATCH', body, ...options }),
    menus: () => request('/admin/menus'),
    createMenu: (body, options = {}) =>
      request('/admin/menus', { method: 'POST', body, ...options }),
    updateMenu: (id, body, options = {}) =>
      request(`/admin/menus/${id}`, { method: 'PATCH', body, ...options }),
    deleteMenu: (id) => request(`/admin/menus/${id}`, { method: 'DELETE' }),
    roles: () => request('/admin/roles'),
    createRole: (body, options = {}) =>
      request('/admin/roles', { method: 'POST', body, ...options }),
    updateRole: (id, body) => request(`/admin/roles/${id}`, { method: 'PATCH', body }),
    setRolePermissions: (id, permissions) =>
      request(`/admin/roles/${id}/permissions`, { method: 'PATCH', body: { permissions } }),
    deleteRole: (id) => request(`/admin/roles/${id}`, { method: 'DELETE' }),
    settings: () => request('/admin/settings'),
    updateSettings: (body) => request('/admin/settings', { method: 'PATCH', body }),
    auditLogs: (query, options = {}) => request('/admin/audit-logs', { query, ...options }),
    announcements: (query, options = {}) => request('/admin/announcements', { query, ...options }),
    createAnnouncement: (body, options = {}) =>
      request('/admin/announcements', { method: 'POST', body, ...options }),
    updateAnnouncement: (id, body, options = {}) =>
      request(`/admin/announcements/${id}`, { method: 'PATCH', body, ...options }),
    setAnnouncementStatus: (id, status) =>
      request(`/admin/announcements/${id}/status`, { method: 'POST', body: { status } }),
    runJobs: () => request('/admin/jobs/run', { method: 'POST', body: {} }),
  },
}
