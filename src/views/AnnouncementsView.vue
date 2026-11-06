<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：读者/馆员公告列表与详情弹窗。
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { formatDateTime } from '@/utils'
import PageBody from '@/components/PageBody.vue'

const loading = ref(true)
const errorText = ref('')
const items = ref([])
const selected = ref(null)
const detailOpen = ref(false)

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const data = await api.announcements.list()
    items.value = data.items
  } catch (error) {
    errorText.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function openDetail(item) {
  selected.value = item
  detailOpen.value = true
}

onMounted(load)
</script>

<template>
  <PagePanel title="馆内公告">
    <template #extra><span class="muted small">只展示管理员已发布的内容</span></template>

    <PageBody mode="scroll" label="公告内容">
    <a-skeleton v-if="loading" active :paragraph="{ rows: 8 }" />
    <a-result v-else-if="errorText" status="warning" title="公告加载失败" :sub-title="errorText">
      <template #extra><a-button type="primary" @click="load">重试</a-button></template>
    </a-result>
    <a-empty v-else-if="!items.length" description="暂无已发布公告" />
    <div v-else class="page-stack">
      <article v-for="item in items" :key="item.id" class="notice-card section-card">
        <div class="section-card__body">
          <div class="notice-card__head">
            <button type="button" class="link-title" @click="openDetail(item)">
              {{ item.title }}
            </button>
            <span class="muted small">
              {{ formatDateTime(item.publishedAt, { dateOnly: true }) }}
            </span>
          </div>
          <div class="notice-card__body">
            {{ item.content }}
          </div>
          <div class="page-toolbar" style="margin-top: 12px">
            <span class="muted small">发布人：{{ item.createdByName || '管理员' }}</span>
            <a-button type="link" @click="openDetail(item)">查看全文</a-button>
          </div>
        </div>
      </article>
    </div>
    </PageBody>

    <a-modal
      v-model:open="detailOpen"
      :title="selected?.title"
      :footer="null"
      width="min(720px, 92vw)"
    >
      <div class="muted small" style="margin-bottom: 14px">
        {{ formatDateTime(selected?.publishedAt) }} · {{ selected?.createdByName || '管理员' }}
      </div>
      <div class="book-summary">{{ selected?.content }}</div>
    </a-modal>
  </PagePanel>
</template>

<style scoped>
.link-title {
  padding: 0;
  color: var(--color-text);
  font: inherit;
  font-size: 17px;
  font-weight: 600;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.link-title:hover {
  color: var(--color-primary);
}
.notice-card__body {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-muted);
  line-height: 1.8;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.book-summary {
  margin: 0;
}
</style>
