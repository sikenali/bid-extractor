<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { DocxEditor } from '@eigenpal/docx-editor-vue';
import '@eigenpal/docx-editor-vue/styles.css';

const props = defineProps<{
  visible: boolean;
  filename: string;
  fileId?: string;
}>();

const emit = defineEmits<{
  close: []
}>();

const loading = ref(false);
const errorMsg = ref('');
const fileUrl = ref<string | null>(null);
const docBuffer = ref<ArrayBuffer | null>(null);

const displayName = computed(() => {
  const name = props.fileId || props.filename;
  return name.replace(/\.[^.]+$/, '');
});

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
    docBuffer.value = null;
    try {
      const fileKey = props.fileId || props.filename;
      const response = await fetch(`/api/upload/file/${encodeURIComponent(fileKey)}`);
      if (response.ok) {
        if (isDocx.value) {
          docBuffer.value = await response.arrayBuffer();
        } else {
          fileUrl.value = URL.createObjectURL(await response.blob());
        }
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
    docBuffer.value = null;
  }
});

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => { if (!val) emit('close'); }
});

function handleClose() {
  emit('close');
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="960px"
    class="preview-modal"
    :close-on-click-modal="false"
    :show-close="false"
    :destroy-on-close="false"
  >
    <div class="preview-container">
      <div class="preview-header">
        <div class="file-info">
          <span class="icon ri-file-text-line file-icon"></span>
          <span class="file-name">{{ displayName }}</span>
        </div>
        <button class="close-btn" @click="handleClose">
          <span class="icon ri-close-line"></span>
        </button>
      </div>

      <div class="preview-content">
        <div v-if="loading" class="preview-loading">
          <span class="icon ri-loader-line spin-icon"></span>
          <span>加载中...</span>
        </div>
        <div v-else-if="errorMsg" class="preview-error">
          <span class="icon ri-error-warning-line"></span>
          <span>{{ errorMsg }}</span>
        </div>
        <div v-else-if="isDocx && docBuffer" class="doc-content">
          <DocxEditor
            :document-buffer="docBuffer"
            :show-toolbar="false"
            :show-menu-bar="false"
            :show-ruler="false"
            :show-file-open="false"
            :show-help-menu="false"
            :show-zoom-control="false"
            read-only
            mode="viewing"
          />
        </div>
        <div v-else-if="isPdf && fileUrl" class="doc-content">
          <embed :src="fileUrl" type="application/pdf" width="100%" height="100%" />
        </div>
        <div v-else class="doc-content preview-placeholder">
          <span class="icon ri-file-text-line"></span>
          <p>暂无预览内容</p>
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
.preview-content { height: calc(100vh - 220px); max-height: 800px; overflow-y: auto; }
.doc-content { width: 100%; }
.preview-loading, .preview-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 80px 40px; color: var(--color-text-muted); font-size: 14px; }
.preview-loading .icon, .preview-error .icon { font-size: 32px; }
.spin-icon { animation: spin 1.5s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.preview-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--color-text-muted); min-height: 400px; }
.preview-placeholder .icon { font-size: 40px; font-family: "remixicon", sans-serif; font-style: normal; }
.preview-placeholder p { font-size: 14px; margin: 0; }
</style>
