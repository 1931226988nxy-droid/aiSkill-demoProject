<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { JccPagePanel, JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { BOOK_STATUS_META } from '@/constants'
import { formatDateTime } from '@/utils'
import BookCover from '@/components/BookCover.vue'
import BookEditorModal from '@/components/BookEditorModal.vue'
import StatusTag from '@/components/StatusTag.vue'

const route = useRoute()
const router = useRouter()
const categories = ref([])
const authors = ref([])
const editorOpen = ref(false)
const editingBook = ref(null)
const offShelfTarget = ref(null)
const offShelfReason = ref('')
const offShelfLoading = ref(false)
const categoryOpen = ref(false)
const categorySaving = ref(false)
const categoryForm = reactive({ code: '', name: '' })

const columns = [
  { title: '图书', key: 'book', width: 310 },
  { title: '分类', dataIndex: 'categoryName', key: 'category', width: 100 },
  { title: '版本 / 出版', key: 'edition', width: 170 },
  { title: '馆藏', key: 'copies', width: 110 },
  { title: '状态', key: 'status', width: 90 },
  { title: '更新时间', key: 'updatedAt', width: 150 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' },
]

const { filters, page, pageSize, items, total, loading, error, refresh, search, reset, changePage } =
  useTableQuery({
    initialFilters: { q: '', status: 'all' },
    pageSize: 10,
    fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
      api.books.list(
        {
          page: pageValue,
          pageSize: sizeValue,
          q: query.q || undefined,
          status: query.status === 'all' ? undefined : query.status,
        },
        { signal },
      ),
  })

async function loadMeta() {
  try {
    const [categoryData, authorData] = await Promise.all([api.books.categories(), api.books.authors()])
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
  offShelfReason.value = ''
}

async function confirmOffShelf() {
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

async function createCategory() {
  if (!categoryForm.code.trim() || !categoryForm.name.trim()) {
    message.warning('请填写分类代码和名称')
    return
  }
  categorySaving.value = true
  try {
    await api.books.createCategory({ ...categoryForm })
    message.success('分类已创建')
    categoryForm.code = ''
    categoryForm.name = ''
    await loadMeta()
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    categorySaving.value = false
  }
}

async function openRouteEditor() {
  if (!route.query.edit) return
  try {
    editingBook.value = await api.books.get(route.query.edit)
    editorOpen.value = true
  } catch {
    // The query parameter may be stale; ignore it.
  }
}

onMounted(async () => {
  await Promise.all([loadMeta(), refresh()])
  await openRouteEditor()
})
</script>

<template>
  <JccPagePanel title="图书编目">
    <template #extra>
      <a-space wrap>
        <a-button @click="categoryOpen = true">分类管理</a-button>
        <a-button type="primary" @click="openCreate">新增图书</a-button>
      </a-space>
    </template>

    <JccQueryBar :loading="loading" @search="search" @reset="reset">
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
          </div>
        </template>
      </template>
    </JccTable>

    <BookEditorModal
      v-model:open="editorOpen"
      :book="editingBook"
      :categories="categories"
      :authors="authors"
      @saved="afterSaved"
    />

    <a-modal
      :open="Boolean(offShelfTarget)"
      title="下架图书"
      :confirm-loading="offShelfLoading"
      ok-text="确认下架"
      cancel-text="取消"
      :ok-button-props="{ danger: true }"
      @cancel="offShelfTarget = null"
      @ok="confirmOffShelf"
    >
      <p>
        即将下架《{{ offShelfTarget?.title }}》。下架前系统会检查是否存在在借副本或未完成预约。
      </p>
      <a-form layout="vertical">
        <a-form-item label="下架原因" required>
          <a-textarea v-model:value="offShelfReason" :rows="3" placeholder="请填写下架原因" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="categoryOpen"
      title="分类管理"
      :footer="null"
      width="min(640px, 92vw)"
    >
      <a-table size="small" :data-source="categories" :pagination="false" row-key="id">
        <a-table-column title="代码" data-index="code" key="code" />
        <a-table-column title="名称" data-index="name" key="name" />
        <a-table-column title="图书数" data-index="bookCount" key="bookCount" />
      </a-table>
      <a-divider />
      <a-form layout="vertical">
        <div class="form-grid">
          <a-form-item label="分类代码" required>
            <a-input v-model:value="categoryForm.code" placeholder="如 ART" />
          </a-form-item>
          <a-form-item label="分类名称" required>
            <a-input v-model:value="categoryForm.name" placeholder="如 艺术" />
          </a-form-item>
        </div>
        <a-button type="primary" :loading="categorySaving" @click="createCategory">新增分类</a-button>
      </a-form>
    </a-modal>
  </JccPagePanel>
</template>
