<script setup>
// 文件职责：根据状态映射表渲染 Ant Design 标签。
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: '' },
  map: { type: Object, required: true },
})

// 未命中映射时直接展示原始 code，方便发现后端新增但前端未同步的状态。
const meta = computed(() => props.map[props.status] || { label: props.status || '未知', color: 'default' })
</script>

<template>
  <a-tag :color="meta.color">{{ meta.label }}</a-tag>
</template>
