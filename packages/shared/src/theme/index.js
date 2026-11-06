// tokens.css -> Ant Design Vue 4.x。调用需在浏览器加载 CSS 后进行。
export function createAntTheme() {
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(name).trim();
  const number = (name) => Number.parseFloat(read(name));
  return {
    token: {
      colorPrimary: read('--color-primary'),
      colorInfo: read('--color-primary'),
      colorSuccess: read('--color-success'),
      colorWarning: read('--color-warning'),
      colorError: read('--color-danger'),
      colorText: read('--color-text'),
      colorTextSecondary: read('--color-text-muted'),
      colorBgLayout: read('--color-page'),
      colorBgContainer: read('--color-surface'),
      colorBgElevated: read('--color-surface'),
      colorBorder: read('--color-border'),
      colorBorderSecondary: read('--color-border-soft'),
      colorFillAlter: read('--color-toolbar'),
      colorLink: read('--color-primary'),
      fontFamily: read('--font-family'),
      fontSize: number('--font-body'),
      fontSizeSM: number('--font-small'),
      borderRadius: number('--radius-control'),
      controlHeight: number('--control-height'),
      controlHeightSM: number('--control-height-small'),
    },
    components: {
      Table: {
        colorFillAlter: read('--color-table-header'),
        colorTextHeading: read('--color-text'),
        borderRadiusLG: number('--radius-control'),
      },
      Menu: {
        controlItemBgActive: read('--color-selection'),
        colorPrimary: read('--color-primary'),
      },
      Tree: { controlItemBgActive: read('--color-selection') },
    },
  };
}
