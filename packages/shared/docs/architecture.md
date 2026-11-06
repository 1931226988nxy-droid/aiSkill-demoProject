# 公共库结构与复用边界

本仓库中 `packages/shared` 是 `@jcc/shared` 的唯一源码目录，通过根目录 npm workspaces 管理。

```text
packages/shared/
  assets/        共享 SVG
  src/
    components/  Vue 组件与样式
    hooks/       列表查询和异步状态
    utils/       请求、树、文件和格式方法
    theme/       CSS 变量、布局和 Ant Token
  docs/          公共 API 与接入约定
  tests/         组件、hooks 和方法测试
```

包从 `@jcc/shared/components` 等分类路径导出。在仓库根目录安装依赖；应用在 Vite 中合入 `@jcc/shared/vite` 配置。公开 API 见包内 `docs/API.md`。

通用组件、样式、无业务方法、请求封装和共享素材归本库。接口路径、业务字段、token、权限、路由和业务图片归使用项目。新增公共能力时从分类入口导出并更新 API 文档和测试。

本机源码链接可让运行中的开发页面随源码变化刷新；其他电脑需先同步仓库，已部署页面仍需重新构建和部署。
