<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HomeOutlined } from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { backDestination } from '@/navigation'

defineProps({ title: { type: String, required: true } })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const returnTo = computed(() => backDestination(auth.navigation, route))
</script>

<template>
  <h1 class="fs-section-title">{{ title }}</h1>
  <button
    v-if="returnTo"
    type="button"
    class="category-home-button"
    :aria-label="`返回${returnTo.label}`"
    :title="`返回${returnTo.label}`"
    @click="router.push(returnTo.path)"
  ><HomeOutlined /></button>
</template>
