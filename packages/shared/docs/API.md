# @jcc/shared 公共库

本目录以源码形式提供公共组件、样式、状态方法、请求封装、工具方法、验证规则和共享 SVG。应用通过仓库根目录 npm workspaces 使用 `packages/shared`，请在根目录安装依赖。Vue、Ant Design Vue 和图标库是 peer 依赖。

应用入口导入 `ant-design-vue/dist/reset.css` 与 `@jcc/shared/style.css`。JS 可从根入口按名称导入，也可从下表中的子路径按类别导入。独立 Vite 项目需将 `@jcc/shared/vite` 的 `jccLiveViteConfig()` 合入自己的配置。

| 子路径                   | 内容                            | 详细契约        |
| ------------------------ | ------------------------------- | --------------- |
| `@jcc/shared/components` | 13 个 Jcc 组件及 `openModal`    | `docs/ui.md`    |
| `@jcc/shared/hooks`      | 查询与异步状态方法              | `docs/hooks.md` |
| `@jcc/shared/api`        | `createHttpClient`、`HttpError` | `docs/utils.md` |
| `@jcc/shared/utils`      | 树、文件、格式化、防抖等方法    | `docs/utils.md` |
| `@jcc/shared/validators` | 格式验证规则与函数              | 下文            |
| `@jcc/shared/theme`      | `createAntTheme`                | `docs/theme.md` |
| `@jcc/shared/assets`     | 共享素材 URL                    | 下文            |

`createHttpClient` 仅提供通用请求能力，不绑定后端地址、token 或业务接口。应用负责配置 `baseURL`、权限、响应适配和错误文案。

验证规则：`patterns.email`、`patterns.mobileCN`、`patterns.positiveInteger`；对应的 `isEmail(value)`、`isMobileCN(value)`、`isPositiveInteger(value)` 返回布尔值。邮箱为通用格式初检，大陆手机号仅检查号段与位数，正整数不接受零。它们不承担号码真实性或业务权限验证。

素材：`documentImageUrl`、`addIconUrl` 可直接赋给 `<img :src>`；也可分别导入 `@jcc/shared/assets/document.svg`、`@jcc/shared/assets/add.svg`。当前只包含中性共享 SVG，不包含项目 Logo、用户照片或业务图片。

```js
import { JccTable } from '@jcc/shared/components';
import { createHttpClient } from '@jcc/shared/api';
import { isMobileCN } from '@jcc/shared/validators';
import { documentImageUrl } from '@jcc/shared/assets';
```

新增组件或方法需从 `src` 的对应分类入口公开导出，并更新对应 API 文档和行为测试。本仓库不附带全局 skill 的清单生成脚本；以实际源码导出和包内文档为准，修改后在根目录运行 `npm run quality --workspace=@jcc/shared`。
