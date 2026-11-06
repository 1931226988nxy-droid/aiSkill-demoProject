<script setup>
// 文件职责：顶栏通知入口与未读数量轮询。
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { BellOutlined } from '@ant-design/icons-vue'
import { useNotificationStore } from '@/stores/notifications'

const store = useNotificationStore()
const router = useRouter()
let timer

onMounted(() => {
  // 顶栏常驻组件只在挂载时轮询未读数，离开布局时清理定时器。
  store.refreshUnread()
  timer = setInterval(() => store.refreshUnread(), 60_000)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <a-button
    type="text"
    aria-label="站内通知"
    title="站内通知"
    @click="router.push('/notifications')"
  >
    <a-badge :count="store.unreadCount" :overflow-count="99" size="small">
      <BellOutlined />
    </a-badge>
  </a-button>
</template>
