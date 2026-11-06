/** 非 2xx 响应的状态码和响应内容会保留在 status、details 中。 */
export class HttpError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

/**
 * 创建与业务无关的请求函数。getHeaders 可异步提供公共请求头，单次 headers 可覆盖它。
 * query 数组会展开为重复参数；普通对象和数组 body 按 JSON 发送。
 * 失败时抛出 HttpError，401 时先调用 onUnauthorized；204 返回 null。
 */
export function createHttpClient({
  baseURL = '',
  fetch: fetcher = globalThis.fetch,
  getHeaders = () => ({}),
  onUnauthorized,
} = {}) {
  if (typeof fetcher !== 'function') throw new Error('未提供 fetch 实现');
  return async function request(
    path,
    { query, body, headers, responseType = 'json', method = 'GET', signal, ...options } = {},
  ) {
    if (!['json', 'text', 'blob', 'response'].includes(responseType))
      throw new Error('不支持的 responseType');
    let url = /^https?:\/\//i.test(path)
      ? path
      : `${baseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
      if (value == null) continue;
      for (const item of Array.isArray(value) ? value : [value])
        if (item != null) params.append(key, String(item));
    }
    if (params.size) url += `${url.includes('?') ? '&' : '?'}${params}`;
    const merged = new Headers(await getHeaders());
    new Headers(headers).forEach((value, key) => merged.set(key, value));
    let data = body;
    if (Array.isArray(body) || Object.prototype.toString.call(body) === '[object Object]') {
      merged.set('Content-Type', 'application/json');
      data = JSON.stringify(body);
    }
    const response = await fetcher(url, {
      ...options,
      method,
      headers: merged,
      body: data,
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      let details;
      try {
        details = JSON.parse(text);
      } catch {
        details = text;
      }
      if (response.status === 401) await onUnauthorized?.(response);
      throw new HttpError(
        typeof details?.message === 'string' ? details.message : `请求失败（${response.status}）`,
        response.status,
        details,
      );
    }
    // response 模式交由调用方读取原始响应体和响应头。
    if (responseType === 'response') return response;
    if (response.status === 204) return null;
    return response[responseType]();
  };
}
