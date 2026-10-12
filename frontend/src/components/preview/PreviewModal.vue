<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import { OpenFileViewer } from '@open-file-viewer/vue';
import '@open-file-viewer/core/style.css';

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
const displayName = computed(() => props.filename.replace(/\.[^0-9-]+$/, ''));
const isDocx = computed(() => ext.value === '.docx');
const isPdf = computed(() => ext.value === '.pdf');

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

function handleClose() { emit('close'); }

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
  <el-dialog v-model="dialogVisible" width="960px" class="preview-modal" :close-on-click-modal="false" :show-close="false" :destroy-on-close="false">
    <div class="preview-container">
      <div class="preview-header">
        <div class="file-info">
          <span class="icon ri-file-text-line file-icon"></span>
          <span class="file-name">{{ displayName }}</span>
          <span v-if="isDocx" class="file-badge">DOCX</span>
          <span v-else-if="isPdf" class="file-badge">PDF</span>
        </div>
        <div class="header-actions">
          <button v-if="previewBlob" class="download-btn sm" @click="handleDownload">
            <span class="icon ri-download-2-line"></span>
            <span>下载原文件</span>
          </button>
          <button class="close-btn" @click="handleClose"><span class="icon ri-close-line"></span></button>
        </div>
      </div>
      <div class="preview-content">
        <div v-if="loading" class="preview-loading">
          <span class="icon ri-loader-line spin-icon"></span>
          <span>加载中...</span>
        </div>
        <div v-else-if="errorMsg" class="preview-error">
          <span class="icon ri-error-warning-line"></span>
          <span>{{ errorMsg }}</span>
          <button v-if="previewBlob" class="download-btn" @click="handleDownload">下载文件</button>
        </div>
        <OpenFileViewer
          v-else-if="previewBlob"
          :key="viewerKey"
          :file="previewBlob"
          :file-name="props.filename"
          :mime-type="mimeType || undefined"
          :initial-page="props.initialPage ?? undefined"
          locale="zh-CN"
          :toolbar="true"
          height="100%"
          @error="handleViewerError"
        />
        <div v-else></div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.preview-container { display: flex; flex-direction: column; }
.preview-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background-color: var(--color-bg-secondary); border-radius: 16px 16px 0 0; }
.file-info { display: flex; align-items: center; gap: 10px; min-width: 0; }
.file-icon { font-size: 22px; color: var(--color-primary); font-family: "remixicon", sans-serif; }
.file-name { font-size: 16px; font-weight: 600; color: var(--color-text-primary); max-width: 520px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-badge { font-size: 11px; font-weight: 600; color: #fff; background-color: var(--color-primary); border-radius: 4px; padding: 2px 6px; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.close-btn { width: 32px; height: 32px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; background-color: var(--color-bg-white); color: var(--color-text-secondary); font-size: 18px; }
.close-btn:hover { background-color: var(--color-bg-card); }
.preview-content { height: calc(100vh - 220px); max-height: 800px; overflow: hidden auto; background-color: var(--color-bg-white); border-radius: 0 0 16px 16px; }
.preview-loading, .preview-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 80px 40px; color: var(--color-text-muted); font-size: 14px; height: 100%; }
.preview-loading .icon, .preview-error .icon { font-size: 32px; }
.spin-icon { animation: spin 1.5s linear infinite; }
.download-btn { padding: 10px 24px; border-radius: 8px; border: none; background-color: var(--color-primary); color: white; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.download-btn:hover { opacity: 0.9; }
.download-btn.sm { padding: 7px 14px; font-size: 13px; border-radius: 8px; }
.download-btn .icon { font-family: "remixicon", sans-serif; font-style: normal; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
