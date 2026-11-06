<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：403 无权限提示页。
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import PageBody from '@/components/PageBody.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const switching = ref(false)
const readerOnly = computed(() => route.query.reason === 'reader-only')
const canSwitchToAdmin = computed(() =>
  !readerOnly.value && auth.role !== 'admin' && auth.roles.some((role) => role.code === 'admin'),
)
const resultTitle = computed(() =>
  readerOnly.value ? '此页面仅对读者角色开放' : '当前角色无法访问此页面',
)
const resultDescription = computed(() => {
  const roleName = auth.activeRole?.name || '当前角色'
  if (readerOnly.value) {
    return auth.roles.some((role) => role.code === 'reader')
      ? `当前使用的是${roleName}角色，读者个人业务需要切换到读者角色。`
      : `当前使用的是${roleName}角色，此账号没有读者角色，无法打开个人借阅页面。`
  }
  if (canSwitchToAdmin.value) return `当前使用的是${roleName}角色，可切换到管理员角色后继续访问。`
  if (auth.role === 'admin') return '管理员角色拥有全部启用中的权限；请从功能入口重新进入，或检查该页面的角色限制。'
  return `当前使用的是${roleName}角色，如需使用该功能，请联系管理员调整角色权限。`
})

async function switchToAdmin() {
  switching.value = true
  try {
    await auth.switchRole('admin')
    const target = typeof route.query.from === 'string' && route.query.from.startsWith('/')
      && !route.query.from.startsWith('//') ? route.query.from : '/'
    await router.replace(target)
  } catch (error) {
    message.error(error?.message || '切换管理员角色失败')
  } finally {
    switching.value = false
  }
}
</script>

<template>
  <PagePanel title="无权访问">
    <PageBody mode="scroll" label="无权访问提示">
    <a-result status="403" :title="resultTitle" :sub-title="resultDescription">
      <template #extra>
        <a-space>
          <a-button v-if="canSwitchToAdmin" type="primary" :loading="switching" @click="switchToAdmin">
            切换到管理员并继续
          </a-button>
          <a-button :type="canSwitchToAdmin ? 'default' : 'primary'" @click="router.push('/')">
            返回工作台
          </a-button>
        </a-space>
      </template>
    </a-result>
    </PageBody>
  </PagePanel>
</template>
