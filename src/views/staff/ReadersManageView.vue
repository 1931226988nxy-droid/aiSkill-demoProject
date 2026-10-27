<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { JccPagePanel, JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import {
  FEE_STATUS_META,
  FEE_TYPE_META,
  LOAN_STATUS_META,
  READER_STATUS_META,
  RESERVATION_STATUS_META,
} from '@/constants'
import { formatDateTime, formatMoney } from '@/utils'
import StatusTag from '@/components/StatusTag.vue'

const auth = useAuthStore()

const readerFormRef = ref()
const feeFormRef = ref()
const modalOpen = ref(false)
const modalMode = ref('create')
const saving = ref(false)
const modalError = ref('')
const detailOpen = ref(false)
const detailLoading = ref(false)
const selectedReader = ref(null)
const detailTab = ref('loans')
const detailData = reactive({ loans: [], reservations: [], fees: [] })
const statusOpen = ref(false)
const statusSaving = ref(false)
const statusForm = reactive({ status: 'disabled', reason: '' })
const feeOpen = ref(false)
const feeSaving = ref(false)
const feeForm = reactive({ type: 'damage', amount: 0, note: '' })
const readerForm = reactive({
  username: '',
  password: '',
  fullName: '',
  phone: '',
  email: '',
  idCard: '',
  maxBorrowOverride: null,
  expiresAt: '',
})

const columns = [
  { title: '读者', key: 'reader', width: 210 },
  { title: '联系方式', key: 'contact', width: 210 },
  { title: '状态', key: 'status', width: 90 },
  { title: '在借 / 预约', key: 'loans', width: 130 },
  { title: '待处理费用', key: 'fees', width: 130 },
  { title: '注册时间', key: 'createdAt', width: 150 },
  { title: '操作', key: 'action', width: 160, fixed: 'right' },
]

const readerRules = computed(() => ({
  username: modalMode.value === 'create'
    ? [
        { required: true, message: '请输入用户名', trigger: 'blur' },
        { pattern: /^[A-Za-z0-9_]{3,32}$/, message: '3-32 位字母、数字或下划线', trigger: 'blur' },
      ]
    : [],
  password: modalMode.value === 'create'
    ? [
        { required: true, message: '请设置初始密码', trigger: 'blur' },
        { min: 8, message: '密码至少 8 位', trigger: 'blur' },
      ]
    : [],
  fullName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入正确的邮箱', trigger: 'blur' }],
  idCard: [{ pattern: /^(\d{15}|\d{17}[\dXx])$/, message: '请输入正确的身份证号', trigger: 'blur' }],
}))

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
  initialFilters: { q: '', status: 'all' },
  pageSize: 10,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.readers.list(
      {
        page: pageValue,
        pageSize: sizeValue,
        q: query.q || undefined,
        status: query.status === 'all' ? undefined : query.status,
      },
      { signal },
    ),
})

function resetReaderForm() {
  Object.assign(readerForm, {
    username: '',
    password: '',
    fullName: '',
    phone: '',
    email: '',
    idCard: '',
    maxBorrowOverride: null,
    expiresAt: '',
  })
  modalError.value = ''
}

function openCreate() {
  modalMode.value = 'create'
  resetReaderForm()
  modalOpen.value = true
}

async function openEdit(reader) {
  modalMode.value = 'edit'
  selectedReader.value = reader
  modalError.value = ''
  try {
    const detail = await api.readers.get(reader.id)
    Object.assign(readerForm, {
      username: detail.username,
      password: '',
      fullName: detail.fullName,
      phone: detail.phone,
      email: detail.email,
      idCard: detail.idCard,
      maxBorrowOverride: detail.maxBorrowOverride,
      expiresAt: detail.expiresAt ? detail.expiresAt.slice(0, 10) : '',
    })
    modalOpen.value = true
  } catch (error) {
    message.error(getErrorMessage(error))
  }
}

