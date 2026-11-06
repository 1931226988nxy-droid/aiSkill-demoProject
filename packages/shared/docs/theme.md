# @jcc/shared/theme 0.1.0

style.css 导入 tokens.css 与布局样式。`src/theme/tokens.css` 是共享默认值来源，修改后重新构建消费项目。默认配色参考档案系统原型：#f2f3f8 页面、白色卡片、蓝青渐变顶栏、#4c78f4 品牌蓝、#e9eefc 选中底色与 #f0f1f5 表头；操作主色为 #246fee。
createAntTheme() 在浏览器 CSS 加载后读取变量，生成 Ant Design Vue 4.x Token。通过 JccProvider 使用。
header-start/mid/end、color-brand、color-primary、color-page、color-toolbar、color-selection、font-body、radius-_、sidebar-width、sidebar-collapsed-width、tree-width 和 table-cell-_ 均可调整。
应用局部类可以覆盖 CSS 变量，组件 Token 可通过 JccProvider theme 覆盖；不要复制整份主题到各应用。
完整 SSR、运行时多主题切换与浏览器兼容范围由真实项目单独验证。
