<script setup>
import { reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { JccPagePanel } from '@jcc/shared/components'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { formatDateTime, formatMoney } from '@/utils'
import PageBody from '@/components/PageBody.vue'

const activeTab = ref('borrow')
const borrowForm = reactive({ readerNo: '', barcode: '' })
const returnForm = reactive({ barcode: '', condition: '' })
const lostForm = reactive({ barcode: '', amount: 0, note: '' })
const borrowPreview = ref(null)
const returnPreview = ref(null)
const lostPreview = ref(null)
const borrowResult = ref(null)
const returnResult = ref(null)
const lostResult = ref(null)
const borrowError = ref('')
const returnError = ref('')
const lostError = ref('')
const previewLoading = ref('')
const actionLoading = ref('')

function clearBorrow() {
  borrowPreview.value = null
  borrowResult.value = null
  borrowError.value = ''
  borrowForm.barcode = ''
}

function clearReturn() {
  returnPreview.value = null
  returnResult.value = null
  returnError.value = ''
  returnForm.barcode = ''
  returnForm.condition = ''
}

function clearLost() {
  lostPreview.value = null
  lostResult.value = null
  lostError.value = ''
  lostForm.barcode = ''
  lostForm.amount = 0
  lostForm.note = ''
}

function openTab(key) {
  activeTab.value = key
  clearBorrow()
  clearReturn()
  clearLost()
}

async function previewBorrow() {
  if (!borrowForm.readerNo || !borrowForm.barcode) {
    borrowError.value = '请填写读者编号和副本条码'
    return
  }
  borrowError.value = ''
  borrowResult.value = null
  previewLoading.value = 'borrow'
  try {
    borrowPreview.value = await api.circulation.previewBorrow({ ...borrowForm })
  } catch (error) {
    borrowPreview.value = null
    borrowError.value = getErrorMessage(error)
  } finally {
    previewLoading.value = ''
  }
}

async function confirmBorrow() {
  if (!borrowPreview.value || actionLoading.value) return
  actionLoading.value = 'borrow'
  borrowError.value = ''
  try {
    const result = await api.circulation.borrow({
      readerNo: borrowPreview.value.reader.readerNo,
      barcode: borrowPreview.value.copy.barcode,
    })
    borrowResult.value = result
    borrowPreview.value = null
    borrowForm.barcode = ''
    message.success('借阅办理成功')
  } catch (error) {
    borrowError.value = getErrorMessage(error)
  } finally {
    actionLoading.value = ''
  }
}

async function previewReturn() {
  if (!returnForm.barcode) {
    returnError.value = '请填写副本条码'
    return
  }
  returnError.value = ''
  returnResult.value = null
  previewLoading.value = 'return'
  try {
    returnPreview.value = await api.circulation.previewReturn({ barcode: returnForm.barcode })
  } catch (error) {
    returnPreview.value = null
    returnError.value = getErrorMessage(error)
  } finally {
    previewLoading.value = ''
  }
}

async function confirmReturn() {
  if (!returnPreview.value || actionLoading.value) return
  actionLoading.value = 'return'
  returnError.value = ''
  try {
    const result = await api.circulation.returnBook({
      barcode: returnPreview.value.loan.barcode,
      condition: returnForm.condition,
    })
    returnResult.value = result
    returnPreview.value = null
    returnForm.barcode = ''
    returnForm.condition = ''
    message.success('归还办理成功')
  } catch (error) {
    returnError.value = getErrorMessage(error)
  } finally {
    actionLoading.value = ''
  }
}

async function previewLost() {
  if (!lostForm.barcode) {
    lostError.value = '请填写副本条码'
    return
  }
  lostError.value = ''
  lostResult.value = null
  previewLoading.value = 'lost'
  try {
    lostPreview.value = await api.circulation.previewReturn({ barcode: lostForm.barcode })
  } catch (error) {
    lostPreview.value = null
    lostError.value = getErrorMessage(error)
  } finally {
    previewLoading.value = ''
  }
}

async function confirmLost() {
  if (!lostPreview.value || actionLoading.value) return
  if (!lostForm.note || lostForm.note.trim().length < 2) {
    lostError.value = '请填写至少 2 个字符的处理说明'
    return
  }
  actionLoading.value = 'lost'
  lostError.value = ''
  try {
    const result = await api.circulation.lost(lostPreview.value.loan.id, {
      amount: Number(lostForm.amount) || 0,
      note: lostForm.note,
    })
    lostResult.value = result
    lostPreview.value = null
    lostForm.barcode = ''
    lostForm.note = ''
    lostForm.amount = 0
    message.success('遗失登记已保存')
  } catch (error) {
    lostError.value = getErrorMessage(error)
  } finally {
    actionLoading.value = ''
  }
}
</script>

<template>
  <JccPagePanel title="馆员工作台">
    <template #extra><span class="muted small">借还操作会在服务端事务中校验并记录审计日志</span></template>

    <PageBody mode="scroll" label="借还业务内容">
    <a-tabs :active-key="activeTab" @change="openTab">
      <a-tab-pane key="borrow" tab="借书">
        <div class="scan-step">
          <div class="scan-step__form">
            <a-form-item label="读者编号" required>
              <a-input
                v-model:value="borrowForm.readerNo"
                placeholder="如 R20260001"
                style="width: 220px"
                @press-enter="previewBorrow"
              />
            </a-form-item>
            <a-form-item label="副本条码" required>
              <a-input
                v-model:value="borrowForm.barcode"
                placeholder="扫描或输入图书条码"
                style="width: 260px"
                @press-enter="previewBorrow"
              />
            </a-form-item>
            <a-button
              type="primary"
              :loading="previewLoading === 'borrow'"
              @click="previewBorrow"
            >
              核对借阅信息
            </a-button>
          </div>

          <a-alert
            v-if="borrowError"
            type="error"
            show-icon
            :message="borrowError"
            style="margin-top: 14px"
            closable
            @close="borrowError = ''"
          />
          <a-alert
            v-if="borrowResult"
            type="success"
            show-icon
            :message="`借阅成功：${borrowResult.bookTitle}`"
            :description="`应还日期 ${formatDateTime(borrowResult.dueAt, { dateOnly: true })}，已发送站内借阅通知。`"
            style="margin-top: 14px"
          />

          <div v-if="borrowPreview" class="summary-box">
            <div class="summary-box__title">请核对以下信息</div>
            <div class="detail-grid">
              <div class="detail-item">
                <div class="detail-label">读者</div>
                <div class="detail-value">
                  {{ borrowPreview.reader.fullName }}（{{ borrowPreview.reader.readerNo }}）
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">当前在借 / 上限</div>
                <div class="detail-value">
                  {{ borrowPreview.reader.activeLoans }} / {{ borrowPreview.maxBorrow }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">联系方式</div>
                <div class="detail-value">{{ borrowPreview.reader.phone || borrowPreview.reader.email }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">图书</div>
                <div class="detail-value">{{ borrowPreview.book.title }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">副本</div>
                <div class="detail-value">
                  {{ borrowPreview.copy.barcode }} · {{ borrowPreview.copy.location }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">应还日期</div>
                <div class="detail-value">
                  {{ formatDateTime(borrowPreview.dueAt, { dateOnly: true }) }}（借期
                  {{ borrowPreview.loanDays }} 天）
                </div>
              </div>
            </div>
            <div class="summary-box__footer">
              <a-button @click="clearBorrow">取消</a-button>
              <a-button
                type="primary"
                :loading="actionLoading === 'borrow'"
                @click="confirmBorrow"
              >
                确认借出
              </a-button>
            </div>
          </div>
        </div>
      </a-tab-pane>

      <a-tab-pane key="return" tab="还书">
        <div class="scan-step">
          <div class="scan-step__form">
            <a-form-item label="副本条码" required>
              <a-input
                v-model:value="returnForm.barcode"
                placeholder="扫描或输入归还图书条码"
                style="width: 300px"
                @press-enter="previewReturn"
              />
            </a-form-item>
            <a-form-item label="归还状态（选填）">
              <a-input
                v-model:value="returnForm.condition"
                placeholder="如封面轻微磨损"
                style="width: 240px"
              />
            </a-form-item>
            <a-button
              type="primary"
              :loading="previewLoading === 'return'"
              @click="previewReturn"
            >
              核对归还信息
            </a-button>
          </div>

          <a-alert
            v-if="returnError"
            type="error"
            show-icon
            :message="returnError"
            style="margin-top: 14px"
            closable
            @close="returnError = ''"
          />
          <a-alert
            v-if="returnResult"
            type="success"
            show-icon
            :message="`归还成功：${returnResult.loan.bookTitle}`"
            :description="
              returnResult.fee
                ? `已生成待处理费用 ${formatMoney(returnResult.fee.amount)}。`
                : '未产生逾期费用。'
            "
            style="margin-top: 14px"
          />

          <div v-if="returnPreview" class="summary-box">
            <div class="summary-box__title">请核对归还信息</div>
            <div class="detail-grid">
              <div class="detail-item">
                <div class="detail-label">图书</div>
                <div class="detail-value">{{ returnPreview.loan.bookTitle }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">读者</div>
                <div class="detail-value">
                  {{ returnPreview.loan.readerName }}（{{ returnPreview.loan.readerNo }}）
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">应还日期</div>
                <div class="detail-value">
                  {{ formatDateTime(returnPreview.loan.dueAt, { dateOnly: true }) }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">逾期天数</div>
                <div class="detail-value" :class="{ 'text-danger': returnPreview.overdueDays > 0 }">
                  {{ returnPreview.overdueDays }} 天
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">逾期费用</div>
                <div class="detail-value">
                  {{ formatMoney(returnPreview.fine) }}
                  <span class="muted small">
                    （{{ formatMoney(returnPreview.finePerDay) }}/天）
                  </span>
                </div>
              </div>
            </div>
            <div class="summary-box__footer">
              <a-button @click="clearReturn">取消</a-button>
              <a-button
                type="primary"
                :loading="actionLoading === 'return'"
                @click="confirmReturn"
              >
                确认归还
              </a-button>
            </div>
          </div>
        </div>
      </a-tab-pane>

      <a-tab-pane key="lost" tab="异常处理">
        <div class="scan-step">
          <p class="muted">
            登记遗失前请确认该副本仍在借。登记后借阅会结束、副本转为遗失，并按填写金额生成待处理费用。
          </p>
          <div class="scan-step__form">
            <a-form-item label="在借副本条码" required>
              <a-input
                v-model:value="lostForm.barcode"
                placeholder="扫描在借图书条码"
                style="width: 300px"
                @press-enter="previewLost"
              />
            </a-form-item>
            <a-button type="primary" :loading="previewLoading === 'lost'" @click="previewLost">
              查询在借记录
            </a-button>
          </div>

          <a-alert
            v-if="lostError"
            type="error"
            show-icon
            :message="lostError"
            style="margin-top: 14px"
            closable
            @close="lostError = ''"
          />
          <a-alert
            v-if="lostResult"
            type="success"
            show-icon
            :message="`遗失登记成功：${lostResult.loan.bookTitle}`"
            :description="
              lostResult.fee
                ? `已生成赔偿费用 ${formatMoney(lostResult.fee.amount)}。`
                : '未设置赔偿金额。'
            "
            style="margin-top: 14px"
          />

          <div v-if="lostPreview" class="summary-box">
            <div class="summary-box__title">遗失登记</div>
            <a-descriptions :column="{ xs: 1, sm: 2 }" size="small" bordered>
              <a-descriptions-item label="图书">{{ lostPreview.loan.bookTitle }}</a-descriptions-item>
              <a-descriptions-item label="读者">
                {{ lostPreview.loan.readerName }}（{{ lostPreview.loan.readerNo }}）
              </a-descriptions-item>
              <a-descriptions-item label="条码">{{ lostPreview.loan.barcode }}</a-descriptions-item>
              <a-descriptions-item label="应还日期">
                {{ formatDateTime(lostPreview.loan.dueAt, { dateOnly: true }) }}
              </a-descriptions-item>
            </a-descriptions>
            <div class="form-grid" style="margin-top: 16px">
              <a-form-item label="赔偿金额（元）">
                <a-input-number
                  v-model:value="lostForm.amount"
                  :min="0"
                  :precision="2"
                  style="width: 100%"
                />
              </a-form-item>
              <a-form-item label="处理说明" required>
                <a-input v-model:value="lostForm.note" placeholder="如：读者确认遗失，按定价赔偿" />
              </a-form-item>
            </div>
            <div class="summary-box__footer">
              <a-button @click="clearLost">取消</a-button>
              <a-button
                danger
                type="primary"
                :loading="actionLoading === 'lost'"
                @click="confirmLost"
              >
                确认登记遗失
              </a-button>
            </div>
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>
    </PageBody>
  </JccPagePanel>
</template>
