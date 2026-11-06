<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：图书检索列表，支持关键词、分类、可借状态和排序。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { JccQueryBar, JccTable, JccTreeTableLayout } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { BOOK_STATUS_META } from '@/constants'
import { formatDateTime } from '@/utils'
import BookCover from '@/components/BookCover.vue'
import CategoryFilterTree from '@/components/CategoryFilterTree.vue'
import TreeTablePageHeader from '@/components/TreeTablePageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'

const router = useRouter()
const categories = ref([])
const categoryMobileOpen = ref(false)
const selectedCategoryTitle = computed(() =>
  categories.value.find((item) => String(item.id) === String(filters.categoryId))?.name || '全部图书',
)

const columns = [
  { title: '图书', key: 'book', width: 320 },
  { title: '分类', key: 'category', width: 110 },
  { title: '版本 / 出版', key: 'edition', width: 160 },
  { title: '馆藏', key: 'copies', width: 140 },
  { title: '状态', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 90 },
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
  // 列表状态（分页/筛选/请求取消）统一由 useTableQuery 管理，页面只提供 fetcher。
} = useTableQuery({
  initialFilters: {
    q: '',
    categoryId: undefined,
    availability: 'all',
    sort: 'newest',
  },
  pageSize: 10,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.books.list(
      {
        page: pageValue,
        pageSize: sizeValue,
        q: query.q || undefined,
        categoryId: query.categoryId || undefined,
        availability: query.availability === 'all' ? undefined : query.availability,
        sort: query.sort,
      },
      { signal },
    ),
})

async function loadCategories() {
  try {
    const data = await api.books.categories()
    categories.value = data.items
  } catch {
    categories.value = []
  }
}

function selectCategory(categoryId) {
  filters.categoryId = categoryId
  search()
  if (window.matchMedia('(max-width: 760px)').matches) categoryMobileOpen.value = false
}

onMounted(() => {
  loadCategories()
  refresh()
})
</script>

<template>
  <PagePanel title="图书检索" embedded-header>
    <JccTreeTableLayout
      :mobile-open="categoryMobileOpen"
      tree-label="图书分类"
      separator-label="调整分类树宽度"
    >
      <template #tree-header><TreeTablePageHeader title="图书检索" /></template>
      <template #tree>
        <CategoryFilterTree
          :categories="categories"
          :selected-id="filters.categoryId"
          @select="selectCategory"
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
          </template>
          <a-input
            v-model:value="filters.q"
            class="filter-field--wide"
            placeholder="书名、作者、ISBN、关键词"
            allow-clear
            aria-label="图书关键词"
          />
          <a-select v-model:value="filters.availability" class="filter-field" aria-label="可借状态">
            <a-select-option value="all">全部馆藏</a-select-option>
            <a-select-option value="available">有可借副本</a-select-option>
            <a-select-option value="unavailable">暂无可用</a-select-option>
          </a-select>
          <a-select v-model:value="filters.sort" class="filter-field" aria-label="排序方式">
            <a-select-option value="newest">最近入藏</a-select-option>
            <a-select-option value="title">书名排序</a-select-option>
            <a-select-option value="publish">出版日期</a-select-option>
            <a-select-option value="available">可借数量</a-select-option>
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
          :scroll="{ x: 920 }"
          @page-change="changePage"
          @retry="refresh"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'book'">
              <div class="table-book-cell">
                <BookCover :title="record.title" :cover-url="record.coverUrl" size="sm" />
                <div class="table-book-cell__text">
                  <button
                    type="button"
                    class="table-book-cell__title link-button"
                    @click="router.push(`/catalog/${record.id}`)"
                  >
                    {{ record.title }}
                  </button>
                  <span class="table-book-cell__meta">
                    {{ record.authors?.join('、') || '作者未录入' }} · {{ record.isbn }}
                  </span>
                </div>
              </div>
            </template>
            <template v-else-if="column.key === 'category'">
              {{ record.categoryName || '未分类' }}
            </template>
            <template v-else-if="column.key === 'edition'">
              <div>{{ record.edition || '—' }}</div>
              <div class="muted small">
                {{ record.publisher || '—' }} ·
                {{ formatDateTime(record.publishDate, { dateOnly: true }) }}
              </div>
            </template>
            <template v-else-if="column.key === 'copies'">
              <a-tag :color="record.availableCopies > 0 ? 'green' : 'default'">
                可借 {{ record.availableCopies }}
              </a-tag>
              <span class="muted small"> / 共 {{ record.totalCopies }}</span>
              <div v-if="record.activeReservations" class="muted small">
                {{ record.activeReservations }} 人预约
              </div>
            </template>
            <template v-else-if="column.key === 'status'">
              <StatusTag :status="record.status" :map="BOOK_STATUS_META" />
            </template>
            <template v-else-if="column.key === 'action'">
              <a-button type="link" size="small" @click="router.push(`/catalog/${record.id}`)">
                详情
              </a-button>
            </template>
          </template>
        </JccTable>
    </JccTreeTableLayout>
  </PagePanel>
</template>

<style scoped>
.link-button {
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.link-button:hover {
  color: var(--color-primary);
}
</style>
