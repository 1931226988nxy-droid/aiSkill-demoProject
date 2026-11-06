<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：馆员费用查询、线下处理和豁免页。
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { JccModal, JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { FEE_STATUS_META, FEE_TYPE_META } from '@/constants'
import { formatDateTime, formatMoney } from '@/utils'
import StatusTag from '@/components/StatusTag.vue'

const handleOpen = ref(false)
const handleFullscreen = ref(false)
const handling = ref(false)
const handleError = ref('')
const selected = ref(null)
const handleForm = reactive({ action: 'settle', note: '' })

const columns = [
  { title: '读者', key: 'reader', width: 170 },
  { title: '费用类型', key: 'type', width: 120 },
  { title: '关联图书', key: 'book', width: 220 },
  { title: '金额', key: 'amount', width: 110 },
  { title: '状态', key: 'status', width: 100 },
  { title: '说明', key: 'note', width: 260 },
  { title: '产生时间', key: 'createdAt', width: 160 },
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
  initialFilters: { q: '', status: 'pending', type: 'all' },
  pageSize: 10,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.fees.list(
      {
        page: pageValue,
        pageSize: sizeValue,
        q: query.q || undefined,
        status: query.status === 'all' ? undefined : query.status,
        type: query.type === 'all' ? undefined : query.type,
      },
      { signal },
    ),
})

function openHandle(record, action) {
  handleFullscreen.value = false
  selected.value = record
  handleForm.action = action
  handleForm.note = action === 'settle' ? '线下收款，已由馆员确认' : ''
  handleError.value = ''
  handleOpen.value = true
}

async function submitHandle() {
  if (handling.value) return
  if (handleForm.note.trim().length < 2) {
    handleError.value = '请填写至少 2 个字符的处理说明'
    return
  }
  handling.value = true
  handleError.value = ''
  try {
    await api.fees.handle(selected.value.id, { ...handleForm })
    message.success(handleForm.action === 'settle' ? '费用已处理' : '费用已豁免')
    handleOpen.value = false
    await refresh()
  } catch (error) {
    handleError.value = getErrorMessage(error)
  } finally {
    handling.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <PagePanel title="费用处理">
    <a-alert
      type="info"
      show-icon
      message="系统没有在线支付能力。费用只能由馆员线下确认后标记为已处理，或按制度豁免；所有处理都会写入审计日志。"
      style="margin-bottom: 14px"
    />

    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <template #actions>
        <span class="muted small">共 {{ total }} 条费用记录</span>
      </template>
      <a-input
        v-model:value="filters.q"
        class="filter-field"
        placeholder="读者 / 图书"
        allow-clear
      />
      <a-select v-model:value="filters.status" class="filter-field" aria-label="费用状态">
        <a-select-option value="pending">待处理</a-select-option>
        <a-select-option value="settled">已处理</a-select-option>
        <a-select-option value="waived">已豁免</a-select-option>
        <a-select-option value="all">全部状态</a-select-option>
      </a-select>
      <a-select v-model:value="filters.type" class="filter-field" aria-label="费用类型">
        <a-select-option value="all">全部类型</a-select-option>
        <a-select-option value="overdue">逾期</a-select-option>
        <a-select-option value="lost">遗失</a-select-option>
        <a-select-option value="damage">损坏</a-select-option>
        <a-select-option value="manual">人工</a-select-option>
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
      :scroll="{ x: 1250 }"
      @page-change="changePage"
      @retry="refresh"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'reader'">
          <div>{{ record.readerName }}</div>
          <div class="muted small">{{ record.readerNo }}</div>
        </template>
        <template v-else-if="column.key === 'type'">
          <StatusTag :status="record.type" :map="FEE_TYPE_META" />
        </template>
        <template v-else-if="column.key === 'book'">{{ record.bookTitle || '—' }}</template>
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
        <template v-else-if="column.key === 'action'">
          <div v-if="record.status === 'pending'" class="table-actions">
            <a-button type="link" size="small" @click="openHandle(record, 'settle')">处理</a-button>
            <a-button type="link" size="small" danger @click="openHandle(record, 'waive')"
              >豁免</a-button
            >
          </div>
          <span v-else class="muted small">—</span>
        </template>
      </template>
    </JccTable>

    <JccModal
      v-model:open="handleOpen"
      v-model:fullscreen="handleFullscreen"
      :title="handleForm.action === 'settle' ? '确认费用已处理' : '豁免费用'"
      :confirm-loading="handling"
      :ok-text="handleForm.action === 'settle' ? '确认已处理' : '确认豁免'"
      cancel-text="取消"
      :ok-button-props="handleForm.action === 'waive' ? { danger: true } : {}"
      @ok="submitHandle"
    >
      <a-alert
        v-if="handleError"
        type="error"
        show-icon
        :message="handleError"
        style="margin-bottom: 14px"
      />
      <a-descriptions :column="1" size="small" bordered>
        <a-descriptions-item label="读者"
          >{{ selected?.readerName }}（{{ selected?.readerNo }}）</a-descriptions-item
        >
        <a-descriptions-item label="金额">{{ formatMoney(selected?.amount) }}</a-descriptions-item>
        <a-descriptions-item label="说明">{{ selected?.note || '—' }}</a-descriptions-item>
      </a-descriptions>
      <a-form layout="vertical" style="margin-top: 16px">
        <a-form-item label="处理说明" required>
          <a-textarea
            v-model:value="handleForm.note"
            :rows="3"
            placeholder="记录线下处理方式、收款凭证或豁免依据"
          />
        </a-form-item>
      </a-form>
    </JccModal>
  </PagePanel>
</template>
