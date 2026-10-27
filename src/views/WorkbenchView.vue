<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { JccPagePanel } from '@jcc/shared/components'
import {
  CalendarOutlined,
  DatabaseOutlined,
  EditOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import StatCards from '@/components/StatCards.vue'
import BookCover from '@/components/BookCover.vue'
import PageBody from '@/components/PageBody.vue'
import { formatDateTime } from '@/utils'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(true)
const errorText = ref('')
const data = ref(null)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 11) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const quickLinks = computed(() => {
  const links = []
  if (auth.can('circulation.manage'))
    links.push({ key: 'staff-desk', label: '借还办理', note: '扫描读者证与条码', icon: SearchOutlined })
  if (auth.can('book.manage'))
    links.push({ key: 'catalog-manage', label: '图书编目', note: '新增或维护书目', icon: EditOutlined })
  if (auth.can('copy.manage'))
    links.push({ key: 'copies-manage', label: '馆藏管理', note: '副本入库与盘点', icon: DatabaseOutlined })
  if (auth.can('reader.manage'))
    links.push({ key: 'readers-manage', label: '读者管理', note: '读者档案与状态', icon: TeamOutlined })
  if (auth.can('reservation.manage'))
    links.push({ key: 'reservation-desk', label: '预约处理', note: '待取书与队列', icon: CalendarOutlined })
  return links
})

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    data.value = await api.dashboard()
  } catch (error) {
    errorText.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <JccPagePanel :title="`${greeting}，${auth.user?.displayName || ''}`">
    <template #extra>
      <a-space wrap>
        <span class="muted small">服务日期：{{ formatDateTime(new Date(), { dateOnly: true }) }}</span>
        <a-button type="primary" @click="router.push('/catalog')">
          <SearchOutlined />
          检索图书
        </a-button>
      </a-space>
    </template>

    <PageBody mode="scroll" label="工作台内容">
      <a-skeleton v-if="loading" active :paragraph="{ rows: 10 }" />

      <a-result v-else-if="errorText" status="warning" title="工作台加载失败" :sub-title="errorText">
        <template #extra>
          <a-button type="primary" @click="load">重试</a-button>
        </template>
      </a-result>

      <div v-else-if="data" class="page-stack workbench-page">
        <StatCards :stats="data.stats" />

        <template v-if="auth.isReader">
          <div class="two-column workbench-columns">
            <section class="section-card">
              <div class="section-card__header">
                <div>
                  <div class="section-card__title">当前借阅</div>
                  <div class="muted small">按应还日期排序，逾期记录会标红</div>
                </div>
                <a-button type="link" @click="router.push('/my/loans')">查看全部</a-button>
              </div>
              <div class="section-card__body">
                <a-empty v-if="!data.loans?.length" description="当前没有在借图书">
                  <a-button type="primary" @click="router.push('/catalog')">去借一本</a-button>
                </a-empty>
                <div v-else class="notice-list">
                  <div v-for="loan in data.loans" :key="loan.id" class="notice-item">
                    <div class="table-book-cell">
                      <BookCover :title="loan.bookTitle" size="sm" />
                      <div class="table-book-cell__text">
                        <span class="table-book-cell__title">{{ loan.bookTitle }}</span>
                        <span class="table-book-cell__meta">
                          {{ loan.barcode }} · {{ loan.location }}
                        </span>
                      </div>
                    </div>
                    <div class="nowrap">
                      <a-tag :color="loan.overdue ? 'red' : 'blue'">
                        {{ loan.overdue ? '已逾期' : '应还' }}
                      </a-tag>
                      <span :class="{ 'text-danger': loan.overdue }">
                        {{ formatDateTime(loan.dueAt, { dateOnly: true }) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div class="page-stack workbench-side">
              <section class="section-card">
                <div class="section-card__header">
                  <div class="section-card__title">预约进度</div>
                  <a-button type="link" @click="router.push('/my/reservations')">管理</a-button>
                </div>
                <div class="section-card__body">
                  <a-empty v-if="!data.reservations?.length" description="暂无进行中的预约" />
                  <div v-else class="notice-list">
                    <div v-for="item in data.reservations" :key="item.id" class="notice-item">
                      <div>
                        <div class="notice-item__title">{{ item.bookTitle }}</div>
                        <div class="muted small">
                          {{ item.status === 'ready' ? '已到书，等待取书' : `排队第 ${item.queuePosition} 位` }}
                        </div>
                      </div>
                      <a-tag :color="item.status === 'ready' ? 'orange' : 'blue'">
                        {{ item.status === 'ready' ? '待取书' : '排队中' }}
                      </a-tag>
                    </div>
                  </div>
                </div>
              </section>

              <section class="section-card">
                <div class="section-card__header">
                  <div class="section-card__title">馆内公告</div>
                  <a-button type="link" @click="router.push('/announcements')">更多</a-button>
                </div>
                <div class="section-card__body">
                  <a-empty v-if="!data.announcements?.length" description="暂无公告" />
                  <ul v-else class="notice-list">
                    <li v-for="notice in data.announcements" :key="notice.id" class="notice-item">
                      <div>
                        <div class="notice-item__title">{{ notice.title }}</div>
                        <div class="notice-item__content">{{ notice.content }}</div>
                      </div>
                      <span class="notice-item__date">
                        {{ formatDateTime(notice.publishedAt, { dateOnly: true }) }}
                      </span>
                    </li>
                  </ul>
                </div>
              </section>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="two-column workbench-columns">
            <div class="page-stack workbench-side">
              <section class="section-card">
                <div class="section-card__header">
                  <div class="section-card__title">逾期提醒</div>
                  <a-button type="link" @click="router.push('/staff/fees')">费用处理</a-button>
                </div>
                <div class="section-card__body">
                  <a-empty v-if="!data.alerts?.overdue?.length" description="当前没有逾期借阅" />
                  <a-table
                    v-else
                    size="small"
                    :pagination="false"
                    :data-source="data.alerts.overdue"
                    row-key="id"
                    :scroll="{ x: 560 }"
                  >
                    <a-table-column title="图书" data-index="bookTitle" key="bookTitle" />
                    <a-table-column title="读者" key="reader">
                      <template #default="{ record }">
                        {{ record.readerName }}（{{ record.readerNo }}）
                      </template>
                    </a-table-column>
                    <a-table-column title="条码" data-index="barcode" key="barcode" />
                    <a-table-column title="应还日期" key="dueAt">
                      <template #default="{ record }">
                        <span class="text-danger">
                          {{ formatDateTime(record.dueAt, { dateOnly: true }) }}
                        </span>
                      </template>
                    </a-table-column>
                  </a-table>
                </div>
              </section>

              <section class="section-card">
                <div class="section-card__header">
                  <div class="section-card__title">馆内公告</div>
                  <a-button type="link" @click="router.push('/announcements')">查看全部</a-button>
                </div>
                <div class="section-card__body">
                  <a-empty v-if="!data.announcements?.length" description="暂无公告" />
                  <ul v-else class="notice-list">
                    <li v-for="notice in data.announcements" :key="notice.id" class="notice-item">
                      <div>
                        <div class="notice-item__title">{{ notice.title }}</div>
                        <div class="notice-item__content">{{ notice.content }}</div>
                      </div>
                      <span class="notice-item__date">
                        {{ formatDateTime(notice.publishedAt, { dateOnly: true }) }}
                      </span>
                    </li>
                  </ul>
                </div>
              </section>
            </div>

            <div class="page-stack workbench-side">
              <section class="section-card">
                <div class="section-card__header">
                  <div class="section-card__title">预约待取</div>
                  <a-button type="link" @click="router.push('/staff/reservations')">处理</a-button>
                </div>
                <div class="section-card__body">
                  <a-empty v-if="!data.alerts?.readyReservations?.length" description="暂无待取预约" />
                  <div v-else class="notice-list">
                    <div
                      v-for="item in data.alerts.readyReservations"
                      :key="item.id"
                      class="notice-item"
                    >
                      <div>
                        <div class="notice-item__title">{{ item.bookTitle }}</div>
                        <div class="muted small">
                          {{ item.readerName }} · {{ item.copyBarcode || '副本待分配' }}
                        </div>
                      </div>
                      <span class="notice-item__date">
                        保留至 {{ formatDateTime(item.pickupExpiresAt, { dateOnly: true }) }}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section class="section-card">
                <div class="section-card__header">
                  <div class="section-card__title">快捷办理</div>
                </div>
                <div class="section-card__body">
                  <div class="quick-links">
                    <button
                      v-for="link in quickLinks"
                      :key="link.key"
                      type="button"
                      class="quick-link"
                      @click="router.push({ name: link.key })"
                    >
                      <component :is="link.icon" class="quick-link__icon" />
                      <strong>{{ link.label }}</strong>
                      <span>{{ link.note }}</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </template>
      </div>
    </PageBody>
  </JccPagePanel>
</template>
