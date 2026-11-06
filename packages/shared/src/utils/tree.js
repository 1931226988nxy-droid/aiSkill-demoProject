/** 扁平数据转树；保留 0 等合法主键，孤儿节点作为根，拒绝重复主键和循环。 */
export function listToTree(
  items,
  { idKey = 'id', parentKey = 'parentId', childrenKey = 'children' } = {},
) {
  const nodes = new Map();
  for (const item of items) {
    if (item[idKey] == null) throw new Error('树节点缺少主键');
    if (nodes.has(item[idKey])) throw new Error(`树节点主键重复：${item[idKey]}`);
    nodes.set(item[idKey], { ...item, [childrenKey]: [] });
  }
  const visited = new Set();
  // 先沿父链检查循环，避免连接节点后形成无法安全遍历的树。
  for (const item of items) {
    const chain = new Set();
    let current = item[idKey];
    while (nodes.has(current) && !visited.has(current)) {
      if (chain.has(current)) throw new Error('树节点存在循环引用');
      chain.add(current);
      current = nodes.get(current)[parentKey];
    }
    chain.forEach((key) => visited.add(key));
  }
  const roots = [];
  for (const item of items) {
    const node = nodes.get(item[idKey]);
    const parent = nodes.get(item[parentKey]);
    if (parent) parent[childrenKey].push(node);
    else roots.push(node);
  }
  return roots;
}

/** 字段映射：同一份后端数据供 Tree / TreeSelect 使用，不修改传入对象。 */
export function normalizeTree(
  nodes,
  { label = 'title', value = 'key', children = 'children' } = {},
) {
  return (nodes || []).map((node) => ({
    ...node,
    title: String(node[label] ?? ''),
    key: node[value],
    value: node[value],
    children: node[children]?.length
      ? normalizeTree(node[children], { label, value, children })
      : undefined,
  }));
}

/** 保留匹配节点的祖先；父节点匹配时保留整个分支。 */
export function filterTree(nodes, keyword, { labelKey = 'title', childrenKey = 'children' } = {}) {
  const query = String(keyword ?? '')
    .trim()
    .toLocaleLowerCase();
  if (!query) return nodes;
  const result = [];
  for (const node of nodes || []) {
    if (
      String(node[labelKey] ?? '')
        .toLocaleLowerCase()
        .includes(query)
    ) {
      result.push({ ...node });
      continue;
    }
    const children = filterTree(node[childrenKey], query, { labelKey, childrenKey });
    if (children.length) result.push({ ...node, [childrenKey]: children });
  }
  return result;
}

export function getTreeKeys(nodes) {
  const keys = [];
  for (const node of nodes || []) {
    keys.push(node.key);
    keys.push(...getTreeKeys(node.children));
  }
  return keys;
}

export function findTreeNode(nodes, value, valueKey = 'key') {
  for (const node of nodes || []) {
    if (node[valueKey] === value) return node;
    const match = findTreeNode(node.children, value, valueKey);
    if (match) return match;
  }
  return undefined;
}
