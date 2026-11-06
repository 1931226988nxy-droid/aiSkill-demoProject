<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：图书详情、馆藏状态和读者预约入口。
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { BOOK_STATUS_META, COPY_STATUS_META } from '@/constants'
import { formatDateTime, formatMoney } from '@/utils'
import BookCover from '@/components/BookCover.vue'
import PageBody from '@/components/PageBody.vue'
import StatusTag from '@/components/StatusTag.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)
const errorText = ref('')
const book = ref(null)
const reserving = ref(false)

const availableCopies = computed(() =>
  (book.value?.copies || []).filter((copy) => copy.status === 'available'),
)
const canReserve = computed(
  // 只有读者、图书在架且确实没有可借副本时才显示预约按钮。
  () =>
    auth.isReader &&
    book.value?.status === 'active' &&
    book.value?.availableCopies === 0 &&
    !reserving.value,
)

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    book.value = await api.books.get(route.params.id)
  } catch (error) {
    errorText.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function reserve() {
  if (!auth.isReader) {
    message.info('请使用读者账号办理预约')
    return
  }
  Modal.confirm({
    title: '确认预约这本书？',
    content: `《${book.value.title}》当前没有可借副本，预约后将进入排队队列并以到书通知为准。`,
    okText: '确认预约',
    cancelText: '再想想',
    onOk: async () => {
      reserving.value = true
      try {
        // 预约成功后重新加载详情，队列位置以服务端计算为准。
        const result = await api.reservations.create({ bookId: book.value.id })
        message.success(`预约成功，当前排队第 ${result.queuePosition} 位`)
        await load()
      } catch (error) {
        message.error(getErrorMessage(error))
      } finally {
        reserving.value = false
      }
    },
  })
}

onMounted(load)
</script>

<template>
  <PagePanel title="图书详情">
    <template #extra>
      <a-space wrap>
        <a-button
          v-if="auth.can('book.manage')"
          @click="router.push({ name: 'catalog-manage', query: { edit: book?.id } })"
        >
          维护书目
        </a-button>
        <a-button
          v-if="auth.can('copy.manage')"
          @click="router.push({ name: 'copies-manage', query: { bookId: book?.id } })"
        >
          管理馆藏
        </a-button>
      </a-space>
    </template>

    <PageBody mode="scroll" label="图书详情内容">
      <a-skeleton v-if="loading" active :paragraph="{ rows: 12 }" />
    <a-result v-else-if="errorText" status="warning" title="无法加载图书" :sub-title="errorText">
      <template #extra><a-button type="primary" @click="load">重试</a-button></template>
    </a-result>

    <div v-else-if="book" class="page-stack">
      <div class="book-hero">
        <BookCover :title="book.title" :cover-url="book.coverUrl" size="lg" />
        <div>
          <h1 class="book-hero__title">{{ book.title }}</h1>
          <p v-if="book.subtitle" class="book-hero__subtitle">{{ book.subtitle }}</p>
          <div class="book-hero__meta">
            <span>作者：<strong>{{ book.authors?.join('、') || '—' }}</strong></span>
            <span>分类：<strong>{{ book.categoryName || '未分类' }}</strong></span>
            <span>ISBN：<strong>{{ book.isbn }}</strong></span>
            <span>版本：<strong>{{ book.edition || '—' }}</strong></span>
            <span>语言：<strong>{{ book.language || '—' }}</strong></span>
          </div>
          <a-space wrap>
            <StatusTag :status="book.status" :map="BOOK_STATUS_META" />
            <a-tag color="green">可借 {{ book.availableCopies }} 册</a-tag>
            <a-tag>馆藏 {{ book.totalCopies }} 册</a-tag>
            <a-tag v-if="book.activeReservations" color="orange">
              {{ book.activeReservations }} 人预约
            </a-tag>
          </a-space>
          <div class="book-hero__actions">
            <a-tooltip
              v-if="auth.isReader"
              :title="book.availableCopies > 0 ? '当前有可借副本，无需预约' : '无可用副本时可预约'"
            >
              <a-button
                type="primary"
                :disabled="!canReserve"
                :loading="reserving"
                @click="reserve"
              >
                {{ book.availableCopies > 0 ? '有可借副本' : '预约此书' }}
              </a-button>
            </a-tooltip>
            <a-button @click="router.push('/catalog')">继续检索</a-button>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">出版社</div>
          <div class="detail-value">{{ book.publisher || '—' }}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">出版日期</div>
          <div class="detail-value">
            {{ formatDateTime(book.publishDate, { dateOnly: true }) }}
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-label">译者</div>
          <div class="detail-value">{{ book.translator || '—' }}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">定价</div>
          <div class="detail-value">{{ formatMoney(book.price) }}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">关键词</div>
          <div class="detail-value">{{ book.keywords || '—' }}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">最近更新</div>
          <div class="detail-value">{{ formatDateTime(book.updatedAt) }}</div>
        </div>
      </div>

      <section class="section-card">
        <div class="section-card__header"><div class="section-card__title">内容简介</div></div>
        <div class="section-card__body">
          <p class="book-summary">{{ book.summary || '暂无简介。' }}</p>
        </div>
      </section>

      <section class="section-card">
        <div class="section-card__header">
          <div>
            <div class="section-card__title">馆藏分布</div>
            <div class="muted small">状态实时反映副本流转情况</div>
          </div>
        </div>
        <div class="section-card__body">
          <div class="copy-location-list">
            <div v-for="location in book.locations" :key="location" class="copy-location">
              <div class="copy-location__name">{{ location }}</div>
              <div class="copy-location__meta">
                {{ book.copies.filter((copy) => copy.location === location).length }} 册 · 可借
                {{ book.copies.filter((copy) => copy.location === location && copy.status === 'available').length }} 册
              </div>
            </div>
          </div>
          <a-table
            size="small"
            :pagination="false"
            :data-source="book.copies"
            row-key="id"
            :scroll="{ x: 700 }"
            class="detail-descriptions"
          >
            <a-table-column title="条码" data-index="barcode" key="barcode" />
            <a-table-column title="馆藏地" data-index="location" key="location" />
            <a-table-column title="书架" data-index="shelf" key="shelf" />
            <a-table-column title="状态" key="status">
              <template #default="{ record }">
                <StatusTag :status="record.status" :map="COPY_STATUS_META" />
              </template>
            </a-table-column>
            <a-table-column title="最近盘点" key="inventory">
              <template #default="{ record }">
                {{ record.lastInventoryAt ? formatDateTime(record.lastInventoryAt) : '未盘点' }}
              </template>
            </a-table-column>
          </a-table>
        </div>
      </section>
    </div>
    </PageBody>
  </PagePanel>
</template>

<style scoped>
.book-summary {
  margin: 0;
}
</style>
