<script setup>
import { computed, ref, useAttrs } from 'vue';
import { Empty, InputSearch, Tree } from 'ant-design-vue';
import { filterTree, getTreeKeys, normalizeTree } from '../utils/index.js';
defineOptions({ inheritAttrs: false });
const props = defineProps({
  treeData: { type: Array, default: () => [] },
  selectedKeys: { type: Array, default: () => [] },
  fieldNames: {
    type: Object,
    default: () => ({ label: 'title', value: 'key', children: 'children' }),
  },
  searchable: { type: Boolean, default: true },
  searchPlaceholder: { type: String, default: '搜索分类' },
});
const emit = defineEmits(['update:selectedKeys', 'select', 'search']);
const attrs = useAttrs();
const keyword = ref('');
const nodes = computed(() => normalizeTree(props.treeData, props.fieldNames));
const visible = computed(() => filterTree(nodes.value, keyword.value));
const expanded = computed(() =>
  keyword.value.trim()
    ? getTreeKeys(visible.value)
    : (attrs.expandedKeys ?? attrs['expanded-keys']),
);
function select(keys, info) {
  emit('update:selectedKeys', keys);
  emit('select', keys, info);
}
</script>
<template>
  <div class="jcc-tree">
    <InputSearch
      v-if="searchable"
      v-model:value="keyword"
      :placeholder="searchPlaceholder"
      :aria-label="searchPlaceholder"
      allow-clear
      class="jcc-tree-search"
      @change="emit('search', keyword)"
    />
    <Tree
      v-if="visible.length"
      v-bind="{ defaultExpandAll: true, blockNode: true, ...$attrs }"
      :tree-data="visible"
      :selected-keys="selectedKeys"
      :expanded-keys="expanded"
      @select="select"
    >
      <template v-for="(_, name) in $slots" #[name]="scope">
        <slot :name="name" v-bind="scope || {}" />
      </template>
    </Tree>
    <Empty v-else description="没有匹配的分类" />
  </div>
</template>
