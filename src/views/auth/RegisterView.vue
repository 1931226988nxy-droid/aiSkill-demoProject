<script setup>
// 文件职责：读者自助注册页。
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { IdcardOutlined, LockOutlined, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons-vue'
import AuthShell from '@/components/AuthShell.vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'

const auth = useAuthStore()
const router = useRouter()
const formRef = ref()
const submitting = ref(false)
const errorText = ref('')
const registrationAvailable = ref(null)

onMounted(async () => {
  try {
    registrationAvailable.value = Boolean((await api.auth.options()).allowRegistration)
  } catch {
    errorText.value = '暂时无法确认注册状态，请稍后重试'
  }
})
const formState = reactive({
  username: '',
  displayName: '',
  phone: '',
  email: '',
  idCard: '',
  password: '',
  confirmPassword: '',
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_]{3,32}$/, message: '3-32 位字母、数字或下划线', trigger: 'blur' },
  ],
  displayName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入正确的邮箱', trigger: 'blur' }],
  idCard: [
    { pattern: /^(\d{15}|\d{17}[\dXx])$/, message: '请输入正确的身份证号', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请设置密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value) => {
        if (!value || value === formState.password) return Promise.resolve()
        return Promise.reject(new Error('两次输入的密码不一致'))
      },
      trigger: 'blur',
    },
  ],
}

async function submit() {
  if (submitting.value || registrationAvailable.value !== true) return
  errorText.value = ''
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  if (!formState.phone && !formState.email) {
    errorText.value = '手机号和邮箱至少填写一项'
    return
  }
  submitting.value = true
  try {
    await auth.register({
      username: formState.username,
      displayName: formState.displayName,
      phone: formState.phone,
      email: formState.email,
      idCard: formState.idCard,
      password: formState.password,
    })
    message.success('注册成功，欢迎使用图书馆')
    await router.replace('/')
  } catch (error) {
    errorText.value = getErrorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell>
    <a-skeleton v-if="registrationAvailable === null && !errorText" active :paragraph="{ rows: 5 }" />
    <a-result v-else-if="registrationAvailable !== true" status="info" title="当前无法自助注册" :sub-title="errorText || '请联系图书馆管理员开通账号'">
      <template #extra><a-button type="primary" @click="router.push('/login')">返回登录</a-button></template>
    </a-result>
    <template v-else>
      <h2 class="auth-title">读者注册</h2>
    <p class="auth-subtitle">注册后可使用读者证号检索、预约和借阅图书</p>

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
      <a-row :gutter="12">
        <a-col :xs="24" :sm="12">
          <a-form-item label="用户名" name="username">
            <a-input v-model:value="formState.username" autocomplete="username">
              <template #prefix><UserOutlined /></template>
            </a-input>
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="姓名" name="displayName">
            <a-input v-model:value="formState.displayName" />
          </a-form-item>
        </a-col>
      </a-row>
      <a-row :gutter="12">
        <a-col :xs="24" :sm="12">
          <a-form-item label="手机号" name="phone">
            <a-input v-model:value="formState.phone" autocomplete="tel">
              <template #prefix><PhoneOutlined /></template>
            </a-input>
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="邮箱" name="email">
            <a-input v-model:value="formState.email" autocomplete="email">
              <template #prefix><MailOutlined /></template>
            </a-input>
          </a-form-item>
        </a-col>
      </a-row>
      <a-form-item label="身份证号（选填）" name="idCard">
        <a-input v-model:value="formState.idCard">
          <template #prefix><IdcardOutlined /></template>
        </a-input>
      </a-form-item>
      <a-row :gutter="12">
        <a-col :xs="24" :sm="12">
          <a-form-item label="密码" name="password">
            <a-input-password v-model:value="formState.password" autocomplete="new-password">
              <template #prefix><LockOutlined /></template>
            </a-input-password>
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="确认密码" name="confirmPassword">
            <a-input-password v-model:value="formState.confirmPassword" autocomplete="new-password" />
          </a-form-item>
        </a-col>
      </a-row>
      <a-button type="primary" html-type="submit" size="large" block :loading="submitting">
        注册并登录
      </a-button>
    </a-form>

    <p class="auth-switch">
      已有账号？
      <RouterLink to="/login">返回登录</RouterLink>
    </p>
    </template>
  </AuthShell>
</template>

<style scoped>
.auth-title {
  font-size: 26px;
  font-weight: 700;
}
.auth-subtitle {
  margin: 6px 0 22px !important;
  color: var(--color-text-muted);
}
.auth-alert {
  margin-bottom: 18px;
}
.auth-switch {
  margin-top: 20px !important;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
}
</style>
