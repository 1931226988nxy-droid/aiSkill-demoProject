<script setup>
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { JccPagePanel } from '@jcc/shared/components'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import PageBody from '@/components/PageBody.vue'
import { ROLE_LABELS, USER_STATUS_META } from '@/constants'
import StatusTag from '@/components/StatusTag.vue'

const auth = useAuthStore()
const formRef = ref()
const passwordFormRef = ref()
const saving = ref(false)
const passwordOpen = ref(false)
const changingPassword = ref(false)
const errorText = ref('')
const passwordError = ref('')
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const formState = reactive({
  displayName: '',
  phone: '',
  email: '',
  idCard: '',
})

const rules = {
  displayName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入正确的邮箱', trigger: 'blur' }],
  idCard: [
    { pattern: /^(\d{15}|\d{17}[\dXx])$/, message: '请输入正确的身份证号', trigger: 'blur' },
  ],
}

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '新密码至少 8 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value) => {
        if (!value || value === passwordForm.newPassword) return Promise.resolve()
        return Promise.reject(new Error('两次输入的密码不一致'))
      },
      trigger: 'blur',
    },
  ],
}

function fillForm() {
  formState.displayName = auth.user?.displayName || ''
  formState.phone = auth.user?.reader?.phone || ''
  formState.email = auth.user?.reader?.email || ''
  formState.idCard = auth.user?.reader?.idCard || ''
}

async function save() {
  if (saving.value) return
  errorText.value = ''
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    await auth.updateProfile({ ...formState })
    message.success('个人资料已保存')
    fillForm()
  } catch (error) {
    errorText.value = getErrorMessage(error)
  } finally {
    saving.value = false
  }
}

function openPassword() {
  passwordError.value = ''
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordOpen.value = true
}

async function changePassword() {
  if (changingPassword.value) return
  passwordError.value = ''
  try {
    await passwordFormRef.value.validate()
  } catch {
    return
  }
  changingPassword.value = true
  try {
    await api.auth.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    })
    message.success('密码已修改，其他设备的登录会话已失效')
    passwordOpen.value = false
  } catch (error) {
    passwordError.value = getErrorMessage(error)
  } finally {
    changingPassword.value = false
  }
}

onMounted(fillForm)
</script>

<template>
  <JccPagePanel title="个人资料">
    <template #extra><a-button @click="openPassword">修改密码</a-button></template>

    <PageBody mode="scroll" label="个人资料内容">
      <div class="page-stack">
      <div class="reader-header">
        <div class="reader-avatar" aria-hidden="true">
          {{ (auth.user?.displayName || '读').slice(0, 1) }}
        </div>
        <div>
          <div class="page-toolbar">
            <strong>{{ auth.user?.displayName }}</strong>
            <StatusTag v-if="auth.user?.reader" :status="auth.user.reader.status" :map="USER_STATUS_META" />
          </div>
          <div class="muted small">
            {{ ROLE_LABELS[auth.role] || auth.role }} · 登录名 {{ auth.user?.username }}
            <template v-if="auth.user?.reader"> · 读者证号 {{ auth.user.reader.readerNo }}</template>
          </div>
        </div>
      </div>

      <a-alert
        v-if="errorText"
        type="error"
        show-icon
        :message="errorText"
        closable
        @close="errorText = ''"
      />

      <a-form
        ref="formRef"
        :model="formState"
        :rules="rules"
        layout="vertical"
        class="profile-form"
        @finish="save"
      >
        <div class="form-grid">
          <a-form-item label="姓名 / 显示名称" name="displayName">
            <a-input v-model:value="formState.displayName" />
          </a-form-item>
          <a-form-item v-if="auth.user?.reader" label="手机号" name="phone">
            <a-input v-model:value="formState.phone" autocomplete="tel" />
          </a-form-item>
          <a-form-item v-if="auth.user?.reader" label="邮箱" name="email">
            <a-input v-model:value="formState.email" autocomplete="email" />
          </a-form-item>
          <a-form-item v-if="auth.user?.reader" label="身份证号" name="idCard">
            <a-input v-model:value="formState.idCard" />
          </a-form-item>
        </div>
        <a-space>
          <a-button type="primary" html-type="submit" :loading="saving">保存资料</a-button>
          <a-button @click="fillForm">重置</a-button>
        </a-space>
      </a-form>

      <a-alert
        type="info"
        show-icon
        message="隐私提示"
        description="姓名、手机号、身份证号仅用于借阅身份核验。馆员列表默认脱敏展示，完整信息仅对具备读者管理权限的工作人员开放。"
      />
      </div>
    </PageBody>

    <a-modal
      v-model:open="passwordOpen"
      title="修改登录密码"
      :confirm-loading="changingPassword"
      ok-text="确认修改"
      cancel-text="取消"
      :mask-closable="false"
      @ok="changePassword"
    >
      <a-alert
        v-if="passwordError"
        type="error"
        show-icon
        :message="passwordError"
        style="margin-bottom: 14px"
      />
      <a-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" layout="vertical">
        <a-form-item label="原密码" name="oldPassword">
          <a-input-password
            v-model:value="passwordForm.oldPassword"
            autocomplete="current-password"
          />
        </a-form-item>
        <a-form-item label="新密码" name="newPassword">
          <a-input-password
            v-model:value="passwordForm.newPassword"
            autocomplete="new-password"
          />
        </a-form-item>
        <a-form-item label="确认新密码" name="confirmPassword">
          <a-input-password
            v-model:value="passwordForm.confirmPassword"
            autocomplete="new-password"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </JccPagePanel>
</template>

<style scoped>
.profile-form {
  max-width: 760px;
}
</style>
