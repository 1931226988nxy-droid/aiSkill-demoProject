import { getCurrentScope, onScopeDispose, reactive, ref, toRaw } from 'vue';
import { cloneQuery } from '../utils/index.js';

/**
 * 管理服务端分页列表。fetcher({ page, pageSize, filters, signal })
 * 应返回 Promise<{ items: Array, total: number }>，并尽量响应取消信号。
 * filters 是表单草稿；调用 search 后才复制到 applied 并从第一页查询。
 */
export function useTableQuery({ fetcher, initialFilters = {}, pageSize = 20 } = {}) {
  if (typeof fetcher !== 'function') throw new Error('useTableQuery 需要 fetcher');
  const filters = reactive(cloneQuery(initialFilters));
  const applied = ref(cloneQuery(initialFilters));
  const page = ref(1),
    size = ref(pageSize),
    total = ref(0),
    items = ref([]),
    loading = ref(false),
    error = ref(null);
  let controller,
    sequence = 0,
    disposed = false;
  async function refresh() {
    if (disposed) return;
    // 即使 fetcher 忽略 AbortSignal，也只允许最后一次请求写入状态。
    const id = ++sequence;
    controller?.abort();
    const currentController = (controller = new AbortController());
    loading.value = true;
    error.value = null;
    try {
      const result = await fetcher({
        page: page.value,
        pageSize: size.value,
        filters: cloneQuery(toRaw(applied.value)),
        signal: currentController.signal,
      });
      if (id !== sequence || disposed || currentController.signal.aborted) return;
      if (!Array.isArray(result?.items) || !Number.isFinite(result.total) || result.total < 0)
        throw new Error('列表接口应返回 { items: Array, total: 非负数 }');
      const lastPage = Math.max(1, Math.ceil(result.total / size.value));
      if (page.value > lastPage) {
        // 删除最后一页数据后回退到有效页，再读取该页内容。
        page.value = lastPage;
        return refresh();
      }
      items.value = result.items;
      total.value = result.total;
      return result;
    } catch (cause) {
      if (id === sequence && !disposed && !currentController.signal.aborted) error.value = cause;
    } finally {
      if (id === sequence && !disposed) loading.value = false;
    }
  }
  function search() {
    applied.value = cloneQuery(toRaw(filters));
    page.value = 1;
    return refresh();
  }
  function reset() {
    Object.keys(filters).forEach((key) => delete filters[key]);
    Object.assign(filters, cloneQuery(initialFilters));
    return search();
  }
  function changePage({ page: next, pageSize: nextSize }) {
    if (!Number.isInteger(next) || next < 1 || !Number.isInteger(nextSize) || nextSize < 1)
      throw new Error('页码和页容量必须为正整数');
    page.value = size.value === nextSize ? next : 1;
    size.value = nextSize;
    return refresh();
  }
  function dispose() {
    disposed = true;
    sequence += 1;
    controller?.abort();
    loading.value = false;
  }
  if (getCurrentScope()) onScopeDispose(dispose);
  return {
    filters,
    applied,
    page,
    pageSize: size,
    items,
    total,
    loading,
    error,
    refresh,
    search,
    reset,
    changePage,
    dispose,
  };
}
