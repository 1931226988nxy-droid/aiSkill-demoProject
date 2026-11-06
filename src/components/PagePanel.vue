<script setup>
// 应用页面卡片：保留公共面板结构，并提供与当前路由一致的卡片内返回入口。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import { JccPagePanel } from '@jcc/shared/components'
import { useAuthStore } from '@/stores/auth'
import { backDestination } from '@/navigation'

defineProps({
  title: { type: String, default: '' },
  embeddedHeader: Boolean,
})

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const returnTo = computed(() => backDestination(auth.navigation, route))
</script>

<template>
  <JccPagePanel
    :title="embeddedHeader ? '' : title"
    :aria-label="title"
    :class="{ 'fs-workspace--embedded': embeddedHeader }"
  >
    <template #breadcrumb>
      <nav v-if="returnTo && !embeddedHeader" class="panel-back-nav" aria-label="返回上一级">
        <button type="button" class="panel-back-button" @click="router.push(returnTo.path)">
          <span class="panel-back-button__icon"><ArrowLeftOutlined /></span>
          返回{{ returnTo.label }}
        </button>
      </nav>
    </template>
    <template v-if="!embeddedHeader" #header>
      <h1 class="fs-section-title">{{ title }}</h1>
    </template>
    <div v-if="$slots.extra" class="panel-extra"><slot name="extra" /></div>
    <slot />
  </JccPagePanel>
</template>
