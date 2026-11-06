<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：馆员图书编目、分类维护和上下架管理页。
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PlusOutlined } from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { JccFormModal, JccModal, JccQueryBar, JccTable, JccTreeTableLayout } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { BOOK_STATUS_META } from '@/constants'
import { formatDateTime } from '@/utils'
import BookCover from '@/components/BookCover.vue'
import BookEditorModal from '@/components/BookEditorModal.vue'
import CategoryFilterTree from '@/components/CategoryFilterTree.vue'
import TreeTablePageHeader from '@/components/TreeTablePageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'

const route = useRoute()
const router = useRouter()
const categories = ref([])
const categoryMobileOpen = ref(false)
const selectedCategoryTitle = computed(() =>
  categories.value.find((item) => String(item.id) === String(filters.categoryId))?.name || '全部图书',
)
const authors = ref([])
const editorOpen = ref(false)
const editingBook = ref(null)
const offShelfTarget = ref(null)
const offShelfFullscreen = ref(false)
const offShelfReason = ref('')
const offShelfLoading = ref(false)
const categoryOpen = ref(false)
const editingCategory = ref(null)
const categoryInitialValues = computed(() => ({
  code: editingCategory.value?.code || '',
  name: editingCategory.value?.name || '',
}))
const categoryRules = {
  code: [
    { required: true, message: '请填写分类代码' },
    { pattern: /^[A-Za-z0-9_]+$/, message: '只能包含字母、数字和下划线' },
  ],
  name: [{ required: true, message: '请填写分类名称' }],
}

const columns = [
  { title: '图书', key: 'book', width: 310 },
  { title: '分类', dataIndex: 'categoryName', key: 'category', width: 100 },
  { title: '版本 / 出版', key: 'edition', width: 170 },
  { title: '馆藏', key: 'copies', width: 110 },
  { title: '状态', key: 'status', width: 90 },
  { title: '更新时间', key: 'updatedAt', width: 150 },
  { title: '操作', key: 'action', width: 180 },
]

const {
  filters,
  page,
  pageSize,
  items,
  total,
  loading,
  error,
  refresh,
  search,
  reset,
  changePage,
} = useTableQuery({
  initialFilters: { q: '', status: 'all', categoryId: undefined },
  pageSize: 10,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.books.list(
      {
        page: pageValue,
        pageSize: sizeValue,
        q: query.q || undefined,
        categoryId: query.categoryId || undefined,
        status: query.status === 'all' ? undefined : query.status,
      },
      { signal },
    ),
})

async function loadMeta() {
  try {
    const [categoryData, authorData] = await Promise.all([
      api.books.categories(),
      api.books.authors(),
    ])
    categories.value = categoryData.items
    authors.value = authorData.items
  } catch (error) {
    message.warning(getErrorMessage(error))
  }
}

function openCreate() {
  editingBook.value = null
  editorOpen.value = true
}

function openEdit(book) {
  editingBook.value = book
  editorOpen.value = true
}

async function afterSaved() {
  message.success(editingBook.value ? '图书信息已更新' : '图书已入库')
  editorOpen.value = false
  await Promise.all([refresh(), loadMeta()])
}

function askOffShelf(book) {
  offShelfTarget.value = book
  offShelfFullscreen.value = false
  offShelfReason.value = ''
}

function openCreateCategory() {
  editingCategory.value = null
  categoryOpen.value = true
}

function openEditCategory(categoryId) {
  editingCategory.value = categories.value.find((item) => item.id === categoryId) || null
  if (editingCategory.value) categoryOpen.value = true
}

function selectCategory(categoryId) {
  filters.categoryId = categoryId
  search()
  if (window.matchMedia('(max-width: 760px)').matches) categoryMobileOpen.value = false
}

