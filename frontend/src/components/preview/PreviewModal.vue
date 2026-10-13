<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import { OpenFileViewer } from '@open-file-viewer/vue';
import { pdfPlugin, officePlugin, textPlugin, imagePlugin } from '@open-file-viewer/core';
import '@open-file-viewer/core/style.css';
import { UiModal } from '@/components/ui';

// 库默认只带 fallback 兜底插件，必须显式注册类型插件，否则所有文件都显示 ofv-fallback
const viewerPlugins = [pdfPlugin(), officePlugin(), imagePlugin(), textPlugin()];

const props = defineProps<{ visible: boolean; filename: string; fileId?: string; initialPage?: number | null }>();
const emit = defineEmits<{ close: [] }>();

const loading = ref(false);
const errorMsg = ref('');
const previewBlob = ref<Blob | null>(null);
const viewerKey = ref(0);

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => { if (!val) emit('close'); }
});

const ext = computed(() => {
  const i = props.filename.lastIndexOf('.');
  return i >= 0 ? props.filename.slice(i).toLowerCase() : '';
});

const mimeType = computed(() => {
  switch (ext.value) {
    case '.pdf': return 'application/pdf';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.doc': return 'application/msword';
    case '.md': return 'text/markdown';
    case '.csv': return 'text/csv';
    case '.txt': case '.log': return 'text/plain';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.bmp': return 'image/bmp';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default: return '';
  }
});

watch(() => props.visible, async (val) => {
  if (val) {
    loading.value = true;
    errorMsg.value = '';
    previewBlob.value = null;
    try {
      const fileKey = props.fileId || props.filename;
      const res = await fetch(`/api/upload/file/${encodeURIComponent(fileKey)}`);
      if (!res.ok) throw new Error();
      previewBlob.value = await res.blob();
      viewerKey.value++;
    } catch {
      errorMsg.value = '文件加载失败';
    } finally {
      loading.value = false;
    }
  } else {
    previewBlob.value = null;
    errorMsg.value = '';
  }
});

function handleDownload() {
  if (!previewBlob.value) return;
  const url = URL.createObjectURL(previewBlob.value);
  const a = document.createElement('a');
  a.href = url;
  a.download = props.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function handleViewerError() {
  errorMsg.value = '该格式暂不支持在线预览，可下载原文件查看。';
}

onUnmounted(() => { previewBlob.value = null; });
</script>

<template>
  <UiModal
    v-model="dialogVisible"
    title="文档预览"
    :subtitle="props.filename"
    icon="ri-file-text-line"
    width="960px"
    confirm-text="下载原文件"
    :confirm-disabled="!previewBlob"
    @confirm="handleDownload"
  >
    <div class="preview-content">
      <div v-if="loading" class="preview-loading">
        <span class="icon ri-loader-line spin-icon"></span>
        <span>加载中...</span>
      </div>
      <div v-else-if="errorMsg" class="preview-error">
        <span class="icon ri-error-warning-line"></span>
        <span>{{ errorMsg }}</span>
      </div>
      <OpenFileViewer
        v-else-if="previewBlob"
        :key="viewerKey"
        :file="previewBlob"
        :file-name="props.filename"
        :mime-type="mimeType || undefined"
        :initial-page="props.initialPage ?? undefined"
        :plugins="viewerPlugins"
        locale="zh-CN"
        :toolbar="true"
        height="100%"
        @error="handleViewerError"
      />
      <div v-else></div>
    </div>
  </UiModal>
</template>

<style scoped>
.preview-content {
  height: min(62vh, 640px);
  overflow: auto;
  background-color: var(--color-bg-white, #FFFFFF);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 12px;
}
.preview-loading, .preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 40px;
  color: var(--color-text-muted, #8A8578);
  font-size: 14px;
  height: 100%;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.preview-loading .icon, .preview-error .icon { font-size: 32px; font-family: "remixicon", sans-serif; font-style: normal; }
.spin-icon { animation: spin 1.5s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
