# @jcc/shared/hooks 0.1.0

## useTableQuery({fetcher,initialFilters={},pageSize=20})

fetcher({page,pageSize,filters,signal}) 返回 Promise<{items:Array,total:number}>。用 API 适配器转换其他后端格式。
不自动首次请求；应用 onMounted(refresh)。返回：

- filters：可编辑草稿；applied：最近一次提交的条件。
- page、pageSize、items、total、loading、error：Vue refs。
- search()：提交草稿，回到第一页并查询。
- reset()：恢复初始条件，回到第一页查询。
- refresh()：按当前生效条件与分页重查，不提交草稿。
- changePage({page,pageSize})：改变分页，页容量变化回到第一页。
- dispose()：取消并阻止晚到结果更新；在 Vue scope 中自动清理。

取消旧请求并检查序号，即使 fetcher 忽略 Abort 也不让旧响应覆盖新结果。失败保留已有数据并提供 error；refresh 可重试。
删除后 total 变少导致页码失效时自动回到最后有效页重新查询。
筛选值约定为普通 JSON 数据；如日期控件值是对象，请在应用层转换为日期字符串。
不要同时 watch(page) 和监听 page-change 发请求。

## useAsyncTask(task)

task({signal},...args) 返回 Promise。返回 run(...args)、loading、error、cancel。
同一实例忙碌时复用同一个 Promise，避免重复请求；完成后可重新执行。失败保留 error 并向调用者抛出，由调用者处理。
取消后拒绝晚到成功，取消错误不记成业务 error；scope 销毁时取消。
底层适配器应响应 signal，否则无法真正终止网络请求；hook 仍会阻止把结果当成成功。
