<script setup>
import { useRouter } from 'vue-router'
import { JccPagePanel } from '@jcc/shared/components'
import PageBody from '@/components/PageBody.vue'

const router = useRouter()
</script>

<template>
  <JccPagePanel title="无权访问">
    <PageBody mode="scroll" label="无权访问提示">
    <a-result status="403" title="当前账号没有访问权限" sub-title="如需使用该功能，请联系管理员调整角色权限。">
      <template #extra>
        <a-button type="primary" @click="router.push('/')">返回工作台</a-button>
      </template>
    </a-result>
    </PageBody>
  </JccPagePanel>
</template>
