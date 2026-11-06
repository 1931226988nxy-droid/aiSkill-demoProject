<script setup>
import { computed } from 'vue';
import { TreeSelect } from 'ant-design-vue';
import { normalizeTree } from '../utils/index.js';
defineOptions({ inheritAttrs: false });
const props = defineProps({
  value: { default: undefined },
  treeData: { type: Array, default: () => [] },
  fieldNames: {
    type: Object,
    default: () => ({ label: 'title', value: 'key', children: 'children' }),
  },
});
const emit = defineEmits(['update:value', 'change']);
const nodes = computed(() => normalizeTree(props.treeData, props.fieldNames));
function change(value, label, extra) {
  emit('update:value', value);
  emit('change', value, label, extra);
}
</script>
<template>
  <TreeSelect
    v-bind="{
      showSearch: true,
      allowClear: true,
      treeDefaultExpandAll: true,
      treeNodeFilterProp: 'title',
      placeholder: '请选择分类',
      ...$attrs,
    }"
    class="jcc-tree-select"
    :tree-data="nodes"
    :value="value"
    @change="change"
  >
    <template v-for="(_, name) in $slots" #[name]="scope">
      <slot :name="name" v-bind="scope || {}" />
    </template>
  </TreeSelect>
</template>
