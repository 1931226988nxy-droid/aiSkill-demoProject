/**
 * 文件职责：动态导航纯函数：模块定位和页面返回目标。
 */

// 动态导航的前端纯函数：不依赖 Vue/Pinia，方便单元测试。
export function modulePath(module) {
  // 后端模块通常已带 path；兜底规则保证旧数据也能生成 /modules/:code。
  return module.path || `/modules/${module.code}`
}

// 在整棵导航树中判断某页面路径是否属于该模块（含标签分组内的功能）。
function containsPath(node, path) {
  return node.path === path || (node.children || []).some((child) => containsPath(child, path))
}

// 查找当前页面所属的顶层模块，供侧栏高亮和返回按钮使用。
export function findModuleForPath(navigation, path) {
  return (navigation || []).find(
    (node) => node.type === 'module' && containsPath(node, path),
  ) || null
}

// 后端按权限返回菜单；这里再按前端路由的角色限制筛选，避免展示点开后必然进入 403 的入口。
export function filterAccessibleNavigation(navigation, { resolveRoute, can, isReader }) {
  function filterNode(node) {
    if (node.type === 'item') {
      if (!node.path) return null
      let route
      try {
        route = resolveRoute(node.path)
      } catch {
        return null
      }
      if (route.name === 'not-found') return null
      if (route.meta?.readerOnly && !isReader) return null
      if (route.meta?.permission && !can(route.meta.permission)) return null
      return node
    }

    const children = (node.children || []).map(filterNode).filter(Boolean)
    if (!children.length) return null
    return { ...node, children }
  }

  return (navigation || []).map(filterNode).filter(Boolean)
}

// 403 页恢复访问时返回原目标；旧地址或无效目标回到工作台，仍受限则保留提示页。
export function forbiddenRecoveryPath(from, { resolveRoute, can, isReader }) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return '/'
  let target
  try {
    target = resolveRoute(from)
  } catch {
    return '/'
  }
  if (target.name === 'forbidden' || target.name === 'not-found' || target.meta?.public) return '/'
  if (target.meta?.readerOnly && !isReader) return null
  if (target.meta?.permission && !can(target.meta.permission)) return null
  return target.fullPath
}

// 计算页面返回目标：模块菜单页不显示返回入口，模块内功能页回模块，其他页面回工作台。
export function backDestination(navigation, route) {
  if (route.path === '/') return null
  if (route.name === 'module') return null

  const module = findModuleForPath(navigation, route.meta?.menu || route.path)
  if (module && modulePath(module) !== route.path) {
    return { path: modulePath(module), label: module.title }
  }
  return { path: '/', label: '工作台' }
}
