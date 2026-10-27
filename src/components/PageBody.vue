<script setup>
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
