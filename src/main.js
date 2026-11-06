/**
 * 文件职责：应用启动：Pinia、路由、共享样式和 401 会话失效处理。
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import 'ant-design-vue/dist/reset.css'
import '@jcc/shared/style.css'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

setUnauthorizedHandler(() => {
  // 任意 API 返回 401 时统一清空会话，并带上当前地址方便登录后跳回。
  const auth = useAuthStore()
  if (!auth.user) return
  auth.clear()
  const current = router.currentRoute.value
  if (!['login', 'register'].includes(current.name)) {
    router.replace({ name: 'login', query: { redirect: current.fullPath } })
  }
})

app.use(router)
app.mount('#app')
