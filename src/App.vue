<script setup>
// 文件职责：根组件：使用共享 JccProvider 包裹路由页面。
import { JccProvider } from '@jcc/shared/components'
</script>

<template>
  <JccProvider>
    <RouterView />
  </JccProvider>
</template>