async function confirmOffShelf() {
  // 后端会拒绝下架仍有在借或未完成预约的图书；前端只收集原因。
  if (!offShelfReason.value.trim()) {
    message.warning('请填写下架原因')
    return
  }
  offShelfLoading.value = true
  try {
    await api.books.offShelf(offShelfTarget.value.id, offShelfReason.value)
    message.success('图书已下架')
    offShelfTarget.value = null
    await refresh()
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    offShelfLoading.value = false
  }
}

async function confirmOnShelf(book) {
  try {
    await api.books.onShelf(book.id)
    message.success('图书已上架')
    await refresh()
  } catch (error) {
    message.error(getErrorMessage(error))
  }
}

function submitCategory(values) {
  const body = { code: values.code.trim().toUpperCase(), name: values.name.trim() }
  return editingCategory.value
    ? api.books.updateCategory(editingCategory.value.id, body)
    : api.books.createCategory(body)
}

async function afterCategorySaved() {
  message.success(editingCategory.value ? '分类已更新' : '分类已创建')
  await Promise.all([loadMeta(), refresh()])
}

function askDeleteCategory(categoryId) {
  const category = categories.value.find((item) => item.id === categoryId)
  if (!category) return
  if (category.bookCount) {
    message.warning(`“${category.name}”下仍有 ${category.bookCount} 种图书，不能删除`)
    return
  }
  Modal.confirm({
    title: `删除分类“${category.name}”？`,
    content: '删除后无法恢复。',
    okText: '删除',
    okButtonProps: { danger: true },
    cancelText: '取消',
    async onOk() {
      try {
        await api.books.deleteCategory(categoryId)
        message.success('分类已删除')
        await loadMeta()
        if (filters.categoryId === categoryId) {
          filters.categoryId = undefined
          await search()
        } else {
          await refresh()
        }
      } catch (error) {
        message.error(getErrorMessage(error))
        throw error
      }
    },
  })
}

async function openRouteEditor() {
  // 从图书详情“维护书目”跳转时带 ?edit=id，用完整详情打开编辑弹窗。
  if (!route.query.edit) return
  try {
    editingBook.value = await api.books.get(route.query.edit)
    editorOpen.value = true
  } catch {
    // query 可能来自旧链接或已删除图书，忽略即可，不影响列表使用。
  }
}

onMounted(async () => {
  await Promise.all([loadMeta(), refresh()])
  await openRouteEditor()
})
</script>

