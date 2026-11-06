<script setup>
import { computed, onBeforeMount, ref } from 'vue';
import { ConfigProvider } from 'ant-design-vue';
import zhCN from 'ant-design-vue/es/locale/zh_CN.js';
import { createAntTheme } from '../theme/index.js';
import JccModalHost from './internal/JccModalHost.vue';
defineOptions({ inheritAttrs: false });
const props = defineProps({
  theme: { type: Object, default: () => ({}) },
  locale: { type: Object, default: () => zhCN },
  size: { type: String, default: 'small' },
});
const base = ref({});
// CSS 变量依赖浏览器环境，挂载前读取以供 Ant Design Vue 主题使用。
onBeforeMount(() => {
  base.value = createAntTheme();
});
const resolved = computed(() => ({
  ...base.value,
  ...props.theme,
  token: { ...base.value.token, ...props.theme.token },
  components: Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(base.value.components || {}),
        ...Object.keys(props.theme.components || {}),
      ]),
    ].map((key) => [key, { ...base.value.components?.[key], ...props.theme.components?.[key] }]),
  ),
}));
</script>
<template>
  <ConfigProvider :theme="resolved" :locale="locale" :component-size="size">
    <div v-bind="$attrs" class="frontend-system"><slot /></div>
    <JccModalHost />
  </ConfigProvider>
</template>
