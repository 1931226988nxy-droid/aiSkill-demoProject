<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：馆员预约队列处理页。
import { onMounted, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { RESERVATION_STATUS_META } from '@/constants'
import { formatDateTime } from '@/utils'
import BookCover from '@/components/BookCover.vue'
import StatusTag from '@/components/StatusTag.vue'

const cancellingId = ref(null)
const columns = [
  { title: '图书', key: 'book', width: 280 },
  { title: '读者', key: 'reader', width: 170 },
  { title: '排队', key: 'queue', width: 80 },
  { title: '状态', key: 'status', width: 100 },
  { title: '预约时间', key: 'createdAt', width: 160 },
  { title: '取书期限', key: 'pickup', width: 170 },
  { title: '操作', key: 'action', width: 90, fixed: 'right' },
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
  initialFilters: { q: '', status: 'ready' },
  pageSize: 10,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.reservations.list(
      {
        page: pageValue,
        pageSize: sizeValue,
        q: query.q || undefined,
        status: query.status === 'all' ? undefined : query.status,
      },
      { signal },
    ),
})

function cancel(record) {
  Modal.confirm({
    title: '取消该预约？',
    content: `将取消 ${record.readerName} 对《${record.bookTitle}》的预约。若副本已保留，系统会自动释放给下一位读者。`,
    okText: '确认取消',
    okButtonProps: { danger: true },
    onOk: async () => {
      cancellingId.value = record.id
      try {
        await api.reservations.cancel(record.id)
        message.success('预约已取消')
        await refresh()
      } catch (error) {
        message.error(getErrorMessage(error))
      } finally {
        cancellingId.value = null
      }
    },
  })
}

onMounted(refresh)
</script>

<template>
  <PagePanel title="预约处理">
    <a-alert
      type="info"
      show-icon
      message="读者取书时，请到“馆员工作台 → 借书”按该读者证号和保留副本条码办理借出；借出后预约会自动完成。"
      style="margin-bottom: 14px"
    />

    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <template #actions>
        <span class="muted small">共 {{ total }} 条预约</span>
      </template>
      <a-input
        v-model:value="filters.q"
        class="filter-field--wide"
        placeholder="图书 / 读者 / ISBN"
        allow-clear
      />
      <a-select v-model:value="filters.status" class="filter-field" aria-label="预约状态">
        <a-select-option value="ready">待取书</a-select-option>
        <a-select-option value="waiting">排队中</a-select-option>
        <a-select-option value="all">全部</a-select-option>
        <a-select-option value="fulfilled">已取书</a-select-option>
        <a-select-option value="cancelled">已取消</a-select-option>
        <a-select-option value="expired">已过期</a-select-option>
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
      :scroll="{ x: 1050 }"
      @page-change="changePage"
      @retry="refresh"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'book'">
          <div class="table-book-cell">
            <BookCover :title="record.bookTitle" :cover-url="record.coverUrl" size="sm" />
            <div class="table-book-cell__text">
              <span class="table-book-cell__title">{{ record.bookTitle }}</span>
              <span class="table-book-cell__meta">{{ record.isbn }}</span>
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'reader'">
          <div>{{ record.readerName }}</div>
          <div class="muted small">{{ record.readerNo }}</div>
        </template>
        <template v-else-if="column.key === 'queue'">
          <a-tag v-if="['waiting', 'ready'].includes(record.status)" color="blue">
            {{ record.queuePosition }}
          </a-tag>
          <span v-else class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <StatusTag :status="record.status" :map="RESERVATION_STATUS_META" />
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDateTime(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'pickup'">
          <span v-if="record.pickupExpiresAt" :class="{ 'text-danger': record.status === 'ready' }">
            {{ formatDateTime(record.pickupExpiresAt) }}
          </span>
          <span v-else class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button
            v-if="['waiting', 'ready'].includes(record.status)"
            type="link"
            size="small"
            danger
            :loading="cancellingId === record.id"
            @click="cancel(record)"
          >
            取消
          </a-button>
          <span v-else class="muted small">—</span>
        </template>
      </template>
    </JccTable>
  </PagePanel>
</template>
