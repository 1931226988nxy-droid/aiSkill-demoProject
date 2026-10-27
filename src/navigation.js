export function modulePath(module) {
  return module.path || `/modules/${module.code}`
}

function containsPath(node, path) {
  return node.path === path || (node.children || []).some((child) => containsPath(child, path))
}

export function findModuleForPath(navigation, path) {
  return (navigation || []).find(
    (node) => node.type === 'module' && containsPath(node, path),
  ) || null
}

export function backDestination(navigation, route) {
  if (route.path === '/') return null
  if (route.name === 'module') return { path: '/', label: '工作台' }

  const module = findModuleForPath(navigation, route.meta?.menu || route.path)
  if (module && modulePath(module) !== route.path) {
    return { path: modulePath(module), label: module.title }
  }
  return { path: '/', label: '工作台' }
}
