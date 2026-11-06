<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：馆藏副本入库、批量导入、盘点、状态和日志管理页。
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { DownOutlined } from '@ant-design/icons-vue'
import { JccModal, JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { COPY_STATUS_META } from '@/constants'
import { formatDateTime, parseBarcodeText } from '@/utils'
import BookCover from '@/components/BookCover.vue'
import StatusTag from '@/components/StatusTag.vue'

const route = useRoute()
const books = ref([])
const locations = ref([])
const modalOpen = ref(false)
const modalFullscreen = ref(false)
const modalMode = ref('create')
const modalLoading = ref(false)
const modalError = ref('')
const inventoryResult = ref(null)
const logsOpen = ref(false)
const logsLoading = ref(false)
const logs = ref([])
const logsCopy = ref(null)
const form = reactive({
  bookId: undefined,
  barcode: '',
  location: '',
  shelf: '',
  status: 'available',
  statusId: null,
  barcodes: '',
  reason: '',
})

const modalTitle = computed(
  () =>
    ({
      create: '新增馆藏副本',
      bulk: '批量入库',
      inventory: '馆藏盘点',
      status: '变更副本状态',
    })[modalMode.value] || '馆藏操作',
)

const columns = [
  { title: '条码', dataIndex: 'barcode', key: 'barcode', width: 140 },
  { title: '图书', key: 'book', width: 260 },
  { title: '馆藏地 / 书架', key: 'location', width: 190 },
  { title: '状态', key: 'status', width: 100 },
  { title: '当前借阅', key: 'loan', width: 180 },
  { title: '最近盘点', key: 'inventory', width: 150 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' },
]

const initialBookId = route.query.bookId ? Number(route.query.bookId) : undefined
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
  initialFilters: { q: '', status: 'all', location: undefined, bookId: initialBookId },
  pageSize: 15,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.copies.list(
      {
        page: pageValue,
        pageSize: sizeValue,
        q: query.q || undefined,
        status: query.status === 'all' ? undefined : query.status,
        location: query.location || undefined,
        bookId: query.bookId || undefined,
      },
      { signal },
    ),
})

async function loadMeta() {
  try {
    const [bookData, locationData] = await Promise.all([
      api.books.list({ page: 1, pageSize: 100, sort: 'title', order: 'asc' }),
      api.copies.locations(),
    ])
    books.value = bookData.items
    locations.value = locationData.items
  } catch (error) {
    message.warning(getErrorMessage(error))
  }
}

function resetForm() {
  form.bookId = filters.bookId || undefined
  form.barcode = ''
  form.location = ''
  form.shelf = ''
  form.status = 'available'
  form.barcodes = ''
  form.reason = ''
  modalError.value = ''
  inventoryResult.value = null
}

function openModal(mode, record = null) {
  modalMode.value = mode
  modalFullscreen.value = false
  resetForm()
  if (record) {
    form.bookId = record.bookId
    form.barcode = record.barcode
    form.location = record.location
    form.shelf = record.shelf
    form.status = record.status
  }
  modalOpen.value = true
}

async function submitModal() {
  // 一个弹窗复用四种模式：单本入库、批量入库、盘点、状态变更。
  if (modalLoading.value) return
  modalError.value = ''
  inventoryResult.value = null
  if (['create', 'bulk'].includes(modalMode.value) && !form.bookId) {
    modalError.value = '请选择图书'
    return
  }
  if (modalMode.value === 'create' && (!form.barcode.trim() || !form.location.trim())) {
    modalError.value = '请填写条码和馆藏地'
    return
  }
  if (modalMode.value === 'bulk') {
    const barcodes = parseBarcodeText(form.barcodes)
    if (!barcodes.length || !form.location.trim()) {
      modalError.value = '请填写至少一个条码和馆藏地'
      return
    }
  }
  if (modalMode.value === 'inventory' && !parseBarcodeText(form.barcodes).length) {
    modalError.value = '请扫描至少一个条码'
    return
  }
  if (modalMode.value === 'status' && form.reason.trim().length < 2) {
    modalError.value = '请填写至少 2 个字符的变更原因'
    return
  }
  modalLoading.value = true
  try {
    if (modalMode.value === 'create') {
      await api.copies.create(form.bookId, {
        barcode: form.barcode,
        location: form.location,
        shelf: form.shelf,
        status: form.status,
      })
      message.success('副本已入库')
      await refresh()
      modalOpen.value = false
    } else if (modalMode.value === 'bulk') {
      const result = await api.copies.bulk(form.bookId, {
        barcodes: parseBarcodeText(form.barcodes),
        location: form.location,
        shelf: form.shelf,
      })
      message.success(`成功入库 ${result.count} 个副本`)
      await refresh()
      modalOpen.value = false
    } else if (modalMode.value === 'inventory') {
      // 盘点后保留结果面板（已找到/缺失），不立即关闭弹窗。
      inventoryResult.value = await api.copies.inventory({
        barcodes: parseBarcodeText(form.barcodes),
        location: form.location || undefined,
      })
      await refresh()
    } else if (modalMode.value === 'status') {
      await api.copies.changeStatus(form.statusId, {
        status: form.status,
        reason: form.reason,
      })
      message.success('副本状态已更新')
      await refresh()
      modalOpen.value = false
    }
  } catch (error) {
    modalError.value = getErrorMessage(error)
  } finally {
    modalLoading.value = false
  }
}

