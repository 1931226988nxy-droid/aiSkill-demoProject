<script setup>
import { Pagination } from 'ant-design-vue';
defineOptions({ inheritAttrs: false });
const props = defineProps({
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  total: { type: Number, default: 0 },
});
const emit = defineEmits(['update:page', 'update:pageSize', 'change']);
function change(current, size) {
  const page = props.pageSize === size ? current : 1;
  emit('update:page', page);
  if (size !== props.pageSize) emit('update:pageSize', size);
  emit('change', { page, pageSize: size });
}
</script>
<template>
  <div class="jcc-pagination">
    <Pagination
      v-bind="{
        size: 'small',
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: (total) => `共 ${total} 条`,
        ...$attrs,
      }"
      :current="page"
      :page-size="pageSize"
      :total="total"
      @change="change"
    />
  </div>
</template>
