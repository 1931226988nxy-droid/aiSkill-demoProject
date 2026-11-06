# 多项目开发与交付约定

本仓库只维护一份公共源码：`frontend-workspace` 是 `@jcc/shared` 的包根目录。其他本机 Vite 前端项目按根目录 `使用说明.md` 建立链接后，开发时可直接读取源码更新。

## 新项目接入

1. 新项目使用 Vue 3、Ant Design Vue 4 和 Vite；按 `使用说明.md` 链接 `@jcc/shared` 并配置 `jccLiveViteConfig()`。
2. 将 `docs/project-AGENTS.template.md` 的约定加入新项目自己的 `AGENTS.md`，填写 Java 后端适配、权限、路由和主题差异。
3. 在应用入口导入 `@jcc/shared/style.css`；按 `docs/API.md` 选用分类导出。
4. 需要在新开发机使用 Codex skill 时执行 `scripts/install-skill.ps1`。

目录链接只让能访问同一份源码的开发项目自动刷新。其他电脑需同步本仓库；已部署的应用需要重新构建和部署。公共源码更新时，应说明影响的 API 与使用项目。

## 提交与验收

- 每个公共能力记录公开导出、API 文档和有价值的行为测试。未公开的实现不写入 skill 清单。
- `npm run quality` 检查格式、skill 清单和公共库测试；各使用项目负责自己的构建与视觉验收。
- 使用固定指令“同步公共组件库 skill”时运行 `npm run sync:skill`，生成 `frontend-system/references/library-catalog.md`。
- 在代码托管平台启用 PR 必须通过 `.github/workflows/frontend-quality.yml` 的检查。当前仓库未配置远端，推送后才能运行该流程。

## 版本与跨电脑交付

`@jcc/shared` 当前是 `private: true` 的源码包。交付方式是 Git 同步源码与本机链接，无需手工生成单包文件。对公共 API 做不兼容修改时，先记录影响项目与迁移方案，再由各项目的构建检查确认。

如果未来需要跨电脑自动分发稳定版本，可另行配置企业私有 registry 和版本发布流程；这需要代码托管与 registry 地址。生产环境需要经过构建与部署才能获得更新。

## 知识入口

- 视觉与交互：`docs/design-system.md`。
- 架构与归属：`docs/architecture.md`。
- 公共 API：`docs/API.md`。
- Agent 执行规则：根目录 `AGENTS.md`、`frontend-system/SKILL.md` 和各项目自己的 `AGENTS.md`。
