/**
 * 文件职责：未读通知计数与已读操作。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0)
  const loading = ref(false)

  async function refreshUnread() {
    try {
      const data = await api.notifications.unreadCount()
      unreadCount.value = data.count
    } catch {
      // Header badge is non-critical; page-level errors will surface elsewhere.
    }
  }

  async function markRead(id) {
    await api.notifications.markRead(id)
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }

  async function markAllRead() {
    await api.notifications.markAllRead()
    unreadCount.value = 0
  }

  return { unreadCount, loading, refreshUnread, markRead, markAllRead }
})
