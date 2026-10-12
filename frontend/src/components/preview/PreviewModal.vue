<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps<{ visible: boolean; filename: string; fileId?: string; initialPage?: number | null }>();
const emit = defineEmits<{ close: [] }>();

const loading = ref(false);
const errorMsg = ref('');
const currentFile = ref<any>(null);

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => { if (!val) emit('close'); }
});

watch(() => props.visible, async (val) => {
  if (val) {
    loading.value = true;
    errorMsg.value = '';
    try {
      const fileKey = props.fileId || props.filename;
      const res = await fetch(`/api/upload/file/${encodeURIComponent(fileKey)}`);
      if (res.ok) {
        currentFile.value = await res.blob();
      } else {
        errorMsg.value = '文件加载失败';
      }
    } catch {
      errorMsg.value = '文件加载失败';
    } finally {
      loading.value = false;
    }
  } else {
    currentFile.value = null;
    errorMsg.value = '';
  }
});

function handleClose() { emit('close'); }

const isDocx = computed(() => props.filename.toLowerCase().endsWith('.docx'));
const isPdf = computed(() => props.filename.toLowerCase().endsWith('.pdf'));
const displayName = computed(() => props.filename.replace(/\.[^0-9-]+$/, ''));
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
        <button class="close-btn" @click="handleClose"><span class="icon ri-close-line"></span></button>
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
        <div v-else-if="currentFile" class="preview-supported">
          <p class="preview-tip">文件预览功能开发中，仅支持下载预览。</p>
          <button class="download-btn" @click="window.open(URL.createObjectURL(currentFile))">下载文件预览</button>
        </div>
        <div v-else></div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.preview-container { display: flex; flex-direction: column; }
.preview-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background-color: var(-color-bg-secondary); border-radius: 16px 16px 0 0; }
.file-info { display: flex; align-items: center; gap: 10px; }
.file-icon { font-size: 22px; color: var(--color-primary); font-family: "remixicon", sans-serif; }
.file-name { font-size: 16px; font-weight: 600; color: var(--color-text-primary); max-width: 520px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-badge { font-size: 11px; font-weight: 600; color: #fff; background-color: var(--color-primary); border-radius: 4px; padding: 2px 6px; }
.close-btn { width: 32px; height: 32px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; background-color: var(--color-bg-white); color: var(--color-text-secondary); font-size: 18px; }
.close-btn:hover { background-color: var(--color-bg-card); }
.preview-content { height: calc(100vh - 220px); max-height: 800px; overflow: hidden; background-color: var(--color-bg-white); border-radius: 0 0 16px 16px; }
.preview-loading, .preview-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 80px 40px; color: var(--color-text-muted); font-size: 14px; height: 100%; }
.preview-loading .icon, .preview-error .icon { font-size: 32px; }
.spin-icon { animation: spin 1.5s linear infinite; }
.preview-supported { padding: 40px; text-align: center; }
.preview-tip { color: var(--color-text-secondary); margin-bottom: 20px; }
.download-btn { padding: 10px 24px; border-radius: 8px; border: none; background-color: var(--color-primary); color: white; font-size: 14px; cursor: pointer; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>