function openStatus(record) {
  modalFullscreen.value = false
  form.statusId = record.id
  form.barcode = record.barcode
  form.status = record.status
  form.reason = ''
  modalMode.value = 'status'
  modalError.value = ''
  inventoryResult.value = null
  modalOpen.value = true
}

async function openLogs(record) {
  logsCopy.value = record
  logsOpen.value = true
  logsLoading.value = true
  logs.value = []
  try {
    const data = await api.copies.logs(record.id)
    logs.value = data.items
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    logsLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadMeta(), refresh()])
})
</script>

<template>
  <PagePanel title="馆藏管理">
    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <template #actions>
        <a-space wrap>
          <a-button type="primary" @click="openModal('create')">新增副本</a-button>
          <a-button @click="openModal('bulk')">批量入库</a-button>
          <a-dropdown :trigger="['click']" placement="bottomLeft">
            <a-button>更多 <DownOutlined /></a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item key="inventory" @click="openModal('inventory')">盘点</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </a-space>
      </template>
      <a-input
        v-model:value="filters.q"
        class="filter-field"
        placeholder="条码 / 书名 / ISBN"
        allow-clear
      />
      <a-select
        v-model:value="filters.bookId"
        class="filter-field--wide"
        placeholder="全部图书"
        allow-clear
        show-search
        option-filter-prop="label"
      >
        <a-select-option
          v-for="book in books"
          :key="book.id"
          :value="book.id"
          :label="`${book.title} ${book.isbn}`"
        >
          {{ book.title }} · {{ book.isbn }}
        </a-select-option>
      </a-select>
      <a-select v-model:value="filters.status" class="filter-field" aria-label="副本状态">
        <a-select-option value="all">全部状态</a-select-option>
        <a-select-option v-for="(meta, value) in COPY_STATUS_META" :key="value" :value="value">
          {{ meta.label }}
        </a-select-option>
      </a-select>
      <a-select
        v-model:value="filters.location"
        class="filter-field"
        placeholder="全部馆藏地"
        allow-clear
      >
        <a-select-option v-for="location in locations" :key="location" :value="location">
          {{ location }}
        </a-select-option>
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
        <template v-if="column.key === 'barcode'"
          ><code>{{ record.barcode }}</code></template
        >
        <template v-else-if="column.key === 'book'">
          <div class="table-book-cell">
            <BookCover :title="record.bookTitle" size="sm" />
            <div class="table-book-cell__text">
              <span class="table-book-cell__title">{{ record.bookTitle }}</span>
              <span class="table-book-cell__meta">{{ record.isbn }}</span>
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'location'">
          <div>{{ record.location }}</div>
          <div class="muted small">{{ record.shelf || '未设置书架' }}</div>
        </template>
        <template v-else-if="column.key === 'status'">
          <StatusTag :status="record.status" :map="COPY_STATUS_META" />
        </template>
        <template v-else-if="column.key === 'loan'">
          <template v-if="record.readerNo">
            <div>{{ record.readerName }}（{{ record.readerNo }}）</div>
            <div class="muted small">
              应还 {{ formatDateTime(record.dueAt, { dateOnly: true }) }}
            </div>
          </template>
          <span v-else class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'inventory'">
          {{ record.lastInventoryAt ? formatDateTime(record.lastInventoryAt) : '未盘点' }}
        </template>
        <template v-else-if="column.key === 'action'">
          <div class="table-actions">
            <a-button type="link" size="small" @click="openLogs(record)">日志</a-button>
            <a-button
              v-if="!['borrowed', 'reserved'].includes(record.status)"
              type="link"
              size="small"
              @click="openStatus(record)"
            >
              状态
            </a-button>
          </div>
        </template>
      </template>
    </JccTable>

    <JccModal
      v-model:open="modalOpen"
      v-model:fullscreen="modalFullscreen"
      :title="modalTitle"
      :confirm-loading="modalLoading"
      :ok-text="modalMode === 'inventory' ? '开始盘点' : '确认'"
      cancel-text="取消"
      :mask-closable="false"
      width="min(620px, 92vw)"
      @ok="submitModal"
    >
      <a-alert
        v-if="modalError"
        type="error"
        show-icon
        :message="modalError"
        style="margin-bottom: 14px"
      />
      <a-form layout="vertical">
        <template v-if="['create', 'bulk'].includes(modalMode)">
          <a-form-item label="图书" required>
            <a-select
              v-model:value="form.bookId"
              show-search
              option-filter-prop="label"
              placeholder="选择图书"
            >
              <a-select-option
                v-for="book in books"
                :key="book.id"
                :value="book.id"
                :label="`${book.title} ${book.isbn}`"
              >
                {{ book.title }} · {{ book.isbn }}
              </a-select-option>
            </a-select>
          </a-form-item>
        </template>

        <template v-if="modalMode === 'create'">
          <a-form-item label="条码" required>
            <a-input v-model:value="form.barcode" placeholder="扫描或输入唯一条码" />
          </a-form-item>
        </template>
        <template v-if="modalMode === 'bulk'">
          <a-form-item
            label="条码列表"
            required
            extra="每行一个，也可用逗号或空格分隔；单次最多 100 个"
          >
            <a-textarea
              v-model:value="form.barcodes"
              :rows="6"
              placeholder="LIB-01-004&#10;LIB-01-005"
            />
          </a-form-item>
        </template>
        <template v-if="modalMode === 'inventory'">
          <a-form-item label="扫描到的条码" required extra="系统会记录盘点时间，并返回未找到的条码">
            <a-textarea
              v-model:value="form.barcodes"
              :rows="6"
              placeholder="扫描条码后回车，每行一个"
            />
          </a-form-item>
        </template>

        <template v-if="['create', 'bulk', 'inventory'].includes(modalMode)">
          <div class="form-grid">
            <a-form-item
              :label="modalMode === 'inventory' ? '限定馆藏地（选填）' : '馆藏地'"
              :required="modalMode !== 'inventory'"
            >
              <a-input v-model:value="form.location" placeholder="如 一楼中文借阅区" />
            </a-form-item>
            <a-form-item v-if="modalMode !== 'inventory'" label="书架位置">
              <a-input v-model:value="form.shelf" placeholder="如 A-01" />
            </a-form-item>
          </div>
        </template>

        <a-form-item v-if="modalMode === 'create'" label="初始状态">
          <a-select v-model:value="form.status">
            <a-select-option value="available">可借</a-select-option>
            <a-select-option value="repair">维修</a-select-option>
            <a-select-option value="off_shelf">下架</a-select-option>
          </a-select>
        </a-form-item>

        <template v-if="modalMode === 'status'">
          <a-form-item label="副本">
            <a-input :value="form.barcode" disabled />
          </a-form-item>
          <a-form-item label="目标状态" required>
            <a-select v-model:value="form.status">
              <a-select-option value="available">可借</a-select-option>
              <a-select-option value="repair">维修</a-select-option>
              <a-select-option value="lost">遗失</a-select-option>
              <a-select-option value="off_shelf">下架</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="变更原因" required>
            <a-textarea v-model:value="form.reason" :rows="3" placeholder="请说明状态变更原因" />
          </a-form-item>
        </template>
      </a-form>

      <a-alert
        v-if="inventoryResult"
        type="success"
        show-icon
        :message="`盘点完成：扫描 ${inventoryResult.scanned} 个，找到 ${inventoryResult.found.length} 个，未找到 ${inventoryResult.missing.length} 个`"
      >
        <template v-if="inventoryResult.missing.length" #description>
          未找到：{{ inventoryResult.missing.join('、') }}
        </template>
      </a-alert>
    </JccModal>

    <a-drawer v-model:open="logsOpen" title="副本状态变更日志" :width="'min(560px, 92vw)'">
      <a-spin :spinning="logsLoading">
        <div class="muted small" style="margin-bottom: 14px">
          {{ logsCopy?.barcode }} · {{ logsCopy?.bookTitle }}
        </div>
        <a-empty v-if="!logs.length" description="暂无状态变更记录" />
        <a-timeline v-else>
          <a-timeline-item v-for="log in logs" :key="log.id">
            <div>
              <a-tag>{{ log.fromStatus || '新建' }}</a-tag>
              →
              <a-tag color="blue">{{ log.toStatus }}</a-tag>
            </div>
            <div style="margin-top: 6px">{{ log.reason }}</div>
            <div class="muted small">
              {{ log.operatorName || '系统' }} · {{ formatDateTime(log.createdAt) }}
            </div>
          </a-timeline-item>
        </a-timeline>
      </a-spin>
    </a-drawer>
  </PagePanel>
</template>
