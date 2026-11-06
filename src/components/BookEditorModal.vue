<script setup>
// 文件职责：图书新增/编辑表单弹窗，负责表单校验和 API 提交。
import { computed } from 'vue'
import { JccFormModal } from '@jcc/shared/components'
import { api } from '@/api'

const props = defineProps({
  open: Boolean,
  book: { type: Object, default: null },
  categories: { type: Array, default: () => [] },
  authors: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:open', 'saved'])

const initialValues = computed(() =>
  // 编辑时回填完整图书，新增时给出一套干净默认值；JccFormModal 负责按 open 重置表单。
  props.book
    ? {
        version: props.book.version,
        isbn: props.book.isbn,
        title: props.book.title,
        subtitle: props.book.subtitle,
        authors: [...(props.book.authors || [])],
        translator: props.book.translator,
        publisher: props.book.publisher,
        publishDate: props.book.publishDate,
        categoryId: props.book.categoryId,
        keywords: props.book.keywords,
        summary: props.book.summary,
        coverUrl: props.book.coverUrl,
        language: props.book.language,
        edition: props.book.edition,
        price: props.book.price,
      }
    : {
        isbn: '',
        title: '',
        subtitle: '',
        authors: [],
        translator: '',
        publisher: '',
        publishDate: '',
        categoryId: undefined,
        keywords: '',
        summary: '',
        coverUrl: '',
        language: '中文',
        edition: '',
        price: 0,
      },
)

const rules = {
  isbn: [
    { required: true, message: '请输入 ISBN', trigger: 'blur' },
    {
      validator: (_rule, value) => {
        const normalized = String(value || '')
          .replace(/[\s-]/g, '')
          .toUpperCase()
        if (/^(?:\d{9}[\dX]|\d{13})$/.test(normalized)) return Promise.resolve()
        return Promise.reject(new Error('请输入 10 或 13 位有效 ISBN'))
      },
      trigger: 'blur',
    },
  ],
  title: [{ required: true, message: '请输入书名', trigger: 'blur' }],
  authors: [
    { required: true, type: 'array', min: 1, message: '请至少填写一位作者', trigger: 'change' },
  ],
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }],
  price: [{ required: true, message: '请输入定价', trigger: 'change' }],
}

async function submit(values) {
  // 弹窗只负责表单形状；ISBN 唯一性和作者复用由后端事务处理。
  const payload = {
    ...values,
    price: Number(values.price) || 0,
    coverUrl: values.coverUrl || '',
  }
  if (props.book) return api.books.update(props.book.id, payload)
  return api.books.create(payload)
}

function onSaved(result) {
  emit('saved', result)
  emit('update:open', false)
}
</script>

<template>
  <JccFormModal
    :open="open"
    :title="book ? '编辑图书' : '新增图书'"
    width="min(780px, 94vw)"
    :initial-values="initialValues"
    :rules="rules"
    :submit="submit"
    @update:open="emit('update:open', $event)"
    @saved="onSaved"
  >
    <template #default="{ model }">
      <a-alert type="info" show-icon message="同一 ISBN 只能对应一个版本；不同版本请使用各自的 ISBN。" style="margin-bottom: 16px" />
      <a-row :gutter="16">
        <a-col :xs="24" :sm="14">
          <a-form-item label="ISBN" name="isbn">
            <a-input v-model:value="model.isbn" placeholder="支持 ISBN-10 / ISBN-13，可带连字符" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="10">
          <a-form-item label="分类" name="categoryId">
            <a-select v-model:value="model.categoryId" placeholder="请选择分类" show-search option-filter-prop="label">
              <a-select-option v-for="item in categories" :key="item.id" :value="item.id" :label="item.name">
                {{ item.name }}
              </a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
      </a-row>
      <a-form-item label="书名" name="title">
        <a-input v-model:value="model.title" />
      </a-form-item>
      <a-form-item label="副标题" name="subtitle">
        <a-input v-model:value="model.subtitle" />
      </a-form-item>
      <a-form-item label="作者" name="authors" extra="可直接输入新作者名并按回车添加">
        <a-select
          v-model:value="model.authors"
          mode="tags"
          placeholder="输入作者姓名"
          :options="authors.map((item) => ({ value: item.name, label: item.name }))"
          :token-separators="[',', '，']"
        />
      </a-form-item>
      <a-row :gutter="16">
        <a-col :xs="24" :sm="12">
          <a-form-item label="译者" name="translator">
            <a-input v-model:value="model.translator" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="出版社" name="publisher">
            <a-input v-model:value="model.publisher" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="出版日期" name="publishDate">
            <a-input v-model:value="model.publishDate" type="date" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="版本" name="edition">
            <a-input v-model:value="model.edition" placeholder="如：第 3 版" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="语言" name="language">
            <a-input v-model:value="model.language" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="定价（元）" name="price">
            <a-input-number v-model:value="model.price" :min="0" :precision="2" style="width: 100%" />
          </a-form-item>
        </a-col>
      </a-row>
      <a-form-item label="关键词" name="keywords" extra="多个关键词可用逗号分隔，检索时会参与匹配">
        <a-input v-model:value="model.keywords" />
      </a-form-item>
      <a-form-item label="封面图片地址" name="coverUrl">
        <a-input v-model:value="model.coverUrl" placeholder="https://… 或留空使用系统占位封面" />
      </a-form-item>
      <a-form-item label="内容简介" name="summary">
        <a-textarea v-model:value="model.summary" :rows="4" show-count :maxlength="5000" />
      </a-form-item>
    </template>
  </JccFormModal>
</template>
