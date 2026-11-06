const hosts = [];

// 弹窗挂在 JccProvider 内，动态内容才能继承应用的注入、主题和语言环境。
export function registerModalHost(host) {
  hosts.push(host);
  return () => {
    const index = hosts.indexOf(host);
    if (index !== -1) hosts.splice(index, 1);
  };
}

/**
 * 在已挂载的 JccProvider 中打开内容组件。
 * props、on、slots 属于内容组件；modalProps 属于 Ant Modal。
 */
export function openModal(options) {
  if (!options?.component) throw new TypeError('openModal 需要 component 内容组件');
  const host = hosts.at(-1);
  if (!host) throw new Error('openModal 需要在已挂载的 JccProvider 下使用');
  return host.open(options);
}
