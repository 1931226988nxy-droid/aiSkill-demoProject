<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：读者个人费用查询页。
import { onMounted } from 'vue'
import { JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { FEE_STATUS_META, FEE_TYPE_META } from '@/constants'
import { formatDateTime, formatMoney } from '@/utils'
import StatusTag from '@/components/StatusTag.vue'

const columns = [
  { title: '费用类型', key: 'type', width: 120 },
  { title: '关联图书', key: 'book', width: 230 },
  { title: '金额', key: 'amount', width: 110 },
  { title: '状态', key: 'status', width: 100 },
  { title: '说明', key: 'note', width: 280 },
  { title: '产生时间', key: 'createdAt', width: 160 },
  { title: '处理时间', key: 'handledAt', width: 160 },
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
    api.fees.my(
      {
        page: pageValue,
        pageSize: sizeValue,
        status: query.status || 'all',
      },
      { signal },
    ),
})

onMounted(refresh)
</script>

<template>
  <PagePanel title="我的费用">
    <a-alert
      type="info"
      show-icon
      message="系统不提供在线支付。逾期或赔偿费用请到馆员服务台线下处理，处理结果会同步到本页。"
      style="margin-bottom: 14px"
    />

    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <template #actions>
        <span class="muted small">共 {{ total }} 条记录</span>
      </template>
      <a-select v-model:value="filters.status" class="filter-field" aria-label="费用状态">
        <a-select-option value="all">全部状态</a-select-option>
        <a-select-option value="pending">待处理</a-select-option>
        <a-select-option value="settled">已处理</a-select-option>
        <a-select-option value="waived">已豁免</a-select-option>
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
      :scroll="{ x: 1100 }"
      @page-change="changePage"
      @retry="refresh"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          <StatusTag :status="record.type" :map="FEE_TYPE_META" />
        </template>
        <template v-else-if="column.key === 'book'">
          {{ record.bookTitle || '—' }}
        </template>
        <template v-else-if="column.key === 'amount'">
          <strong>{{ formatMoney(record.amount) }}</strong>
        </template>
        <template v-else-if="column.key === 'status'">
          <StatusTag :status="record.status" :map="FEE_STATUS_META" />
        </template>
        <template v-else-if="column.key === 'note'">{{ record.note || '—' }}</template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDateTime(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'handledAt'">
          {{ record.handledAt ? formatDateTime(record.handledAt) : '—' }}
        </template>
      </template>
    </JccTable>
  </PagePanel>
</template>
