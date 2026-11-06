<script setup>
import { Alert, Button } from 'ant-design-vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import { downloadBlob } from '../utils/index.js';
import { useAsyncTask } from '../hooks/index.js';
defineOptions({ inheritAttrs: false });
const props = defineProps({
  file: { type: Object, required: true },
  request: { type: Function, required: true },
  label: { type: String, default: '下载文件' },
});
const emit = defineEmits(['success', 'error']);
const { run, loading, error } = useAsyncTask(async ({ signal }) => {
  const result = await props.request(props.file, { signal });
  if (signal.aborted) throw new DOMException('下载已取消', 'AbortError');
  const blob = result instanceof Blob ? result : result?.blob;
  if (!(blob instanceof Blob)) throw new TypeError('下载适配器应返回 Blob 或 {blob,filename}');
  downloadBlob(blob, result?.filename || props.file.name || 'download');
  emit('success', props.file);
});
async function download() {
  if (loading.value) return;
  try {
    await run();
  } catch (cause) {
    if (cause.name !== 'AbortError') emit('error', cause);
  }
}
</script>
<template>
  <div class="jcc-download">
    <Button v-bind="$attrs" :loading="loading" @click="download">
      <DownloadOutlined />
      <slot>{{ label }}</slot>
    </Button>
    <Alert
      v-if="error"
      type="error"
      :message="error.message || '下载失败，请重试'"
      show-icon
      closable
      @close="error = null"
    />
  </div>
</template>