async function submitReader() {
  if (saving.value) return
  modalError.value = ''
  try {
    await readerFormRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (modalMode.value === 'create') {
      await api.readers.create({ ...readerForm })
      message.success('读者已创建')
    } else {
      const { username, password, ...payload } = readerForm
      await api.readers.update(selectedReader.value.id, payload)
      message.success('读者资料已更新')
      if (detailOpen.value) await loadDetail(selectedReader.value.id)
    }
    modalOpen.value = false
    await refresh()
  } catch (error) {
    modalError.value = getErrorMessage(error)
  } finally {
    saving.value = false
  }
}

async function loadDetail(id) {
  detailLoading.value = true
  try {
    const [reader, loans, reservations, fees] = await Promise.all([
      api.readers.get(id),
      api.circulation.loans({ readerId: id, page: 1, pageSize: 20, status: 'all' }),
      api.reservations.list({ readerId: id, page: 1, pageSize: 20, status: 'all' }),
      api.fees.list({ readerId: id, page: 1, pageSize: 20, status: 'all' }),
    ])
    selectedReader.value = reader
    detailData.loans = loans.items
    detailData.reservations = reservations.items
    detailData.fees = fees.items
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    detailLoading.value = false
  }
}

async function openDetail(reader) {
  detailTab.value = 'loans'
  detailOpen.value = true
  await loadDetail(reader.id)
}

function askStatus(reader) {
  selectedReader.value = reader
  statusForm.status = reader.status === 'active' ? 'disabled' : 'active'
  statusForm.reason = ''
  statusOpen.value = true
}

async function changeStatus() {
  if (!statusForm.reason.trim()) {
    message.warning('请填写停用或启用原因')
    return
  }
  statusSaving.value = true
  try {
    await api.readers.setStatus(selectedReader.value.id, { ...statusForm })
    message.success(statusForm.status === 'active' ? '读者已启用' : '读者已停用')
    statusOpen.value = false
    await refresh()
    if (detailOpen.value) await loadDetail(selectedReader.value.id)
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    statusSaving.value = false
  }
}

function openFee() {
  feeForm.type = 'damage'
  feeForm.amount = 0
  feeForm.note = ''
  feeOpen.value = true
}

