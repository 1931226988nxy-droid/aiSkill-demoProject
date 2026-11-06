<script setup>
// 图书分类筛选：只在具有分类查询条件的列表中使用。
import { computed } from 'vue'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { JccTree } from '@jcc/shared/components'

const props = defineProps({
  categories: { type: Array, default: () => [] },
  selectedId: { type: [Number, String], default: undefined },
  manage: Boolean,
})
const emit = defineEmits(['select', 'add', 'edit', 'delete'])

const treeData = computed(() => [
  {
    title: '全部图书',
    key: 'all',
    children: props.categories.map((category) => ({ title: category.name, key: category.id })),
  },
])
const selectedKeys = computed(() => [props.selectedId ?? 'all'])

function select(keys) {
  emit('select', keys[0] === 'all' ? undefined : keys[0])
}
</script>

<template>
  <div class="category-tree-pane">
    <div class="category-tree-heading">
      <strong>图书分类</strong>
    </div>
    <JccTree
      :tree-data="treeData"
      :selected-keys="selectedKeys"
      search-placeholder="搜索分类"
      @select="select"
    >
      <template #title="{ key, title }">
        <span class="category-tree-node">
          <span class="category-tree-node__label" :title="title">{{ title }}</span>
          <span v-if="manage" class="category-tree-node__actions">
            <button
              v-if="key === 'all'"
              type="button"
              class="category-tree-node__action"
              aria-label="新增分类"
              title="新增分类"
              @click.stop="emit('add')"
            >
              <PlusOutlined />
            </button>
            <template v-else-if="selectedId != null && String(key) === String(selectedId)">
              <button
                type="button"
                class="category-tree-node__action"
                :aria-label="`编辑${title}`"
                :title="`编辑${title}`"
                @click.stop="emit('edit', key)"
              >
                <EditOutlined />
              </button>
              <button
                type="button"
                class="category-tree-node__action category-tree-node__action--danger"
                :aria-label="`删除${title}`"
                :title="`删除${title}`"
                @click.stop="emit('delete', key)"
              >
                <DeleteOutlined />
              </button>
            </template>
          </span>
        </span>
      </template>
    </JccTree>
  </div>
</template>
