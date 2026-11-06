<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：只读审计日志查询页。
import { onMounted, ref } from 'vue'
import { JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { formatDateTime } from '@/utils'

const detailOpen = ref(false)
const selectedLog = ref(null)

const columns = [
  { title: '时间', key: 'createdAt', width: 170 },
  { title: '操作人', key: 'actor', width: 140 },
  { title: '动作', key: 'action', width: 210 },
  { title: '对象', key: 'object', width: 180 },
  { title: '结果', key: 'result', width: 90 },
  { title: 'IP', key: 'ip', width: 130 },
  { title: '详情', key: 'details', width: 90, fixed: 'right' },
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
  initialFilters: { q: '', result: 'all', from: '', to: '' },
  pageSize: 20,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.admin.auditLogs(
      {
        page: pageValue,
        pageSize: sizeValue,
        q: query.q || undefined,
        result: query.result === 'all' ? undefined : query.result,
        from: query.from || undefined,
        to: query.to || undefined,
      },
      { signal },
    ),
})

function openDetails(record) {
  selectedLog.value = record
  detailOpen.value = true
}

onMounted(refresh)
</script>

<template>
  <PagePanel title="审计日志">
    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <template #actions>
        <span class="muted small">审计记录只读，不提供修改或删除入口</span>
      </template>
      <a-input
        v-model:value="filters.q"
        class="filter-field"
        placeholder="操作人 / 动作 / 对象"
        allow-clear
      />
      <a-select v-model:value="filters.result" class="filter-field" aria-label="操作结果">
        <a-select-option value="all">全部结果</a-select-option>
        <a-select-option value="success">成功</a-select-option>
        <a-select-option value="failure">失败</a-select-option>
      </a-select>
      <a-input
        v-model:value="filters.from"
        class="filter-field--date"
        type="date"
        aria-label="开始日期"
      />
      <span class="muted">至</span>
      <a-input
        v-model:value="filters.to"
        class="filter-field--date"
        type="date"
        aria-label="结束日期"
      />
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
        <template v-if="column.key === 'createdAt'">{{
          formatDateTime(record.createdAt)
        }}</template>
        <template v-else-if="column.key === 'actor'">
          <div>{{ record.actorName }}</div>
          <div class="muted small">ID {{ record.actorId || '—' }}</div>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-tag color="blue">{{ record.action }}</a-tag>
        </template>
        <template v-else-if="column.key === 'object'">
          {{ record.objectType }}{{ record.objectId ? ` #${record.objectId}` : '' }}
        </template>
        <template v-else-if="column.key === 'result'">
          <a-tag :color="record.result === 'success' ? 'green' : 'red'">
            {{ record.result === 'success' ? '成功' : '失败' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'ip'">{{ record.ip || '—' }}</template>
        <template v-else-if="column.key === 'details'">
          <a-button type="link" size="small" @click="openDetails(record)">查看</a-button>
        </template>
      </template>
    </JccTable>

    <a-modal v-model:open="detailOpen" title="审计详情" :footer="null" width="min(720px, 92vw)">
      <a-descriptions :column="{ xs: 1, sm: 2 }" size="small" bordered>
        <a-descriptions-item label="操作人">{{ selectedLog?.actorName }}</a-descriptions-item>
        <a-descriptions-item label="时间">{{
          formatDateTime(selectedLog?.createdAt)
        }}</a-descriptions-item>
        <a-descriptions-item label="动作">{{ selectedLog?.action }}</a-descriptions-item>
        <a-descriptions-item label="结果">{{ selectedLog?.result }}</a-descriptions-item>
        <a-descriptions-item label="对象">
          {{ selectedLog?.objectType }}
          {{ selectedLog?.objectId ? `#${selectedLog.objectId}` : '' }}
        </a-descriptions-item>
        <a-descriptions-item label="IP">{{ selectedLog?.ip || '—' }}</a-descriptions-item>
      </a-descriptions>
      <pre class="details-pre">{{ JSON.stringify(selectedLog?.details, null, 2) }}</pre>
    </a-modal>
  </PagePanel>
</template>

<style scoped>
.details-pre {
  max-height: 400px;
  margin: 16px 0 0;
  padding: 14px;
  overflow: auto;
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.7;
  background: #f6f8fc;
  border: 1px solid var(--color-border-soft);
  border-radius: 8px;
}
</style>
