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