<template>
  <PagePanel title="图书编目" embedded-header>
    <JccTreeTableLayout
      :mobile-open="categoryMobileOpen"
      tree-label="图书分类"
      separator-label="调整分类树宽度"
    >
      <template #tree-header><TreeTablePageHeader title="图书编目" /></template>
      <template #tree>
        <CategoryFilterTree
          :categories="categories"
          :selected-id="filters.categoryId"
          manage
          @select="selectCategory"
          @add="openCreateCategory"
          @edit="openEditCategory"
          @delete="askDeleteCategory"
        />
      </template>
      <template #content-header><h2>{{ selectedCategoryTitle }}</h2></template>
      <template #toolbar>
        <JccQueryBar :loading="loading" @search="search" @reset="reset">
          <template #actions>
            <a-button
              class="category-mobile-toggle"
              @click="categoryMobileOpen = !categoryMobileOpen"
            >
              图书分类
            </a-button>
            <a-space wrap>
              <a-button type="primary" @click="openCreate"><PlusOutlined />新增图书</a-button>
            </a-space>
          </template>
          <a-input
            v-model:value="filters.q"
            class="filter-field--wide"
            placeholder="书名、作者、ISBN、关键词"
            allow-clear
            aria-label="图书关键词"
          />
          <a-select v-model:value="filters.status" class="filter-field" aria-label="图书状态">
            <a-select-option value="all">全部状态</a-select-option>
            <a-select-option value="active">在架</a-select-option>
            <a-select-option value="off_shelf">已下架</a-select-option>
          </a-select>
        </JccQueryBar>
      </template>

        <JccTable
          :columns="columns"
          :data-source="items"
          :page="page"
          :page-size="pageSize"
          :total="total"
          :loading="loading"
          :error="error"
          row-key="id"
          :scroll="{ x: 1150 }"
          @page-change="changePage"
          @retry="refresh"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'book'">
              <div class="table-book-cell">
                <BookCover :title="record.title" :cover-url="record.coverUrl" size="sm" />
                <div class="table-book-cell__text">
                  <span class="table-book-cell__title">{{ record.title }}</span>
                  <span class="table-book-cell__meta">
                    {{ record.authors?.join('、') }} · {{ record.isbn }}
                  </span>
                </div>
              </div>
            </template>
            <template v-else-if="column.key === 'category'">
              {{ record.categoryName || '未分类' }}
            </template>
            <template v-else-if="column.key === 'edition'">
              <div>{{ record.edition || '—' }}</div>
              <div class="muted small">{{ record.publisher || '—' }}</div>
            </template>
            <template v-else-if="column.key === 'copies'">
              <a-tag color="green">可借 {{ record.availableCopies }}</a-tag>
              <span class="muted small"> / {{ record.totalCopies }}</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <StatusTag :status="record.status" :map="BOOK_STATUS_META" />
            </template>
            <template v-else-if="column.key === 'updatedAt'">
              {{ formatDateTime(record.updatedAt) }}
            </template>
            <template v-else-if="column.key === 'action'">
              <div class="table-actions">
                <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
                <a-button
                  type="link"
                  size="small"
                  @click="router.push({ name: 'copies-manage', query: { bookId: record.id } })"
                >
                  馆藏
                </a-button>
                <a-button
                  v-if="record.status === 'active'"
                  type="link"
                  size="small"
                  danger
                  @click="askOffShelf(record)"
                >
                  下架
                </a-button>
                <a-popconfirm
                  v-else-if="record.status === 'off_shelf'"
                  :title="`重新上架《${record.title}》？`"
                  description="随图书下架的副本会恢复原状态；单独下架的副本保持不变。"
                  ok-text="确认上架"
                  cancel-text="取消"
                  @confirm="confirmOnShelf(record)"
                >
                  <a-button type="link" size="small">上架</a-button>
                </a-popconfirm>
              </div>
            </template>
          </template>
        </JccTable>
    </JccTreeTableLayout>

    <BookEditorModal
      v-model:open="editorOpen"
      :book="editingBook"
      :categories="categories"
      :authors="authors"
      @saved="afterSaved"
    />

    <JccModal
      :open="Boolean(offShelfTarget)"
      v-model:fullscreen="offShelfFullscreen"
      title="下架图书"
      :confirm-loading="offShelfLoading"
      ok-text="确认下架"
      cancel-text="取消"
      :ok-button-props="{ danger: true }"
      @cancel="offShelfTarget = null"
      @ok="confirmOffShelf"
    >
      <p>即将下架《{{ offShelfTarget?.title }}》。下架前系统会检查是否存在在借副本或未完成预约。</p>
      <a-form layout="vertical">
        <a-form-item label="下架原因" required>
          <a-textarea v-model:value="offShelfReason" :rows="3" placeholder="请填写下架原因" />
        </a-form-item>
      </a-form>
    </JccModal>

    <JccFormModal
      v-model:open="categoryOpen"
      :title="editingCategory ? '编辑分类' : '新增分类'"
      :initial-values="categoryInitialValues"
      :rules="categoryRules"
      :submit="submitCategory"
      width="min(480px, 92vw)"
      @saved="afterCategorySaved"
    >
      <template #default="{ model }">
        <a-form-item label="分类代码" name="code">
          <a-input v-model:value="model.code" maxlength="20" placeholder="如 ART" />
        </a-form-item>
        <a-form-item label="分类名称" name="name">
          <a-input v-model:value="model.name" maxlength="40" placeholder="如 艺术" />
        </a-form-item>
      </template>
    </JccFormModal>
  </PagePanel>
</template>
