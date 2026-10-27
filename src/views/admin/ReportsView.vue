<script setup>
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { downloadBlob } from '@jcc/shared/utils'
import { JccPagePanel } from '@jcc/shared/components'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import StatCards from '@/components/StatCards.vue'
import PageBody from '@/components/PageBody.vue'
import { formatMoney } from '@/utils'

const loading = ref(true)
const exporting = ref(false)
const errorText = ref('')
const summary = ref(null)

function shanghaiDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const today = new Date()
const from = ref(shanghaiDate(new Date(today.getTime() - 29 * 86400000)))
const to = ref(shanghaiDate(today))

const stats = computed(() => {
  if (!summary.value) return []
  const totals = summary.value.totals
  return [
    { key: 'copies', label: '馆藏副本总量', value: totals.copies, unit: '册' },
    { key: 'available', label: '当前可借', value: totals.availableCopies, unit: '册', tone: 'success' },
    { key: 'rangeLoans', label: '区间借阅量', value: totals.rangeLoans, unit: '笔' },
    { key: 'rangeReturns', label: '区间归还量', value: totals.rangeReturns, unit: '笔' },
    { key: 'overdue', label: '当前逾期', value: totals.overdueLoans, unit: '笔', tone: 'danger' },
    { key: 'fees', label: '待处理费用', value: totals.pendingFees, unit: '元', tone: 'warning' },
  ]
})

const maxCategory = computed(() =>
  Math.max(1, ...(summary.value?.categories || []).map((item) => item.copies)),
)

const maxTrend = computed(() =>
  Math.max(
    1,
    ...(summary.value?.trend || []).flatMap((item) => [item.loans, item.returns]),
  ),
)

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    summary.value = await api.reports.summary({ from: from.value, to: to.value })
  } catch (error) {
    errorText.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function exportCsv() {
  exporting.value = true
  try {
    const blob = await api.reports.download({ from: from.value, to: to.value })
    downloadBlob(blob, `图书馆统计报表-${from.value}-${to.value}.csv`)
    message.success('报表已开始下载')
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    exporting.value = false
  }
}

onMounted(load)
</script>

<template>
  <JccPagePanel title="统计报表">
    <template #extra>
      <a-space wrap>
        <a-input v-model:value="from" type="date" aria-label="开始日期" style="width: 145px" />
        <span class="muted">至</span>
        <a-input v-model:value="to" type="date" aria-label="结束日期" style="width: 145px" />
        <a-button type="primary" :loading="loading" @click="load">查询</a-button>
        <a-button :loading="exporting" @click="exportCsv">导出 CSV</a-button>
      </a-space>
    </template>

    <PageBody mode="scroll" label="统计报表内容">
    <a-alert
      type="info"
      show-icon
      message="统计口径：馆藏与逾期为当前实时数据；借阅量、归还量按 Asia/Shanghai 自然日范围统计；热门图书按借阅次数排序。"
      style="margin-bottom: 16px"
    />

    <a-spin :spinning="loading">
      <a-result v-if="errorText" status="warning" title="报表加载失败" :sub-title="errorText">
        <template #extra><a-button type="primary" @click="load">重试</a-button></template>
      </a-result>
      <div v-else-if="summary" class="page-stack">
        <StatCards :stats="stats" />
        <a-alert type="success" show-icon :message="`统计区间：${summary.from} 至 ${summary.to}（Asia/Shanghai）`" />

        <div class="two-column">
          <section class="section-card chart-card">
            <div class="section-card__header">
              <div>
                <div class="section-card__title">借阅趋势</div>
                <div class="muted small">按自然日统计借出与归还</div>
              </div>
              <div class="legend">
                <span><i class="legend__dot"></i>借出</span>
                <span><i class="legend__dot legend__dot--return"></i>归还</span>
              </div>
            </div>
            <div class="section-card__body">
              <a-empty v-if="!summary.trend.length" description="所选区间暂无借还记录" />
              <div v-else class="trend-grid">
                <div v-for="item in summary.trend" :key="item.date" class="trend-col">
                  <div class="trend-col__bars">
                    <div
                      class="trend-col__bar"
                      :style="{ height: `${Math.max(2, (item.loans / maxTrend) * 110)}px` }"
                      :title="`${item.date} 借出 ${item.loans}`"
                    ></div>
                    <div
                      class="trend-col__bar trend-col__bar--return"
                      :style="{ height: `${Math.max(2, (item.returns / maxTrend) * 110)}px` }"
                      :title="`${item.date} 归还 ${item.returns}`"
                    ></div>
                  </div>
                  <span class="trend-col__label">{{ item.date.slice(5) }}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="section-card chart-card">
            <div class="section-card__header">
              <div class="section-card__title">分类馆藏分布</div>
            </div>
            <div class="section-card__body">
              <a-empty v-if="!summary.categories.length" description="暂无馆藏" />
              <div v-else class="chart-bars">
                <div v-for="item in summary.categories" :key="item.name" class="bar-row">
                  <span class="bar-row__label">{{ item.name }}</span>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: `${(item.copies / maxCategory) * 100}%` }"></div>
                  </div>
                  <span class="bar-value">{{ item.copies }}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section class="section-card">
          <div class="section-card__header">
            <div class="section-card__title">热门图书</div>
            <span class="muted small">按所选区间借阅次数</span>
          </div>
          <div class="section-card__body">
            <a-empty v-if="!summary.popular.length" description="所选区间暂无借阅" />
            <a-table
              v-else
              size="small"
              :pagination="false"
              :data-source="summary.popular"
              row-key="id"
            >
              <a-table-column title="排名" key="rank" width="70">
                <template #default="{ index }">{{ index + 1 }}</template>
              </a-table-column>
              <a-table-column title="书名" data-index="title" key="title" />
              <a-table-column title="作者" key="authors">
                <template #default="{ record }">{{ record.authors?.join('、') || '—' }}</template>
              </a-table-column>
              <a-table-column title="ISBN" data-index="isbn" key="isbn" />
              <a-table-column title="借阅次数" data-index="loanCount" key="loanCount" width="110" />
            </a-table>
          </div>
        </section>

        <section class="section-card">
          <div class="section-card__header"><div class="section-card__title">汇总明细</div></div>
          <div class="section-card__body">
            <div class="detail-grid">
              <div class="detail-item"><div class="detail-label">馆藏品种</div><div class="detail-value">{{ summary.totals.titles }}</div></div>
              <div class="detail-item"><div class="detail-label">在借副本</div><div class="detail-value">{{ summary.totals.borrowedCopies }}</div></div>
              <div class="detail-item"><div class="detail-label">预约保留副本</div><div class="detail-value">{{ summary.totals.reservedCopies }}</div></div>
              <div class="detail-item"><div class="detail-label">进行中预约</div><div class="detail-value">{{ summary.totals.activeReservations }}</div></div>
              <div class="detail-item"><div class="detail-label">活跃读者</div><div class="detail-value">{{ summary.totals.activeReaders }}</div></div>
              <div class="detail-item"><div class="detail-label">待处理费用</div><div class="detail-value">{{ formatMoney(summary.totals.pendingFees) }}</div></div>
            </div>
          </div>
        </section>
      </div>
    </a-spin>
    </PageBody>
  </JccPagePanel>
</template>
