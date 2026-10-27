<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { BellOutlined } from '@ant-design/icons-vue'
import { useNotificationStore } from '@/stores/notifications'

const store = useNotificationStore()
const router = useRouter()
let timer

onMounted(() => {
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
