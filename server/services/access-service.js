import { AppError, ERR } from '../domain/errors.js'
import { MENU_ICON_OPTIONS } from '../domain/default-menus.js'
import { writeAudit } from '../lib/audit.js'
import { isUniqueConstraint, transaction } from '../lib/transaction.js'
import {
  enumValue,
  integer,
  optionalString,
  requiredString,
} from '../lib/validation.js'

const PERMISSION_PATTERN = /^[a-z][a-z0-9_.]{2,80}$/
const MENU_CODE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{1,50}$/

function findMenuNode(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findMenuNode(node.children || [], id)
    if (child) return child
  }
  return null
}

function normalizePermissionCodes(codes) {
  if (codes == null) return []
  if (!Array.isArray(codes)) {
    throw new AppError(ERR.VALIDATION, '权限列表格式不正确', 422)
  }
  const unique = [...new Set(codes.map((code) => String(code || '').trim()).filter(Boolean))]
  for (const code of unique) {
    if (!PERMISSION_PATTERN.test(code)) {
      throw new AppError(ERR.VALIDATION, `权限编码格式不正确：${code}`, 422, {
        fields: { permissions: `权限编码格式不正确：${code}` },
      })
    }
  }
  return unique
}

export function createAccessService({ db, clock = () => new Date() }) {
  function permissionRows() {
    return db
      .prepare('SELECT * FROM permissions ORDER BY group_name, code')
      .all()
      .map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        group: row.group_name,
        description: row.description,
        status: row.status,
        isSystem: Boolean(row.is_system),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
  }

  function listPermissions() {
    return permissionRows()
  }

  function createPermission(input, actor, ip = '') {
    const code = requiredString(input.code, 'code', '权限编码', { min: 3, max: 80 })
    if (!PERMISSION_PATTERN.test(code)) {
      throw new AppError(
        ERR.VALIDATION,
        '权限编码须以小写字母开头，仅含小写字母、数字、点和下划线',
        422,
        { fields: { code: '权限编码格式不正确' } },
      )
    }
    const name = requiredString(input.name, 'name', '权限名称', { max: 80 })
    const group = requiredString(input.group, 'group', '权限分组', { max: 40 })
    const description = optionalString(input.description, 'description', '说明', { max: 300 })
    const now = clock().toISOString()
    try {
      const result = db
        .prepare(
          `INSERT INTO permissions
            (code, name, group_name, description, status, is_system, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`,
        )
        .run(code, name, group, description, now, now)
      const id = Number(result.lastInsertRowid)
      writeAudit(db, {
        actor,
        action: 'permission.create',
        objectType: 'permission',
        objectId: id,
        details: { code, name, group },
        ip,
        createdAt: now,
      })
      return permissionRows().find((item) => item.id === id)
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '权限编码已存在', 409)
      throw error
    }
  }

  function updatePermission(id, input, actor, ip = '') {
    const current = db.prepare('SELECT * FROM permissions WHERE id = ?').get(id)
    if (!current) throw new AppError(ERR.NOT_FOUND, '权限不存在', 404)
    const name = input.name === undefined
      ? current.name
      : requiredString(input.name, 'name', '权限名称', { max: 80 })
    const group = input.group === undefined
      ? current.group_name
      : requiredString(input.group, 'group', '权限分组', { max: 40 })
    const description = input.description === undefined
      ? current.description
      : optionalString(input.description, 'description', '说明', { max: 300 })
    const status = input.status === undefined
      ? current.status
      : enumValue(input.status, 'status', '权限状态', ['active', 'disabled'])
    if (current.is_system && status === 'disabled') {
      throw new AppError(ERR.CONFLICT, '系统内置权限不能停用', 409)
    }
    const now = clock().toISOString()
    db.prepare(
      'UPDATE permissions SET name = ?, group_name = ?, description = ?, status = ?, updated_at = ? WHERE id = ?',
    ).run(name, group, description, status, now, id)
    writeAudit(db, {
      actor,
      action: 'permission.update',
      objectType: 'permission',
      objectId: id,
      details: { code: current.code, name, group, status },
      ip,
      createdAt: now,
    })
    return permissionRows().find((item) => item.id === id)
  }

  function allMenus() {
    const menus = db.prepare('SELECT * FROM menus ORDER BY sort_order, id').all()
    const permissionRows = db
      .prepare(
        `SELECT mp.menu_id, p.code FROM menu_permissions mp
         JOIN permissions p ON p.id = mp.permission_id ORDER BY p.code`,
      )
      .all()
    const permissionMap = new Map()
    for (const row of permissionRows) {
      if (!permissionMap.has(row.menu_id)) permissionMap.set(row.menu_id, [])
      permissionMap.get(row.menu_id).push(row.code)
    }
    const nodes = menus.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      type: row.type,
      code: row.code,
      title: row.title,
      path: row.path,
      icon: row.icon,
      description: row.description,
      sortOrder: row.sort_order,
      status: row.status,
      permissions: permissionMap.get(row.id) || [],
      children: [],
    }))
    const map = new Map(nodes.map((node) => [node.id, node]))
    const roots = []
    for (const node of nodes) {
      if (node.parentId && map.has(node.parentId)) map.get(node.parentId).children.push(node)
      else roots.push(node)
    }
    const sort = (items) => {
      items.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      for (const item of items) sort(item.children)
    }
    sort(roots)
    return roots
  }

  function listMenus() {
    return allMenus()
  }

  function ensurePermissions(codes, actor, now, ip) {
    const find = db.prepare('SELECT id FROM permissions WHERE code = ?')
    const insert = db.prepare(
      `INSERT INTO permissions
        (code, name, group_name, description, status, is_system, created_at, updated_at)
       VALUES (?, ?, '菜单权限', ?, 'active', 0, ?, ?)`,
    )
    const created = []
    for (const code of codes) {
      let row = find.get(code)
      if (!row) {
        row = {
          id: Number(
            insert.run(code, code, '由菜单配置自动创建', now, now).lastInsertRowid,
          ),
        }
        created.push(code)
        writeAudit(db, {
          actor,
          action: 'permission.auto_create',
          objectType: 'permission',
          objectId: row.id,
          details: { code, source: 'menu' },
          ip,
          createdAt: now,
        })
      }
    }
    return created
  }

  function validateMenuInput(input, current = null) {
    const type = current ? current.type : enumValue(input.type, 'type', '菜单类型', ['module', 'group', 'item'])
    const title = requiredString(input.title, 'title', '菜单名称', { max: 60 })
    const description = optionalString(input.description, 'description', '说明', { max: 200 })
    const icon = optionalString(input.icon, 'icon', '图标', { max: 50 })
    if (icon && !MENU_ICON_OPTIONS.includes(icon)) {
      throw new AppError(ERR.VALIDATION, '菜单图标不在可用范围内', 422, {
        fields: { icon: '菜单图标不在可用范围内' },
      })
    }
    const sortOrder = integer(input.sortOrder ?? 0, 'sortOrder', '排序', { min: 0, max: 9999 })
    const status = input.status === undefined
      ? current?.status || 'active'
      : enumValue(input.status, 'status', '菜单状态', ['active', 'disabled'])
    let parentId = input.parentId === undefined || input.parentId === null || input.parentId === ''
      ? null
      : integer(input.parentId, 'parentId', '上级菜单', { min: 1 })
    let path = null
    if (type === 'item') {
      const rawPath = requiredString(input.path, 'path', '路由路径', { max: 200 })
      if (!rawPath.startsWith('/')) {
        throw new AppError(ERR.VALIDATION, '路由路径必须以 / 开头', 422, {
          fields: { path: '路由路径必须以 / 开头' },
        })
      }
      path = rawPath
    }
    if (type === 'module') parentId = null
    if (type === 'group') {
      if (!parentId) {
        throw new AppError(ERR.VALIDATION, '标签分组必须选择所属模块', 422, {
          fields: { parentId: '请选择所属模块' },
        })
      }
      const parent = db.prepare('SELECT type FROM menus WHERE id = ?').get(parentId)
      if (!parent || parent.type !== 'module') {
        throw new AppError(ERR.VALIDATION, '标签分组的上级必须是模块', 422)
      }
    }
    if (type === 'item' && parentId) {
      const parent = db.prepare('SELECT type FROM menus WHERE id = ?').get(parentId)
      if (!parent || !['module', 'group'].includes(parent.type)) {
        throw new AppError(ERR.VALIDATION, '功能菜单只能归属模块或标签分组', 422)
      }
    }
    return {
      type,
      title,
      description,
      icon,
      sortOrder,
      status,
      parentId,
      path,
      permissions: normalizePermissionCodes(input.permissions),
    }
  }

  function createMenu(input, actor, ip = '') {
    const code = requiredString(input.code, 'code', '菜单编码', { min: 2, max: 50 })
    if (!MENU_CODE_PATTERN.test(code)) {
      throw new AppError(ERR.VALIDATION, '菜单编码格式不正确', 422, {
        fields: { code: '菜单编码需为字母开头的字母、数字、下划线或连字符' },
      })
    }
    const data = validateMenuInput(input)
    const path = data.type === 'module' ? `/modules/${encodeURIComponent(code)}` : data.path
    const now = clock().toISOString()
    try {
      return transaction(db, () => {
        const result = db
          .prepare(
            `INSERT INTO menus
              (parent_id, type, code, title, path, icon, description, sort_order, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            data.parentId,
            data.type,
            code,
            data.title,
            path,
            data.icon,
            data.description,
            data.sortOrder,
            data.status,
            now,
            now,
          )
        const menuId = Number(result.lastInsertRowid)
        const autoCreated = ensurePermissions(data.permissions, actor, now, ip)
        const link = db.prepare(
          `INSERT OR IGNORE INTO menu_permissions (menu_id, permission_id)
           SELECT ?, id FROM permissions WHERE code = ?`,
        )
        for (const permissionCode of data.permissions) link.run(menuId, permissionCode)
        writeAudit(db, {
          actor,
          action: 'menu.create',
          objectType: 'menu',
          objectId: menuId,
          details: {
            code,
            type: data.type,
            title: data.title,
            path,
            permissions: data.permissions,
            autoCreated,
          },
          ip,
          createdAt: now,
        })
        return { menu: findMenuNode(allMenus(), menuId), autoCreated }
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '菜单编码已存在', 409)
      throw error
    }
  }

  function updateMenu(id, input, actor, ip = '') {
    const current = db.prepare('SELECT * FROM menus WHERE id = ?').get(id)
    if (!current) throw new AppError(ERR.NOT_FOUND, '菜单不存在', 404)
    const data = validateMenuInput(input, current)
    const now = clock().toISOString()
    const path =
      current.type === 'module' ? current.path : data.type === 'item' ? data.path : null
    try {
      return transaction(db, () => {
        db.prepare(
          `UPDATE menus SET title = ?, path = ?, icon = ?, description = ?, sort_order = ?,
             status = ?, updated_at = ? WHERE id = ?`,
        ).run(
          data.title,
          path,
          data.icon,
          data.description,
          data.sortOrder,
          data.status,
          now,
          id,
        )
        db.prepare('DELETE FROM menu_permissions WHERE menu_id = ?').run(id)
        const autoCreated = ensurePermissions(data.permissions, actor, now, ip)
        const link = db.prepare(
          `INSERT OR IGNORE INTO menu_permissions (menu_id, permission_id)
           SELECT ?, id FROM permissions WHERE code = ?`,
        )
        for (const permissionCode of data.permissions) link.run(id, permissionCode)
        writeAudit(db, {
          actor,
          action: 'menu.update',
          objectType: 'menu',
          objectId: id,
          details: {
            code: current.code,
            title: data.title,
            status: data.status,
            permissions: data.permissions,
            autoCreated,
          },
          ip,
          createdAt: now,
        })
        return { menu: findMenuNode(allMenus(), id), autoCreated }
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '菜单编码已存在', 409)
      throw error
    }
  }

  function deleteMenu(id, actor, ip = '') {
    const current = db.prepare('SELECT * FROM menus WHERE id = ?').get(id)
    if (!current) throw new AppError(ERR.NOT_FOUND, '菜单不存在', 404)
    const children = db.prepare('SELECT COUNT(*) AS count FROM menus WHERE parent_id = ?').get(id)
    if (Number(children.count) > 0) {
      throw new AppError(ERR.CONFLICT, '菜单仍有子项，不能删除', 409)
    }
    db.prepare('DELETE FROM menus WHERE id = ?').run(id)
    writeAudit(db, {
      actor,
      action: 'menu.delete',
      objectType: 'menu',
      objectId: id,
      details: { code: current.code, title: current.title },
      ip,
      createdAt: clock().toISOString(),
    })
    return { deleted: true }
  }

  return {
    listPermissions,
    createPermission,
    updatePermission,
    listMenus,
    createMenu,
    updateMenu,
    deleteMenu,
  }
}
