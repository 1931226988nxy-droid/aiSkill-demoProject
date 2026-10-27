function loadMenuRows(db) {
  const menus = db
    .prepare(
      `SELECT * FROM menus WHERE status = 'active' ORDER BY sort_order, id`,
    )
    .all()
  const permissions = db
    .prepare(
      `SELECT mp.menu_id, p.code FROM menu_permissions mp
       JOIN permissions p ON p.id = mp.permission_id
       WHERE p.status = 'active'`,
    )
    .all()
  const permissionMap = new Map()
  for (const row of permissions) {
    if (!permissionMap.has(row.menu_id)) permissionMap.set(row.menu_id, [])
    permissionMap.get(row.menu_id).push(row.code)
  }
  return menus.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    type: row.type,
    code: row.code,
    title: row.title,
    path: row.path,
    icon: row.icon,
    description: row.description,
    sortOrder: row.sort_order,
    permissions: permissionMap.get(row.id) || [],
    children: [],
  }))
}

function toTree(rows) {
  const map = new Map(rows.map((row) => [row.id, row]))
  const roots = []
  for (const row of rows) {
    if (row.parentId && map.has(row.parentId)) {
      map.get(row.parentId).children.push(row)
    } else {
      roots.push(row)
    }
  }
  const sort = (nodes) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    for (const node of nodes) sort(node.children)
  }
  sort(roots)
  return roots
}

export function createNavigationService({ db }) {
  function forPermissions(permissionCodes) {
    const granted = new Set(permissionCodes)
    const rows = loadMenuRows(db)
    const byParent = new Map()
    for (const row of rows) {
      if (!byParent.has(row.parentId)) byParent.set(row.parentId, [])
      byParent.get(row.parentId).push(row)
    }

    function filterNode(node) {
      const ownAllowed =
        node.permissions.length === 0 || node.permissions.some((code) => granted.has(code))
      if (!ownAllowed) return null
      if (node.type === 'item') {
        return node.path ? node : null
      }
      const children = (byParent.get(node.id) || [])
        .map(filterNode)
        .filter(Boolean)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      if (!children.length) return null
      return { ...node, children }
    }

    return (byParent.get(null) || [])
      .map(filterNode)
      .filter(Boolean)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  }

  function forUser(user) {
    return forPermissions(user.permissions || [])
  }

  return { forPermissions, forUser, loadMenuRows }
}
