<script setup>
import { useRouter } from 'vue-router'
import { JccPagePanel } from '@jcc/shared/components'
import PageBody from '@/components/PageBody.vue'

const router = useRouter()
</script>

<template>
  <JccPagePanel title="页面不存在">
    <PageBody mode="scroll" label="页面不存在提示">
    <a-result status="404" title="找不到这个页面" sub-title="链接可能已失效，或地址输入有误。">
      <template #extra>
        <a-button type="primary" @click="router.push('/')">返回工作台</a-button>
      </template>
    </a-result>
    </PageBody>
  </JccPagePanel>
</template>
