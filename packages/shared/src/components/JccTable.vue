<script setup>
import { computed, ref } from 'vue';
import { Alert, Button, Empty, Table } from 'ant-design-vue';
import JccPagination from './JccPagination.vue';
defineOptions({ inheritAttrs: false });
const props = defineProps({
  columns: { type: Array, default: () => [] },
  dataSource: { type: Array, default: () => [] },
  rowKey: { type: [String, Function], default: 'id' },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  total: { type: Number, default: 0 },
  pagination: { type: Boolean, default: true },
  paginationOptions: { type: Object, default: () => ({}) },
  mode: {
    type: String,
    default: 'server',
    validator: (value) => ['client', 'server'].includes(value),
  },
  loading: Boolean,
  error: { default: null },
  emptyText: { type: String, default: '暂无数据，请调整筛选条件' },
});
const emit = defineEmits(['update:page', 'update:pageSize', 'page-change', 'change', 'retry']);
const tableRef = ref();
// 服务端模式直接展示传入页；只有客户端模式才在组件内切片。
const rows = computed(() =>
  props.pagination && props.mode === 'client'
    ? props.dataSource.slice((props.page - 1) * props.pageSize, props.page * props.pageSize)
    : props.dataSource,
);
const count = computed(() => (props.mode === 'client' ? props.dataSource.length : props.total));
function changePage(value) {
  emit('update:page', value.page);
  if (value.pageSize !== props.pageSize) emit('update:pageSize', value.pageSize);
  emit('page-change', value);
}
defineExpose({ tableRef });
</script>
<template>
  <div class="jcc-table">
    <Alert
      v-if="error"
      type="error"
      show-icon
      :message="error.message || String(error)"
      class="jcc-table-error"
    >
      <template #action><Button size="small" @click="emit('retry')">重试</Button></template>
    </Alert>
    <Table
      ref="tableRef"
      v-bind="{ size: 'small', bordered: true, ...$attrs }"
      :columns="columns"
      :data-source="rows"
      :row-key="rowKey"
      :pagination="false"
      :loading="loading"
      @change="(...args) => emit('change', ...args)"
    >
      <template v-for="(_, name) in $slots" #[name]="scope">
        <slot :name="name" v-bind="scope || {}" />
      </template>
      <template v-if="!$slots.emptyText" #emptyText><Empty :description="emptyText" /></template>
    </Table>
    <JccPagination
      v-if="pagination"
      v-bind="paginationOptions"
      :page="page"
      :page-size="pageSize"
      :total="count"
      @change="changePage"
    />
  </div>
</template>
