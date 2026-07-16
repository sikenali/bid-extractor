<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import VueOfficeDocx from '@vue-office/docx';
import '@vue-office/docx/lib/index.css';

const props = defineProps<{
  visible: boolean;
  filename: string;
}>();

const emit = defineEmits<{
  close: []
}>();

const currentPage = ref(1);
const totalPages = ref(1);
const zoomLevel = ref(100);
const loading = ref(false);
const errorMsg = ref('');
const fileUrl = ref<string | null>(null);

const isDocx = computed(() => {
  const name = (props.filename || '').toLowerCase();
  return name.endsWith('.docx');
});

const isPdf = computed(() => {
  const name = (props.filename || '').toLowerCase();
  return name.endsWith('.pdf');
});

watch(() => props.visible, async (val) => {
  if (val) {
    loading.value = true;
    errorMsg.value = '';
    fileUrl.value = null;
    currentPage.value = 1;
    try {
      const response = await fetch(`/api/upload/file/${encodeURIComponent(props.filename)}`);
      if (response.ok) {
        fileUrl.value = URL.createObjectURL(await response.blob());
      } else {
        errorMsg.value = '文件加载失败';
      }
    } catch {
      errorMsg.value = '文件加载失败';
    } finally {
      loading.value = false;
    }
  } else {
    if (fileUrl.value) {
      URL.revokeObjectURL(fileUrl.value);
      fileUrl.value = null;
    }
  }
});

function prevPage() {
  if (currentPage.value > 1) currentPage.value--;
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++;
}

function zoomIn() {
  zoomLevel.value = Math.min(zoomLevel.value + 25, 200);
}

function zoomOut() {
  zoomLevel.value = Math.max(zoomLevel.value - 25, 25);
}

function handleClose() {
  emit('close');
}

function handleDownload() {
  if (fileUrl.value) {
    const a = document.createElement('a');
    a.href = fileUrl.value;
    a.download = props.filename;
    a.click();
  }
}
</script>

<template>
  <el-dialog
    v-model="props.visible"
    width="900px"
    class="preview-modal"
    :close-on-click-modal="false"
    :show-close="false"
    :destroy-on-close="false"
  >
    <div class="preview-container">
      <div class="preview-header">
        <div class="file-info">
          <span class="icon ri-file-text-line file-icon"></span>
          <span class="file-name">{{ props.filename }}</span>
        </div>
        <button class="close-btn" @click="handleClose">
          <span class="icon ri-close-line"></span>
        </button>
      </div>

      <div class="preview-toolbar">
        <div class="toolbar-left">
          <button class="nav-btn" @click="prevPage" :disabled="currentPage <= 1">
            <span class="icon ri-arrow-left-s-line"></span>
          </button>
          <div class="page-input">
            <span class="current-page">{{ currentPage }}</span>
            <span class="page-separator">/</span>
            <span class="total-pages">{{ totalPages }}</span>
          </div>
          <button class="nav-btn" @click="nextPage" :disabled="currentPage >= totalPages">
            <span class="icon ri-arrow-right-s-line"></span>
          </button>
          <span class="toolbar-divider"></span>
          <button class="nav-btn" @click="zoomOut" :disabled="zoomLevel <= 25">
            <span class="icon ri-zoom-out-line"></span>
          </button>
          <span class="zoom-level">{{ zoomLevel }}%</span>
          <button class="nav-btn" @click="zoomIn" :disabled="zoomLevel >= 200">
            <span class="icon ri-zoom-in-line"></span>
          </button>
        </div>

        <div class="toolbar-right">
          <button class="nav-btn" title="搜索">
            <span class="icon ri-search-line"></span>
          </button>
          <button class="nav-btn download-btn" title="下载" @click="handleDownload">
            <span class="icon ri-download-2-line"></span>
          </button>
        </div>
      </div>

      <div class="preview-content">
        <div class="pdf-page" :style="{ transform: `scale(${zoomLevel / 100})`, width: '650px' }">
          <div v-if="loading" class="preview-loading">
            <span class="icon ri-loader-line spin-icon"></span>
            <span>加载中...</span>
          </div>
          <div v-else-if="errorMsg" class="preview-error">
            <span class="icon ri-error-warning-line"></span>
            <span>{{ errorMsg }}</span>
          </div>
          <div v-else-if="isDocx && fileUrl" class="doc-content">
            <VueOfficeDocx :src="fileUrl" />
          </div>
          <div v-else-if="isPdf && fileUrl" class="doc-content">
            <embed :src="fileUrl" type="application/pdf" width="570px" height="800px" />
          </div>
          <div v-else class="doc-content preview-placeholder">
            <span class="icon ri-file-text-line"></span>
            <p>暂无预览内容</p>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.preview-container { display: flex; flex-direction: column; }
.preview-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background-color: var(--color-bg-card); border-radius: 16px 16px 0 0; }
.file-info { display: flex; align-items: center; gap: 12px; }
.file-icon { font-size: 22px; color: var(--color-primary); font-family: "remixicon", sans-serif; font-style: normal; }
.file-name { font-size: 16px; font-weight: 600; color: var(--color-text-primary); max-width: 600px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.close-btn { width: 32px; height: 32px; background-color: var(--color-bg-card); border-radius: 8px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); font-size: 18px; transition: all 0.2s; }
.close-btn:hover { background-color: var(--color-bg-secondary); }
.close-btn .icon { font-family: "remixicon", sans-serif; font-style: normal; }
.preview-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; background-color: var(--color-bg-main); }
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 8px; }
.nav-btn { width: 32px; height: 32px; background-color: var(--color-bg-card); border-radius: 8px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); font-size: 16px; transition: all 0.2s; }
.nav-btn:hover:not(:disabled) { background-color: var(--color-bg-secondary); }
.nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.nav-btn .icon { font-family: "remixicon", sans-serif; font-style: normal; }
.nav-btn.download-btn { background-color: var(--color-primary); color: white; }
.nav-btn.download-btn:hover { background-color: var(--color-primary); }
.page-input { display: flex; align-items: center; background-color: var(--color-bg-card); border-radius: 8px; padding: 4px 12px; font-size: 13px; }
.current-page { font-weight: 500; color: var(--color-text-primary); }
.page-separator { color: var(--color-text-muted); margin: 0 4px; }
.total-pages { color: var(--color-text-muted); }
.toolbar-divider { width: 1px; height: 24px; background-color: var(--color-bg-card); margin: 0 12px; }
.zoom-level { font-size: 13px; font-weight: 500; color: var(--color-text-primary); min-width: 44px; text-align: center; }
.preview-content { background-color: #E8E0D0; padding: 32px; display: flex; justify-content: center; min-height: 500px; }
.pdf-page { background-color: white; border-radius: 8px; box-shadow: 0 4px 24px rgba(61, 43, 31, 0.12); transition: transform 0.2s; transform-origin: top center; position: relative; overflow: hidden; }
.preview-loading, .preview-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 80px 40px; color: var(--color-text-muted); font-size: 14px; }
.preview-loading .icon, .preview-error .icon { font-size: 32px; }
.spin-icon { animation: spin 1.5s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.doc-content { padding: 32px 40px; min-height: 600px; }
.preview-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--color-text-muted); min-height: 600px; }
.preview-placeholder .icon { font-size: 40px; font-family: "remixicon", sans-serif; font-style: normal; }
.preview-placeholder p { font-size: 14px; margin: 0; }
:deep(.docx) { padding: 0 !important; background: white !important; }
:deep(.docx section) { box-shadow: none !important; margin: 0 !important; }
</style>
