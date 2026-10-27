<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { LockOutlined, UserOutlined } from '@ant-design/icons-vue'
import AuthShell from '@/components/AuthShell.vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { safeRedirect } from '@/utils'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const formRef = ref()
const submitting = ref(false)
const errorText = ref('')
const formState = reactive({ username: '', password: '' })
const options = ref({ allowRegistration: false, demoAccounts: false })

onMounted(async () => {
  try {
    options.value = await api.auth.options()
  } catch {
    // 登录仍可使用；未确认开放的入口不展示。
  }
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const demoAccounts = [
  { label: '管理员', username: 'admin', password: 'admin123' },
  { label: '馆员', username: 'librarian', password: 'lib123456' },
  { label: '读者', username: 'reader', password: 'reader123' },
]

function fillDemo(account) {
  formState.username = account.username
  formState.password = account.password
  errorText.value = ''
}

async function submit() {
  if (submitting.value) return
  errorText.value = ''
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    await auth.login({ ...formState })
    message.success(`欢迎回来，${auth.user?.displayName || ''}`)
    await router.replace(safeRedirect(route.query.redirect))
  } catch (error) {
    errorText.value = getErrorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell>
    <h2 class="auth-title">登录</h2>
    <p class="auth-subtitle">使用读者证账号或馆员账号进入系统</p>

    <a-alert
      v-if="errorText"
      type="error"
      show-icon
      :message="errorText"
      class="auth-alert"
      closable
      @close="errorText = ''"
    />

    <a-form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      :disabled="submitting"
      @finish="submit"
    >
      <a-form-item label="用户名" name="username">
        <a-input
          v-model:value="formState.username"
          size="large"
          autocomplete="username"
          placeholder="请输入用户名"
          allow-clear
        >
          <template #prefix><UserOutlined /></template>
        </a-input>
      </a-form-item>
      <a-form-item label="密码" name="password">
        <a-input-password
          v-model:value="formState.password"
          size="large"
          autocomplete="current-password"
          placeholder="请输入密码"
        >
          <template #prefix><LockOutlined /></template>
        </a-input-password>
      </a-form-item>
      <a-button type="primary" html-type="submit" size="large" block :loading="submitting">
        登录
      </a-button>
    </a-form>

    <div v-if="options.demoAccounts" class="auth-demo">
      <span>演示账号</span>
      <a-space wrap>
        <a-button
          v-for="account in demoAccounts"
          :key="account.username"
          size="small"
          @click="fillDemo(account)"
        >
          {{ account.label }}
        </a-button>
      </a-space>
    </div>

    <p v-if="options.allowRegistration" class="auth-switch">
      还没有读者账号？
      <RouterLink to="/register">立即注册</RouterLink>
    </p>
  </AuthShell>
</template>

<style scoped>
.auth-title {
  font-size: 26px;
  font-weight: 700;
}
.auth-subtitle {
  margin: 6px 0 24px !important;
  color: var(--color-text-muted);
}
.auth-alert {
  margin-bottom: 18px;
}
.auth-demo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  font-size: 12px;
}
.auth-switch {
  margin-top: 22px !important;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
}
</style>
