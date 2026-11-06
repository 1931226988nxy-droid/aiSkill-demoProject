<script setup>
import { Button, Space } from 'ant-design-vue';
import { SearchOutlined } from '@ant-design/icons-vue';
defineProps({ loading: Boolean, showReset: { type: Boolean, default: true } });
const emit = defineEmits(['search', 'reset']);
</script>
<template>
  <div class="fs-toolbar">
    <div class="jcc-toolbar-actions"><slot name="actions" /></div>
    <form class="fs-query" @submit.prevent="emit('search')">
      <slot />
      <Space>
        <Button html-type="submit" :loading="loading">
          <SearchOutlined />
          查询
        </Button>
        <Button v-if="showReset" html-type="button" :disabled="loading" @click="emit('reset')">
          重置
        </Button>
      </Space>
    </form>
  </div>
</template>
