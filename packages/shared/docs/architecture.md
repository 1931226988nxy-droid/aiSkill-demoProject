# 公共库结构与复用边界

`frontend-workspace` 是 `@jcc/shared` 的包根目录；它是可直接链接的前端源码包，不包含示例应用或后端服务。

```text
frontend-workspace/
  assets/        共享 SVG
  src/
    components/  Vue 组件与样式
    hooks/       列表查询和异步状态
    utils/       请求、树、文件和格式方法
    theme/       CSS 变量、布局和 Ant Token
  docs/          公共 API 与接入约定
  tests/         组件、hooks 和方法测试
  scripts/       skill 清单与安装脚本
```

包从 `@jcc/shared/components` 等分类路径导出。目标项目通过 `npm link @jcc/shared --save` 指向同一份源码，并在 Vite 中合入 `@jcc/shared/vite` 配置。详细步骤见根目录 `使用说明.md`；公开 API 见 `docs/API.md`。

通用组件、样式、无业务方法、请求封装和共享素材归本库。Java 服务地址、接口路径、业务字段、token、权限、路由和业务图片归使用项目。新增公共能力时从分类入口导出，更新 API 文档和测试，输入“同步公共组件库 skill”刷新目录。

本机源码链接可让运行中的开发页面随源码变化刷新；其他电脑需先同步仓库，已部署页面仍需重新构建和部署。
