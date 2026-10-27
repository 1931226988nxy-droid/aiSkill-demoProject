<script setup>
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { JccPagePanel, JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { useNotificationStore } from '@/stores/notifications'
import { formatDateTime } from '@/utils'

const notificationStore = useNotificationStore()
const marking = ref(null)
const markingAll = ref(false)

const typeLabels = {
  welcome: '欢迎',
  loan_borrowed: '借阅',
  loan_returned: '归还',
  loan_renewed: '续借',
  loan_due_soon: '到期提醒',
  loan_overdue: '逾期提醒',
  loan_lost: '遗失',
  reservation_created: '预约',
  reservation_ready: '预约到书',
  reservation_expired: '预约过期',
  reservation_cancelled: '预约取消',
  fee_created: '费用',
  fee_handled: '费用处理',
}

const columns = [
  { title: '类型', key: 'type', width: 110 },
  { title: '通知', key: 'content', width: 420 },
  { title: '时间', key: 'createdAt', width: 160 },
  { title: '状态', key: 'read', width: 90 },
  { title: '操作', key: 'action', width: 90, fixed: 'right' },
]

const { filters, page, pageSize, items, total, loading, error, refresh, search, reset, changePage } =
  useTableQuery({
    initialFilters: { unread: 'all' },
    pageSize: 10,
    fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
      api.notifications.list(
        {
          page: pageValue,
          pageSize: sizeValue,
          unread: query.unread === 'unread' ? 1 : undefined,
        },
        { signal },
      ),
  })

async function markRead(record) {
  if (record.readAt) return
  marking.value = record.id
  try {
    await notificationStore.markRead(record.id)
    await refresh()
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    marking.value = null
  }
}

async function markAll() {
  markingAll.value = true
  try {
    await notificationStore.markAllRead()
    message.success('全部通知已标记为已读')
    await refresh()
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    markingAll.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <JccPagePanel title="站内通知">
    <template #extra>
      <a-button :loading="markingAll" @click="markAll">全部标记已读</a-button>
    </template>

    <JccQueryBar :loading="loading" @search="search" @reset="reset">
      <a-select v-model:value="filters.unread" class="filter-field" aria-label="阅读状态">
        <a-select-option value="all">全部通知</a-select-option>
        <a-select-option value="unread">仅未读</a-select-option>
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
      :scroll="{ x: 900 }"
      @page-change="changePage"
      @retry="refresh"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          <a-tag color="blue">{{ typeLabels[record.type] || record.type }}</a-tag>
        </template>
        <template v-else-if="column.key === 'content'">
          <div :class="{ 'unread-title': !record.readAt }">{{ record.title }}</div>
          <div class="muted notification-content">{{ record.content }}</div>
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDateTime(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'read'">
          <a-tag :color="record.readAt ? 'default' : 'orange'">
            {{ record.readAt ? '已读' : '未读' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button
            v-if="!record.readAt"
            type="link"
            size="small"
            :loading="marking === record.id"
            @click="markRead(record)"
          >
            标记已读
          </a-button>
          <span v-else class="muted small">—</span>
        </template>
      </template>
    </JccTable>
  </JccPagePanel>
</template>

<style scoped>
.unread-title {
  font-weight: 600;
}
.notification-content {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.7;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
