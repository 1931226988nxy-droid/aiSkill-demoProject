<script setup>
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { JccPagePanel } from '@jcc/shared/components'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import PageBody from '@/components/PageBody.vue'

const loading = ref(true)
const saving = ref(false)
const runningJobs = ref(false)
const errorText = ref('')
const jobResult = ref(null)
const formRef = ref()
const formState = reactive({
  library_name: '',
  loan_days: 30,
  max_borrow: 5,
  max_renewals: 2,
  renewal_days: 30,
  reservation_hold_days: 3,
  due_soon_days: 2,
  fine_per_day: 0.5,
  allow_registration: true,
})

const rules = {
  library_name: [{ required: true, message: '请输入图书馆名称', trigger: 'blur' }],
  loan_days: [{ required: true, message: '请输入借阅期限', trigger: 'change' }],
  max_borrow: [{ required: true, message: '请输入借阅上限', trigger: 'change' }],
  max_renewals: [{ required: true, message: '请输入续借次数', trigger: 'change' }],
  renewal_days: [{ required: true, message: '请输入续借天数', trigger: 'change' }],
  reservation_hold_days: [{ required: true, message: '请输入预约保留天数', trigger: 'change' }],
  due_soon_days: [{ required: true, message: '请输入提前提醒天数', trigger: 'change' }],
  fine_per_day: [{ required: true, message: '请输入逾期费', trigger: 'change' }],
}

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const data = await api.admin.settings()
    Object.assign(formState, {
      library_name: data.library_name,
      loan_days: data.loan_days,
      max_borrow: data.max_borrow,
      max_renewals: data.max_renewals,
      renewal_days: data.renewal_days,
      reservation_hold_days: data.reservation_hold_days,
      due_soon_days: data.due_soon_days,
      fine_per_day: Number((data.fine_per_day_cents / 100).toFixed(2)),
      allow_registration: data.allow_registration,
    })
  } catch (error) {
    errorText.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    await api.admin.updateSettings({
      library_name: formState.library_name,
      loan_days: formState.loan_days,
      max_borrow: formState.max_borrow,
      max_renewals: formState.max_renewals,
      renewal_days: formState.renewal_days,
      reservation_hold_days: formState.reservation_hold_days,
      due_soon_days: formState.due_soon_days,
      fine_per_day_cents: Math.round(Number(formState.fine_per_day) * 100),
      allow_registration: formState.allow_registration,
    })
    message.success('系统参数已保存')
    await load()
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function runJobs() {
  runningJobs.value = true
  jobResult.value = null
  try {
    jobResult.value = await api.admin.runJobs()
    message.success('逾期与预约扫描已完成')
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    runningJobs.value = false
  }
}

onMounted(load)
</script>

<template>
  <JccPagePanel title="系统设置">
    <template #extra>
      <a-space wrap>
        <a-button :loading="runningJobs" @click="runJobs">立即执行逾期 / 预约扫描</a-button>
        <a-button type="primary" :loading="saving" @click="save">保存配置</a-button>
      </a-space>
    </template>

    <PageBody mode="scroll" label="系统设置内容">
    <a-spin :spinning="loading">
      <a-result v-if="errorText" status="warning" title="配置加载失败" :sub-title="errorText">
        <template #extra><a-button type="primary" @click="load">重试</a-button></template>
      </a-result>
      <div v-else class="page-stack">
        <a-alert
          type="warning"
          show-icon
          message="参数变更会影响后续借阅与预约。修改借阅期限不会回溯修改已有借阅的应还日期。"
        />
        <a-alert
          v-if="jobResult"
          type="success"
          show-icon
          :message="`扫描完成：逾期费用 ${jobResult.overdueFees} 条，逾期通知 ${jobResult.overdueNotices} 条，到期提醒 ${jobResult.dueSoonNotices} 条，预约过期 ${jobResult.expiredReservations} 条`"
        />

        <a-form ref="formRef" :model="formState" :rules="rules" layout="vertical">
          <section class="section-card">
            <div class="section-card__header"><div class="section-card__title">基础信息</div></div>
            <div class="section-card__body">
              <div class="settings-grid">
                <a-form-item label="图书馆名称" name="library_name">
                  <a-input v-model:value="formState.library_name" />
                </a-form-item>
                <a-form-item label="开放读者自助注册" name="allow_registration">
                  <a-switch v-model:checked="formState.allow_registration" checked-children="开放" un-checked-children="关闭" />
                  <div class="form-help">关闭后，读者账号只能由馆员在读者管理中创建。</div>
                </a-form-item>
              </div>
            </div>
          </section>

          <section class="section-card">
            <div class="section-card__header"><div class="section-card__title">借阅规则</div></div>
            <div class="section-card__body">
              <div class="settings-grid">
                <a-form-item label="借阅期限（天）" name="loan_days">
                  <a-input-number v-model:value="formState.loan_days" :min="1" :max="365" style="width: 100%" />
                </a-form-item>
                <a-form-item label="借阅上限（册）" name="max_borrow">
                  <a-input-number v-model:value="formState.max_borrow" :min="1" :max="100" style="width: 100%" />
                </a-form-item>
                <a-form-item label="最大续借次数" name="max_renewals">
                  <a-input-number v-model:value="formState.max_renewals" :min="0" :max="20" style="width: 100%" />
                </a-form-item>
                <a-form-item label="每次续借天数" name="renewal_days">
                  <a-input-number v-model:value="formState.renewal_days" :min="1" :max="365" style="width: 100%" />
                </a-form-item>
              </div>
            </div>
          </section>

          <section class="section-card">
            <div class="section-card__header"><div class="section-card__title">预约与费用</div></div>
            <div class="section-card__body">
              <div class="settings-grid">
                <a-form-item label="预约保留期限（天）" name="reservation_hold_days">
                  <a-input-number v-model:value="formState.reservation_hold_days" :min="1" :max="30" style="width: 100%" />
                </a-form-item>
                <a-form-item label="到期提前提醒（天）" name="due_soon_days">
                  <a-input-number v-model:value="formState.due_soon_days" :min="0" :max="30" style="width: 100%" />
                </a-form-item>
                <a-form-item label="逾期费（元/天）" name="fine_per_day">
                  <a-input-number v-model:value="formState.fine_per_day" :min="0" :max="1000" :precision="2" style="width: 100%" />
                </a-form-item>
              </div>
              <p class="muted small">
                逾期费按自然日计算，展示金额精确到分。系统不提供在线支付，费用由馆员线下确认或豁免。
              </p>
            </div>
          </section>
        </a-form>
      </div>
    </a-spin>
    </PageBody>
  </JccPagePanel>
</template>
