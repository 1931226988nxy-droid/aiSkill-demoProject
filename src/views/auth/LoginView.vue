<script setup>
// 文件职责：登录页与演示账号快捷填充。
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
    <div class="login-heading">
      <h2>账号登录</h2>
      <p>使用图书馆账号进入系统</p>
    </div>

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
      class="login-form"
      :model="formState"
      :rules="rules"
      layout="vertical"
      :disabled="submitting"
      @finish="submit"
    >
      <a-form-item label="账号" name="username">
        <a-input
          v-model:value="formState.username"
          size="large"
          autocomplete="username"
          placeholder="请输入用户名或读者证账号"
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
      <a-button class="login-submit" type="primary" html-type="submit" size="large" block :loading="submitting">
        登录
      </a-button>
    </a-form>

    <div v-if="options.demoAccounts" class="auth-demo">
      <div class="auth-demo__divider"><span>演示账号</span></div>
      <div class="auth-demo__grid">
        <a-button
          v-for="account in demoAccounts"
          :key="account.username"
          :disabled="submitting"
          @click="fillDemo(account)"
        >
          {{ account.label }}
        </a-button>
      </div>
    </div>

    <p v-if="options.allowRegistration" class="auth-switch">
      还没有读者账号？
      <RouterLink to="/register">立即注册</RouterLink>
    </p>
  </AuthShell>
</template>

<style scoped>
.login-heading {
  margin-bottom: 28px;
}

.login-heading h2 {
  margin: 0;
  padding-left: 12px;
  border-left: 4px solid var(--color-primary);
  color: var(--color-text);
  font-size: 26px;
  font-weight: 600;
}

.login-heading p {
  margin: 8px 0 0 16px;
  color: var(--color-text-muted);
  font-size: 14px;
}

.auth-alert {
  margin-bottom: 18px;
}

.login-form :deep(.ant-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.ant-form-item-label > label) {
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.login-form :deep(.ant-input-affix-wrapper) {
  height: 46px;
  border-radius: 6px;
}

.login-form :deep(.ant-input-prefix) {
  margin-right: 8px;
  color: var(--color-text-muted);
}

.login-submit {
  height: 48px;
  margin-top: 4px;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 600;
}

.auth-demo {
  margin-top: 28px;
}

.auth-demo__divider {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 17px;
  color: var(--color-text-muted);
  font-size: 13px;
  white-space: nowrap;
}

.auth-demo__divider::before,
.auth-demo__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

.auth-demo__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.auth-demo__grid :deep(.ant-btn) {
  height: 40px;
  border-color: var(--color-border);
  border-radius: 6px;
}

.auth-demo__grid :deep(.ant-btn:hover) {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-hover);
}

.auth-switch {
  margin: 24px 0 0 !important;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}

.auth-switch a {
  margin-left: 4px;
  color: var(--color-primary);
}
</style>
