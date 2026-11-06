import { getCurrentScope, onScopeDispose, ref } from 'vue';

/**
 * 同一时刻的 run 调用复用同一个 Promise；任务接收 ({ signal }, ...args)。
 * cancel 会发出取消信号，任务本身应传递 signal 或自行检查它。
 */
export function useAsyncTask(task) {
  const loading = ref(false),
    error = ref(null);
  let active, controller;
  function run(...args) {
    if (active) return active;
    const current = (controller = new AbortController());
    loading.value = true;
    error.value = null;
    active = Promise.resolve()
      .then(() => task({ signal: current.signal }, ...args))
      .then((result) => {
        if (current.signal.aborted) throw new DOMException('操作已取消', 'AbortError');
        return result;
      })
      .catch((cause) => {
        if (!current.signal.aborted) error.value = cause;
        throw cause;
      })
      .finally(() => {
        active = undefined;
        loading.value = false;
      });
    return active;
  }
  function cancel() {
    controller?.abort();
  }
  if (getCurrentScope()) onScopeDispose(cancel);
  return { run, loading, error, cancel };
}
