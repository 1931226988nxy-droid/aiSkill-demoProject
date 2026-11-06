<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：读者预约队列、取书期限和取消操作页。
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
  { title: '图书', key: 'book', width: 300 },
  { title: '预约时间', key: 'createdAt', width: 160 },
  { title: '排队位置', key: 'queue', width: 110 },
  { title: '状态', key: 'status', width: 100 },
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
  initialFilters: { status: 'all' },
  pageSize: 10,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.reservations.my(
      {
        page: pageValue,
        pageSize: sizeValue,
        status: query.status || 'all',
      },
      { signal },
    ),
})

function cancel(record) {
  Modal.confirm({
    title: '取消预约？',
    content: `取消《${record.bookTitle}》的预约后，排队位置将让给下一位读者。`,
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
  <PagePanel title="我的预约">
    <a-alert
      type="info"
      show-icon
      message="预约到书后系统会发送站内通知，请在保留期限内携带读者证到馆取书。"
      style="margin-bottom: 14px"
    />

    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <template #actions>
        <span class="muted small">共 {{ total }} 条预约</span>
      </template>
      <a-select v-model:value="filters.status" class="filter-field" aria-label="预约状态">
        <a-select-option value="all">全部预约</a-select-option>
        <a-select-option value="active">进行中</a-select-option>
        <a-select-option value="waiting">排队中</a-select-option>
        <a-select-option value="ready">待取书</a-select-option>
        <a-select-option value="closed">已结束</a-select-option>
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
      :scroll="{ x: 950 }"
      @page-change="changePage"
      @retry="refresh"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'book'">
          <div class="table-book-cell">
            <BookCover :title="record.bookTitle" :cover-url="record.coverUrl" size="sm" />
            <div class="table-book-cell__text">
              <span class="table-book-cell__title">{{ record.bookTitle }}</span>
              <span class="table-book-cell__meta">
                {{ record.copyBarcode ? `已分配副本 ${record.copyBarcode}` : record.isbn }}
              </span>
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDateTime(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'queue'">
          <a-tag v-if="['waiting', 'ready'].includes(record.status)" color="blue">
            第 {{ record.queuePosition }} 位
          </a-tag>
          <span v-else class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <StatusTag :status="record.status" :map="RESERVATION_STATUS_META" />
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
