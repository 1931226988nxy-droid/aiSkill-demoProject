export function formatBytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return '—';
  if (size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${Number((size / 1024 ** index).toFixed(index ? 2 : 0))} ${units[index]}`;
}

export function formatDate(value, { dateOnly = true, locale = 'zh-CN', timeZone } = {}) {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }),
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** 查询参数约定为普通 JSON 数据，不保存函数、DOM 或 Vue ref。 */
export function cloneQuery(value) {
  return JSON.parse(JSON.stringify(value));
}

export function debounce(fn, delay = 250) {
  let timer;
  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn.apply(this, args);
    }, delay);
  }
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