async function createFee() {
  if (feeSaving.value) return
  try {
    await feeFormRef.value.validate()
  } catch {
    return
  }
  feeSaving.value = true
  try {
    await api.fees.create({
      readerId: selectedReader.value.id,
      type: feeForm.type,
      amount: feeForm.amount,
      note: feeForm.note,
    })
    message.success('费用已登记')
    feeOpen.value = false
    await loadDetail(selectedReader.value.id)
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    feeSaving.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <JccPagePanel title="读者管理">
    <template #extra>
      <a-space wrap>
        <span class="muted small">列表联系方式默认脱敏</span>
        <a-button type="primary" @click="openCreate">新增读者</a-button>
      </a-space>
    </template>

    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <a-input v-model:value="filters.q" class="filter-field--wide" placeholder="读者编号 / 姓名 / 手机号" allow-clear />
      <a-select v-model:value="filters.status" class="filter-field" aria-label="读者状态">
        <a-select-option value="all">全部状态</a-select-option>
        <a-select-option value="active">启用</a-select-option>
        <a-select-option value="disabled">停用</a-select-option>
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
        <template v-if="column.key === 'reader'">
          <div>{{ record.fullName }}</div>
          <div class="muted small">{{ record.readerNo }} · {{ record.username }}</div>
        </template>
        <template v-else-if="column.key === 'contact'">
          <div>{{ record.phone || '—' }}</div>
          <div class="muted small">{{ record.email || '—' }}</div>
        </template>
        <template v-else-if="column.key === 'status'">
          <StatusTag :status="record.status" :map="READER_STATUS_META" />
        </template>
        <template v-else-if="column.key === 'loans'">
          <a-tag color="blue">{{ record.activeLoans }} 在借</a-tag>
          <a-tag>{{ record.activeReservations }} 预约</a-tag>
          <a-tag v-if="record.overdueLoans" color="red">{{ record.overdueLoans }} 逾期</a-tag>
        </template>
        <template v-else-if="column.key === 'fees'">
          <span :class="{ 'text-danger': record.pendingFees > 0 }">
            {{ formatMoney(record.pendingFees) }}
          </span>
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDateTime(record.createdAt, { dateOnly: true }) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <div class="table-actions">
            <a-button type="link" size="small" @click="openDetail(record)">详情</a-button>
            <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
            <a-button type="link" size="small" @click="askStatus(record)">
              {{ record.status === 'active' ? '停用' : '启用' }}
            </a-button>
          </div>
        </template>
      </template>
    </JccTable>

    <a-modal
      v-model:open="modalOpen"
      :title="modalMode === 'create' ? '新增读者' : '编辑读者'"
      :confirm-loading="saving"
      ok-text="保存"
      cancel-text="取消"
      :mask-closable="false"
      width="min(700px, 94vw)"
      @ok="submitReader"
    >
      <a-alert v-if="modalError" type="error" show-icon :message="modalError" style="margin-bottom: 14px" />
      <a-form ref="readerFormRef" :model="readerForm" :rules="readerRules" layout="vertical">
        <a-row :gutter="16">
          <a-col :xs="24" :sm="12">
            <a-form-item label="用户名" name="username">
              <a-input v-model:value="readerForm.username" :disabled="modalMode === 'edit'" autocomplete="off" />
            </a-form-item>
          </a-col>
          <a-col v-if="modalMode === 'create'" :xs="24" :sm="12">
            <a-form-item label="初始密码" name="password">
              <a-input-password v-model:value="readerForm.password" autocomplete="new-password" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="姓名" name="fullName">
              <a-input v-model:value="readerForm.fullName" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="手机号" name="phone">
              <a-input v-model:value="readerForm.phone" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="邮箱" name="email">
              <a-input v-model:value="readerForm.email" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="身份证号" name="idCard">
              <a-input v-model:value="readerForm.idCard" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="借阅上限覆盖（选填）" name="maxBorrowOverride">
              <a-input-number v-model:value="readerForm.maxBorrowOverride" :min="1" :max="100" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="读者证有效期（选填）" name="expiresAt">
              <a-input v-model:value="readerForm.expiresAt" type="date" />
            </a-form-item>
          </a-col>
        </a-row>
        <p class="muted small">手机号和邮箱至少填写一项；留空借阅上限则使用系统配置。</p>
      </a-form>
    </a-modal>

    <a-modal
      :open="statusOpen"
      :title="statusForm.status === 'active' ? '启用读者' : '停用读者'"
      :confirm-loading="statusSaving"
      ok-text="确认"
      cancel-text="取消"
      @cancel="statusOpen = false"
      @ok="changeStatus"
    >
      <p>
        将对 {{ selectedReader?.fullName }}（{{ selectedReader?.readerNo }}）执行
        {{ statusForm.status === 'active' ? '启用' : '停用' }}。
      </p>
      <a-form layout="vertical">
        <a-form-item label="原因" required>
          <a-textarea v-model:value="statusForm.reason" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-drawer
      v-model:open="detailOpen"
      title="读者档案"
      width="min(920px, 94vw)"
      :body-style="{ paddingBottom: '24px' }"
    >
      <a-spin :spinning="detailLoading">
        <template v-if="selectedReader">
          <div class="reader-header" style="margin-bottom: 16px">
            <div class="reader-avatar" aria-hidden="true">
              {{ selectedReader.fullName.slice(0, 1) }}
            </div>
            <div>
              <div class="page-toolbar">
                <strong>{{ selectedReader.fullName }}</strong>
                <StatusTag :status="selectedReader.status" :map="READER_STATUS_META" />
              </div>
              <div class="muted small">
                {{ selectedReader.readerNo }} · {{ selectedReader.username }}
              </div>
            </div>
            <a-space style="margin-left: auto" wrap>
              <a-button size="small" @click="openEdit(selectedReader)">编辑</a-button>
              <a-button v-if="auth.can('fee.manage')" size="small" @click="openFee">登记费用</a-button>
              <a-button size="small" @click="askStatus(selectedReader)">状态</a-button>
            </a-space>
          </div>

          <a-descriptions bordered size="small" :column="{ xs: 1, sm: 2 }">
            <a-descriptions-item label="手机号">{{ selectedReader.phone || '—' }}</a-descriptions-item>
            <a-descriptions-item label="邮箱">{{ selectedReader.email || '—' }}</a-descriptions-item>
            <a-descriptions-item label="身份证号">{{ selectedReader.idCard || '—' }}</a-descriptions-item>
            <a-descriptions-item label="有效期">
              {{ selectedReader.expiresAt ? formatDateTime(selectedReader.expiresAt, { dateOnly: true }) : '长期' }}
            </a-descriptions-item>
            <a-descriptions-item label="当前在借">{{ selectedReader.activeLoans }} 册</a-descriptions-item>
            <a-descriptions-item label="待处理费用">
              {{ formatMoney(selectedReader.pendingFees) }}
            </a-descriptions-item>
          </a-descriptions>

          <a-tabs v-model:activeKey="detailTab" style="margin-top: 16px">
            <a-tab-pane key="loans" tab="借阅记录">
              <a-table size="small" :data-source="detailData.loans" :pagination="false" row-key="id">
                <a-table-column title="图书" data-index="bookTitle" key="bookTitle" />
                <a-table-column title="条码" data-index="barcode" key="barcode" />
                <a-table-column title="应还" key="dueAt">
                  <template #default="{ record }">
                    {{ formatDateTime(record.dueAt, { dateOnly: true }) }}
                  </template>
                </a-table-column>
                <a-table-column title="状态" key="status">
                  <template #default="{ record }">
                    <StatusTag :status="record.overdue ? 'overdue' : record.status" :map="LOAN_STATUS_META" />
                  </template>
                </a-table-column>
              </a-table>
            </a-tab-pane>
            <a-tab-pane key="reservations" tab="预约记录">
              <a-table size="small" :data-source="detailData.reservations" :pagination="false" row-key="id">
                <a-table-column title="图书" data-index="bookTitle" key="bookTitle" />
                <a-table-column title="排队位置" data-index="queuePosition" key="queuePosition" />
                <a-table-column title="状态" key="status">
                  <template #default="{ record }">
                    <StatusTag :status="record.status" :map="RESERVATION_STATUS_META" />
                  </template>
                </a-table-column>
              </a-table>
            </a-tab-pane>
            <a-tab-pane key="fees" tab="费用记录">
              <a-table size="small" :data-source="detailData.fees" :pagination="false" row-key="id">                <a-table-column title="类型" key="type">
                  <template #default="{ record }">
                    <StatusTag :status="record.type" :map="FEE_TYPE_META" />
                  </template>
                </a-table-column>
                <a-table-column title="金额" key="amount">
                  <template #default="{ record }">{{ formatMoney(record.amount) }}</template>
                </a-table-column>
                <a-table-column title="状态" key="status">
                  <template #default="{ record }">
                    <StatusTag :status="record.status" :map="FEE_STATUS_META" />
                  </template>
                </a-table-column>
                <a-table-column title="说明" data-index="note" key="note" />
              </a-table>
            </a-tab-pane>
          </a-tabs>
        </template>
      </a-spin>
    </a-drawer>

    <a-modal
      v-model:open="feeOpen"
      title="登记读者费用"
      :confirm-loading="feeSaving"
      ok-text="登记"
      cancel-text="取消"
      @ok="createFee"
    >
      <a-form ref="feeFormRef" :model="feeForm" layout="vertical">
        <a-form-item label="费用类型" name="type" :rules="[{ required: true, message: '请选择类型' }]">
          <a-select v-model:value="feeForm.type">
            <a-select-option value="damage">损坏赔偿</a-select-option>
            <a-select-option value="lost">遗失赔偿</a-select-option>
            <a-select-option value="manual">人工费用</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="金额（元）" name="amount" :rules="[{ required: true, message: '请输入金额' }]">
          <a-input-number v-model:value="feeForm.amount" :min="0.01" :precision="2" style="width: 100%" />
        </a-form-item>
        <a-form-item label="说明" name="note" :rules="[{ required: true, min: 2, message: '请填写费用说明' }]">
          <a-textarea v-model:value="feeForm.note" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>
  </JccPagePanel>
</template>
