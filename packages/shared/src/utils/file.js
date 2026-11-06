/** 前端体验校验；服务端仍应核验大小、实际文件内容与访问权限。 */
export function validateFile(file, { accept = '', maxSizeMB = 10 } = {}) {
  if (!Number.isFinite(maxSizeMB) || maxSizeMB < 0) throw new Error('maxSizeMB 必须为非负有限数值');
  if (file.size > maxSizeMB * 1024 * 1024)
    return { valid: false, error: `文件不能超过 ${maxSizeMB} MB` };
  const types = accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const name = String(file.name || '').toLowerCase();
  const mime = String(file.type || '').toLowerCase();
  const allowed =
    !types.length ||
    types.some(
      (type) =>
        type === '*' ||
        type === '*/*' ||
        (type.startsWith('.')
          ? name.endsWith(type)
          : type.endsWith('/*')
            ? mime.startsWith(type.slice(0, -1))
            : mime === type),
    );
  return allowed
    ? { valid: true, error: '' }
    : { valid: false, error: `不支持该文件类型，允许：${accept}` };
}

/** 仅保留末级文件名并替换非法字符，供浏览器下载名使用。 */
export function safeFileName(name = 'download') {
  return (
    String(name)
      .split(/[\\/]/)
      .pop()
      .replace(/[<>:"|?*\u0000-\u001f]/g, '_')
      .trim() || 'download'
  );
}

/** 优先读取 Content-Disposition 的 UTF-8 filename*，解析失败时回退到 filename。 */
export function getDownloadName(contentDisposition, fallback = 'download') {
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(contentDisposition || '');
  if (utf8) {
    try {
      return safeFileName(decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, '')));
    } catch {
      /* 使用普通文件名兜底 */
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(contentDisposition || '');
  return safeFileName(plain?.[1] || plain?.[2] || fallback);
}

/** 触发浏览器下载，并在点击后释放临时链接及对象 URL。 */
export function downloadBlob(blob, filename = 'download') {
  if (!(blob instanceof Blob)) throw new TypeError('下载内容必须是 Blob');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(filename);
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
