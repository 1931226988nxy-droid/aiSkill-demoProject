<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：读者借阅记录与自助续借页。
import { onMounted, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { LOAN_STATUS_META } from '@/constants'
import { formatDateTime, dueTone } from '@/utils'
import BookCover from '@/components/BookCover.vue'
import StatusTag from '@/components/StatusTag.vue'

const renewingId = ref(null)
const columns = [
  { title: '图书', key: 'book', width: 290 },
  { title: '条码 / 馆藏地', key: 'copy', width: 180 },
  { title: '借出时间', key: 'borrowedAt', width: 160 },
  { title: '应还时间', key: 'dueAt', width: 170 },
  { title: '续借', key: 'renewals', width: 80 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'action', width: 100, fixed: 'right' },
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
  initialFilters: { status: 'active' },
  pageSize: 10,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.circulation.myLoans(
      {
        page: pageValue,
        pageSize: sizeValue,
        status: query.status || 'all',
      },
      { signal },
    ),
})

function renew(record) {
  // 前端只做确认提示；续借次数、逾期、预约队列等规则全部由后端重新判断。
  Modal.confirm({
    title: '确认续借？',
    content: `《${record.bookTitle}》将按系统规则顺延借期；如已有预约或已逾期，系统会拒绝续借。`,
    okText: '确认续借',
    onOk: async () => {
      renewingId.value = record.id
      try {
        const result = await api.circulation.renew(record.id)
        message.success(`续借成功，应还日期 ${formatDateTime(result.dueAt, { dateOnly: true })}`)
        await refresh()
      } catch (cause) {
        message.error(getErrorMessage(cause))
      } finally {
        renewingId.value = null
      }
    },
  })
}

onMounted(refresh)
</script>

<template>
  <PagePanel title="我的借阅">
    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <template #actions>
        <span class="muted small">共 {{ total }} 条记录</span>
      </template>
      <a-select v-model:value="filters.status" class="filter-field" aria-label="借阅状态">
        <a-select-option value="active">当前在借</a-select-option>
        <a-select-option value="overdue">已逾期</a-select-option>
        <a-select-option value="returned">历史归还</a-select-option>
        <a-select-option value="all">全部记录</a-select-option>
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
        <template v-else-if="column.key === 'copy'">
          <div>{{ record.barcode }}</div>
          <div class="muted small">{{ record.location }} {{ record.shelf }}</div>
        </template>
        <template v-else-if="column.key === 'borrowedAt'">
          {{ formatDateTime(record.borrowedAt) }}
        </template>
        <template v-else-if="column.key === 'dueAt'">
          <span
            :class="{
              'text-danger': record.overdue,
              'text-warning': !record.overdue && dueTone(record.dueAt) === 'warning',
            }"
          >
            {{ formatDateTime(record.dueAt, { dateOnly: true }) }}
          </span>
          <div v-if="record.overdue" class="muted small">逾期 {{ record.overdueDays }} 天</div>
        </template>
        <template v-else-if="column.key === 'renewals'">{{ record.renewals }} 次</template>
        <template v-else-if="column.key === 'status'">
          <StatusTag :status="record.overdue ? 'overdue' : record.status" :map="LOAN_STATUS_META" />
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button
            v-if="record.status === 'active' && !record.overdue"
            type="link"
            size="small"
            :loading="renewingId === record.id"
            @click="renew(record)"
          >
            续借
          </a-button>
          <span v-else class="muted small">—</span>
        </template>
      </template>
    </JccTable>
  </PagePanel>
</template>
