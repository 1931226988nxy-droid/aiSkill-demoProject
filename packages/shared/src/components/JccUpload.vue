<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { Alert, Button, Upload } from 'ant-design-vue';
import { UploadOutlined } from '@ant-design/icons-vue';
import { validateFile } from '../utils/index.js';
defineOptions({ inheritAttrs: false });
const props = defineProps({
  fileList: { type: Array, default: () => [] },
  upload: { type: Function, required: true },
  accept: { type: String, default: '' },
  maxSizeMb: { type: Number, default: 10 },
  maxCount: { type: Number, default: 5 },
  beforeUpload: Function,
});
const emit = defineEmits(['update:fileList', 'change', 'success', 'error']);
const error = ref('');
const pending = new Set();
// 上传前同时执行公共文件校验与调用方校验；拒绝的文件不进入列表。
async function before(file, list) {
  const validation = validateFile(file, { accept: props.accept, maxSizeMB: props.maxSizeMb });
  if (!validation.valid) {
    error.value = validation.error;
    emit('error', new Error(validation.error), file);
    return Upload.LIST_IGNORE;
  }
  try {
    if (props.beforeUpload && (await props.beforeUpload(file, list)) === false)
      return Upload.LIST_IGNORE;
  } catch (cause) {
    error.value = cause.message || '文件校验失败';
    emit('error', cause, file);
    return Upload.LIST_IGNORE;
  }
  error.value = '';
  return true;
}
function customRequest({ file, onProgress, onSuccess, onError }) {
  // 每个文件独立取消；组件卸载时会终止所有仍在进行的上传。
  const controller = new AbortController();
  pending.add(controller);
  Promise.resolve()
    .then(() =>
      props.upload(file, {
        signal: controller.signal,
        onProgress: (percent) => {
          if (!controller.signal.aborted)
            onProgress?.({ percent: Math.max(0, Math.min(100, Number(percent) || 0)) });
        },
      }),
    )
    .then((result) => {
      if (controller.signal.aborted) return;
      onSuccess?.(result || {});
      emit('success', { file, result });
    })
    .catch((cause) => {
      if (controller.signal.aborted) return;
      error.value = cause.message || '上传失败';
      onError?.(cause);
      emit('error', cause, file);
    })
    .finally(() => pending.delete(controller));
  return {
    abort: () => {
      controller.abort();
      pending.delete(controller);
    },
  };
}
function change(info) {
  // fileList 是受控属性，上传结果通过事件交还调用方保存。
  const list = info.fileList.map((file) =>
    file.status === 'done'
      ? { ...file, data: file.response, url: file.response?.url || file.url }
      : file,
  );
  emit('update:fileList', list);
  emit('change', { ...info, fileList: list });
}
onBeforeUnmount(() => pending.forEach((controller) => controller.abort()));
</script>
<template>
  <div class="jcc-upload">
    <Upload
      v-bind="$attrs"
      :file-list="fileList"
      :accept="accept"
      :max-count="maxCount"
      :before-upload="before"
      :custom-request="customRequest"
      @change="change"
    >
      <slot>
        <Button>
          <UploadOutlined />
          上传文件
        </Button>
      </slot>
      <template
        v-for="name in Object.keys($slots).filter((name) => name !== 'default')"
        v-slot:[name]="scope"
      >
        <slot :name="name" v-bind="scope || {}" />
      </template>
    </Upload>
    <p class="jcc-file-hint">
      单个文件不超过 {{ maxSizeMb }} MB
      <span v-if="accept">，支持 {{ accept }}</span>
    </p>
    <Alert v-if="error" type="error" :message="error" show-icon closable @close="error = ''" />
  </div>
</template>
