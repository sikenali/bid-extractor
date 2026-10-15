<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import { OpenFileViewer } from '@open-file-viewer/vue';
import { pdfPlugin, officePlugin, textPlugin, imagePlugin } from '@open-file-viewer/core';
import '@open-file-viewer/core/style.css';

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
  <teleport to="body">
    <transition name="preview-modal">
      <div v-if="dialogVisible" class="preview-overlay" @click.self="dialogVisible = false">
        <div class="preview-panel">
          <!-- Header -->
          <div class="preview-header">
            <div class="header-left">
              <div class="header-icon">
                <i class="ri-file-text-line"></i>
              </div>
              <div class="header-text">
                <h2 class="panel-title">文档预览</h2>
                <p class="panel-subtitle">{{ props.filename }}</p>
              </div>
            </div>
            <button class="close-btn" @click="dialogVisible = false" aria-label="关闭">
              <i class="ri-close-line"></i>
            </button>
          </div>

          <!-- Body -->
          <div class="preview-body">
            <div class="preview-content">
              <div v-if="loading" class="preview-state">
                <RiLoaderLine class="icon spin-icon" />
                <span>加载中…</span>
              </div>
              <div v-else-if="errorMsg" class="preview-state preview-state--error">
                <RiErrorWarningLine class="icon" />
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

          <!-- Footer -->
          <div class="preview-footer">
            <div />
            <div class="footer-actions">
              <button class="btn-cancel" @click="dialogVisible = false">取消</button>
              <button
                class="btn-confirm"
                :disabled="!previewBlob || downloading"
                @click="handleDownload"
              >
                <RiLoader4Line v-if="downloading" class="icon spinning" />
                <RiDownload2Line v-else class="icon" />
                下载原文件
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.preview-panel {
  width: 960px;
  max-width: 94vw;
  height: 86vh;
  max-height: 900px;
  background: var(--color-bg-secondary, #F7F3EA);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.1);
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 20px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.header-icon {
  width: 48px;
  height: 48px;
  background: var(--color-primary-soft, #FBE9E7);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  color: var(--color-primary, #C0392B);
  flex-shrink: 0;
}

.header-icon i { font-style: normal; }

.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-primary, #1F1D1A);
  margin: 0;
  line-height: 28px;
  font-family: "SourceHanSans-Bold", var(--font-family-cn), sans-serif;
}

.panel-subtitle {
  font-size: 13px;
  color: var(--color-text-muted, #8A8578);
  margin: 0;
  line-height: 18px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn), sans-serif;
}

.close-btn {
  width: 40px;
  height: 40px;
  background: var(--color-bg-secondary, #F7F3EA);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--color-text-secondary, #6E6A60);
  cursor: pointer;
  border: none;
  flex-shrink: 0;
  transition: background-color 0.2s, transform 0.15s;
}

.close-btn:hover { background: var(--color-border-soft, #EDE9E0); }
.close-btn:active { transform: scale(0.94); }
.close-btn i { font-style: normal; }

/* Body */
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

.preview-state--error { color: var(--color-primary, #C0392B); }

.preview-state .icon {
  font-size: 32px;
  font-family: "remixicon", sans-serif;
  font-style: normal;
}

.spin-icon { animation: spin 1.5s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Footer */
.preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 20px;
  margin-top: 4px;
  flex-shrink: 0;
  border-top: 1px solid var(--color-bg-secondary, #F7F3EA);
}

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
  color: #fff;
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
.btn-confirm .icon { font-style: normal; font-size: 18px; }

.spinning { animation: spin 1s linear infinite; display: inline-flex; }

/* Transition */
.preview-modal-enter-active,
.preview-modal-leave-active {
  transition: opacity 0.25s ease;
}
.preview-modal-enter-active .preview-panel,
.preview-modal-leave-active .preview-panel {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.32, 0.72, 0.35, 1);
}
.preview-modal-enter-from,
.preview-modal-leave-to {
  opacity: 0;
}
.preview-modal-enter-from .preview-panel,
.preview-modal-leave-to .preview-panel {
  opacity: 0;
  transform: translateY(14px) scale(0.98);
}
</style>
