# 项目约定

本仓库使用 Vue 3、Ant Design Vue 4 和 JavaScript。前端工作遵守 frontend-system skill；本仓库的公共库唯一源码是 `packages/shared`，由 npm workspaces 管理。不要把另一个本机 `frontend-workspace` 目录当作本仓库依赖，也不要在应用中复制公共组件。

业务字段、路由、权限和 API 适配留在应用中。修改公共包后运行其 `quality`；应用变更运行 `npm run quality`，身份/权限/表单交互变更再运行 `npm run test:e2e`。

数据库升级只能添加新的迁移；测试使用独立数据库。生产数据、备份、环境密钥与依赖目录不得提交。涉及生产环境实际部署、外部备份目的地和告警接入时使用用户提供的配置。
