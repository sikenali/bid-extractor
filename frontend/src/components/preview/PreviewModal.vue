<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import { OpenFileViewer } from '@open-file-viewer/vue';
import { pdfPlugin, officePlugin, textPlugin, imagePlugin } from '@open-file-viewer/core';
import '@open-file-viewer/core/style.css';
import UiModal from '@/components/ui/UiModal.vue';

const viewerPlugins = [pdfPlugin(), officePlugin(), imagePlugin(), textPlugin()];

const props = defineProps<{ visible: boolean; filename: string; fileId?: string; initialPage?: number | null }>();
const emit = defineEmits<{ close: [] }>();

const loading = ref(false);
const errorMsg = ref('');
const previewBlob = ref<Blob | null>(null);
const viewerKey = ref(0);
const downloading = ref(false);

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
    downloading.value = false;
  }
});

async function handleDownload() {
  if (!previewBlob.value) return;
  downloading.value = true;
  try {
    const url = URL.createObjectURL(previewBlob.value);
    const a = document.createElement('a');
    a.href = url;
    a.download = props.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } finally {
    downloading.value = false;
  }
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
    :width="960"
    max-width="94vw"
    height="86vh"
    :show-footer="false"
    @close="dialogVisible = false"
  >
    <div class="preview-body">
      <div class="preview-content">
        <div v-if="loading" class="preview-state">
          <RiLoaderLine style="font-size: 32px" class="icon spin-icon" />
          <span>加载中…</span>
        </div>
        <div v-else-if="errorMsg" class="preview-state preview-state--error">
          <RiErrorWarningLine style="font-size: 32px" class="icon" />
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
      </div>
    </div>

    <template #footer>
      <div />
      <div class="footer-actions">
        <button class="btn-cancel" @click="dialogVisible = false">取消</button>
        <button
          class="btn-confirm"
          :disabled="!previewBlob || downloading"
          @click="handleDownload"
        >
          <RiLoader4Line v-if="downloading" style="font-size: 18px" class="icon spinning" />
          <RiDownload2Line v-else style="font-size: 18px" class="icon" />
          下载原文件
        </button>
      </div>
    </template>
  </UiModal>
</template>

<style scoped>
.preview-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 12px;
}

.preview-content {
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: var(--color-bg-white, #FFFFFF);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 12px;
  position: relative;
}

.preview-state {
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
  width: 100%;
  box-sizing: border-box;
}

.preview-state--error { color: var(--color-primary-text, #C0392B); }

.preview-state .icon { font-style: normal; }

.spin-icon { animation: spin 1.5s linear infinite; display: inline-flex; }
@keyframes spin { to { transform: rotate(360deg); } }

.footer-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  height: 42px;
  padding: 0 24px;
  border: 0.7px solid var(--color-border, #E5DFD3);
  border-radius: 10px;
  background-color: var(--color-bg-card, #FCFBF8);
  color: var(--color-text-secondary, #6E6A60);
  font-size: 15px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-family: "SourceHanSans-Regular", var(--font-family-cn), sans-serif;
}

.btn-cancel:hover { background-color: var(--color-bg-secondary, #F7F3EA); }

.btn-confirm {
  height: 42px;
  padding: 0 28px;
  border: none;
  border-radius: 10px;
  background-color: var(--color-primary, #C0392B);
  color: var(--color-on-primary, #fff);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: opacity 0.2s, transform 0.15s;
  font-family: "SourceHanSans-Medium", var(--font-family-cn), sans-serif;
}

.btn-confirm:hover:not(:disabled) { opacity: 0.92; }
.btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-confirm .icon { font-style: normal; }

.spinning { animation: spin 1s linear infinite; display: inline-flex; }
</style>
