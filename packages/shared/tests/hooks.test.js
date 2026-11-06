import { describe, it, expect, vi } from 'vitest';
import { effectScope } from 'vue';
import { useAsyncTask, useTableQuery } from '@jcc/shared/hooks';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
describe('列表查询共享状态', () => {
  it('忽略不支持 Abort 的旧请求响应', async () => {
    const first = deferred(),
      second = deferred();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const state = useTableQuery({ fetcher });
    const a = state.refresh(),
      b = state.refresh();
    second.resolve({ items: [{ id: 2 }], total: 1 });
    await b;
    first.resolve({ items: [{ id: 1 }], total: 1 });
    await a;
    expect(state.items.value).toEqual([{ id: 2 }]);
    expect(fetcher.mock.calls[0][0].signal.aborted).toBe(true);
  });
  it('草稿未提交不改变生效条件，查询重置页码，页容量改变回第一页', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [], total: 300 });
    const state = useTableQuery({ fetcher, initialFilters: { name: '' } });
    await state.changePage({ page: 3, pageSize: 20 });
    state.filters.name = 'new';
    await state.refresh();
    expect(fetcher.mock.lastCall[0].filters.name).toBe('');
    await state.search();
    expect(fetcher.mock.lastCall[0]).toMatchObject({ page: 1, filters: { name: 'new' } });
    await state.changePage({ page: 3, pageSize: 50 });
    expect(state.page.value).toBe(1);
    expect(state.pageSize.value).toBe(50);
  });
  it('删除后页码超出范围时重新请求有效页', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ items: [], total: 21 })
      .mockResolvedValueOnce({ items: [{ id: 21 }], total: 21 });
    const state = useTableQuery({ fetcher });
    await state.changePage({ page: 3, pageSize: 20 });
    expect(state.page.value).toBe(2);
    expect(state.items.value).toEqual([{ id: 21 }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('失败后可重试，卸载后不写入过期状态', async () => {
    const late = deferred();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('网络错误'))
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockReturnValueOnce(late.promise);
    const scope = effectScope();
    let state;
    scope.run(() => {
      state = useTableQuery({ fetcher });
    });
    await state.refresh();
    expect(state.error.value.message).toBe('网络错误');
    await state.refresh();
    expect(state.error.value).toBe(null);
    const pending = state.refresh();
    scope.stop();
    late.resolve({ items: [{ id: 1 }], total: 1 });
    await pending;
    expect(state.items.value).toEqual([]);
    expect(state.loading.value).toBe(false);
  });
  it('非法接口结构进入可见错误状态', async () => {
    const state = useTableQuery({ fetcher: async () => ({ data: [] }) });
    await state.refresh();
    expect(state.error.value.message).toContain('items');
  });
});
describe('异步任务', () => {
  it('并发调用只执行一次，完成后可再次执行', async () => {
    const job = deferred(),
      task = vi.fn().mockReturnValueOnce(job.promise).mockResolvedValueOnce('next');
    const state = useAsyncTask(task);
    const a = state.run(),
      b = state.run();
    expect(a).toBe(b);
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
    job.resolve('done');
    await a;
    expect(state.loading.value).toBe(false);
    await expect(state.run()).resolves.toBe('next');
  });
  it('取消后不会把晚到成功结果作为完成', async () => {
    const job = deferred(),
      state = useAsyncTask(() => job.promise);
    const promise = state.run();
    state.cancel();
    job.resolve('late');
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.error.value).toBe(null);
  });
});
