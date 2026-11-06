<script setup>
// 文件职责：统一页面内容滚动容器，区分整页滚动和内部填充滚动。
// scroll：内容整块滚动（详情/表单）；fill：撑满剩余高度，由子元素内部滚动（表格/卡片）。
defineProps({
  mode: {
    type: String,
    default: 'scroll',
    validator: (value) => ['scroll', 'fill'].includes(value),
  },
  label: { type: String, default: '页面内容' },
})
</script>

<template>
  <div class="page-body" :class="`page-body--${mode}`" role="region" :aria-label="label" tabindex="0">
    <slot />
  </div>
</template>
