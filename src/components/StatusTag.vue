<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: '' },
  map: { type: Object, required: true },
})

const meta = computed(() => props.map[props.status] || { label: props.status || '未知', color: 'default' })
</script>

<template>
  <a-tag :color="meta.color">{{ meta.label }}</a-tag>
</template>
