<script setup>
import { onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { JccPagePanel, JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { ANNOUNCEMENT_STATUS_META } from '@/constants'
import { formatDateTime } from '@/utils'
import StatusTag from '@/components/StatusTag.vue'

const modalOpen = ref(false)
const modalMode = ref('create')
const saving = ref(false)
const modalError = ref('')
const formRef = ref()
const editing = ref(null)
const form = reactive({ title: '', content: '', publishNow: false })
const formRules = {
  title: [{ required: true, message: '请输入公告标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入公告内容', trigger: 'blur' }],
}

const columns = [
  { title: '标题', dataIndex: 'title', key: 'title', width: 300 },
  { title: '状态', key: 'status', width: 100 },
  { title: '发布时间', key: 'publishedAt', width: 170 },
  { title: '创建人', dataIndex: 'createdByName', key: 'createdByName', width: 120 },
  { title: '更新时间', key: 'updatedAt', width: 170 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' },
]

const { filters, page, pageSize, items, total, loading, error, refresh, search, reset, changePage } =
  useTableQuery({
    initialFilters: { q: '', status: 'all' },
    pageSize: 10,
    fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
      api.admin.announcements(
        {
          page: pageValue,
          pageSize: sizeValue,
          q: query.q || undefined,
          status: query.status === 'all' ? undefined : query.status,
        },
        { signal },
      ),
  })

function openCreate() {
  modalMode.value = 'create'
  editing.value = null
  modalError.value = ''
  form.title = ''
  form.content = ''
  form.publishNow = false
  modalOpen.value = true
}

function openEdit(record) {
  modalMode.value = 'edit'
  editing.value = record
  modalError.value = ''
  form.title = record.title
  form.content = record.content
  form.publishNow = false
  modalOpen.value = true
}

async function save() {
  if (saving.value) return
  modalError.value = ''
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (modalMode.value === 'create') {
      await api.admin.createAnnouncement({
        title: form.title,
        content: form.content,
        status: form.publishNow ? 'published' : 'draft',
      })
      message.success(form.publishNow ? '公告已发布' : '公告草稿已保存')
    } else {
      await api.admin.updateAnnouncement(editing.value.id, {
        title: form.title,
        content: form.content,
      })
      message.success('公告已更新')
    }
    modalOpen.value = false
    await refresh()
  } catch (error) {
    modalError.value = getErrorMessage(error)
  } finally {
    saving.value = false
  }
}

function changeStatus(record, status) {
  Modal.confirm({
    title: status === 'published' ? '发布公告？' : '撤回公告？',
    content:
      status === 'published'
        ? `发布后所有登录用户都能看到《${record.title}》。`
        : `撤回后读者将不再看到《${record.title}》。`,
    okText: '确认',
    onOk: async () => {
      try {
        await api.admin.setAnnouncementStatus(record.id, status)
        message.success(status === 'published' ? '公告已发布' : '公告已撤回')
        await refresh()
      } catch (error) {
        message.error(getErrorMessage(error))
      }
    },
  })
}

onMounted(refresh)
</script>

<template>
  <JccPagePanel title="公告管理">
    <template #extra><a-button type="primary" @click="openCreate">新增公告</a-button></template>

    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <a-input v-model:value="filters.q" class="filter-field--wide" placeholder="标题或内容" allow-clear />
      <a-select v-model:value="filters.status" class="filter-field" aria-label="公告状态">
        <a-select-option value="all">全部状态</a-select-option>
        <a-select-option value="draft">草稿</a-select-option>
        <a-select-option value="published">已发布</a-select-option>
        <a-select-option value="withdrawn">已撤回</a-select-option>
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
      :scroll="{ x: 1000 }"
      @page-change="changePage"
      @retry="refresh"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <div class="announcement-title">{{ record.title }}</div>
          <div class="muted small announcement-preview">{{ record.content }}</div>
        </template>
        <template v-else-if="column.key === 'status'">
          <StatusTag :status="record.status" :map="ANNOUNCEMENT_STATUS_META" />
        </template>
        <template v-else-if="column.key === 'publishedAt'">
          {{ record.publishedAt ? formatDateTime(record.publishedAt) : '未发布' }}
        </template>
        <template v-else-if="column.key === 'createdByName'">
          {{ record.createdByName || '—' }}
        </template>
        <template v-else-if="column.key === 'updatedAt'">
          {{ formatDateTime(record.updatedAt) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <div class="table-actions">
            <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
            <a-button
              v-if="record.status !== 'published'"
              type="link"
              size="small"
              @click="changeStatus(record, 'published')"
            >
              发布
            </a-button>
            <a-button
              v-if="record.status === 'published'"
              type="link"
              size="small"
              danger
              @click="changeStatus(record, 'withdrawn')"
            >
              撤回
            </a-button>
          </div>
        </template>
      </template>
    </JccTable>

    <a-modal
      v-model:open="modalOpen"
      :title="modalMode === 'create' ? '新增公告' : '编辑公告'"
      :confirm-loading="saving"
      ok-text="保存"
      cancel-text="取消"
      :mask-closable="false"
      width="min(720px, 94vw)"
      @ok="save"
    >
      <a-alert v-if="modalError" type="error" show-icon :message="modalError" style="margin-bottom: 14px" />
      <a-form ref="formRef" :model="form" :rules="formRules" layout="vertical">
        <a-form-item label="标题" name="title">
          <a-input v-model:value="form.title" :maxlength="120" show-count />
        </a-form-item>
        <a-form-item label="内容" name="content">
          <a-textarea v-model:value="form.content" :rows="8" :maxlength="5000" show-count />
        </a-form-item>
        <a-form-item v-if="modalMode === 'create'" label="发布方式">
          <a-checkbox v-model:checked="form.publishNow">创建后立即发布</a-checkbox>
        </a-form-item>
      </a-form>
    </a-modal>
  </JccPagePanel>
</template>

<style scoped>
.announcement-title {
  font-weight: 600;
}
.announcement-preview {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 3px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
