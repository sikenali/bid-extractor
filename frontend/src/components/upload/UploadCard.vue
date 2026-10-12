<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { uploadFile } from '@/api/upload';
import StepStrip from '@/components/StepStrip.vue';
import { UiTip } from '@/components/ui';

interface Step {
  key: number;
  label: string;
}

const props = withDefaults(defineProps<{
  steps?: Step[];
  title?: string;
}>(), {
  steps: () => [
    { key: 0, label: '解析文件' },
    { key: 1, label: '转换释义' },
    { key: 2, label: '提取字段' },
  ],
});

const emit = defineEmits<{
  (e: 'success', jobId: string): void;
  (e: 'replace'): void;
}>();

const uploading = ref(false);
const isDragging = ref(false);
const selectedFile = ref<File | null>(null);

function getExt(file: File): string {
  const name = file.name.toLowerCase();
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i) : '';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function validateFile(file: File): boolean {
  const ext = getExt(file);
  if (ext === '.doc') {
    ElMessage.warning('不支持 .doc 格式，请转换成 Docx 格式后再上传～');
    return false;
  }
  if (!['.docx', '.pdf', '.md', '.txt', '.xlsx', '.wps'].includes(ext)) {
    ElMessage.warning('不支持的格式，请上传招标文件');
    return false;
  }
  return true;
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}
function handleDragLeave() {
  isDragging.value = false;
}
function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0 && !uploading.value) {
    if (validateFile(files[0])) selectFile(files[0]);
  }
}

function triggerFileInput() {
  (document.getElementById('fileInput') as HTMLInputElement)?.click();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0 && !uploading.value) {
    if (validateFile(input.files[0])) selectFile(input.files[0]);
    else input.value = '';
  }
}

function selectFile(file: File) {
  selectedFile.value = file;
}

function startUpload(file: File) {
  if (!selectedFile.value || uploading.value) return;
  uploading.value = true;

  uploadFile(file).then((uploadResult) => {
    setTimeout(() => {
      emit('success', uploadResult.id);
    }, 500);
  }).catch((err: any) => {
    const msg = err?.response?.data?.error || '上传失败，请重试';
    ElMessage.error(msg);
    uploading.value = false;
    selectedFile.value = null;
  });
}

function handleReplace() {
  if (uploading.value) return;
  selectedFile.value = null;
  uploading.value = false;
  emit('replace');
}

const btnDisabled = computed(() => !selectedFile.value || uploading.value);
const btnLabel = computed(() => {
  if (uploading.value) return '提取中…';
  return '一键提取';
});
</script>

<template>
  <div class="upload-wrapper">
    <div
      class="upload-card"
      :class="{ dragging: isDragging, hasFile: !!selectedFile && !uploading, uploading: uploading }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @click="!uploading && triggerFileInput()"
    >
      <!-- initial state -->
      <template v-if="!selectedFile">
        <div class="upload-icon-wrap">
          <span class="ri-upload-cloud-2-line icon"></span>
        </div>
        <p class="upload-hint">{{ title || '点击选择或拖拽招标文件到此处上传' }}</p>
        <div class="format-row">
          <span class="fmt fmt-w">W</span>
          <span class="fmt fmt-x">X</span>
          <span class="fmt fmt-p">P</span>
          <span class="fmt fmt-pdf">PDF</span>
          <span class="fmt fmt-md">MD</span>
          <span class="fmt fmt-tx">TX</span>
        </div>
      </template>

      <!-- file selected: centered icon + name + size (kept as-is during upload, animation lives in StepStrip below) -->
      <template v-else>
        <UiTip text="替换文件" placement="left" class="replace-tip">
          <button v-if="!uploading" class="replace-icon" @click.stop="handleReplace">
            <span class="ri-refresh-line icon"></span>
          </button>
        </UiTip>
        <div class="file-centered">
          <div class="file-icon" :class="'fmt-' + getExt(selectedFile).replace('.', '')">
            <svg v-if="getExt(selectedFile) === '.docx' || getExt(selectedFile) === '.wps'" width="32" height="32" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M8 9h12M8 13h12M8 17h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <svg v-else-if="getExt(selectedFile) === '.xlsx'" width="32" height="32" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M8 9h12M8 13h12M8 17h12M14 7v14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <svg v-else-if="getExt(selectedFile) === '.pdf'" width="32" height="32" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M9 10l4 3-4 3V10z" fill="currentColor"/>
              <path d="M17 10l4 3-4 3V10z" fill="currentColor" opacity="0.5"/>
            </svg>
            <svg v-else-if="getExt(selectedFile) === '.md'" width="32" height="32" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
              <text x="8" y="21" font-family="sans-serif" font-size="11" font-weight="700" fill="currentColor">M</text>
            </svg>
            <svg v-else width="32" height="32" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M9 9h10M9 13h10M9 17h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="file-name">{{ selectedFile.name }}</p>
          <p class="file-size">{{ formatSize(selectedFile.size) }}</p>
        </div>
      </template>

      <input
        id="fileInput"
        type="file"
        class="file-input-hidden"
        accept=".docx,.pdf,.md,.txt,.xlsx,.wps"
        :disabled="uploading"
        @change="handleFileSelect"
      />
    </div>

    <StepStrip
      :steps="steps"
      :loading="uploading"
      :button-label="btnLabel"
      :disabled="btnDisabled"
      @extract="selectedFile && startUpload(selectedFile)"
    />
  </div>
</template>

<style scoped>
.upload-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

/* ── upload card ────────────────────────────────────── */
.upload-card {
  width: 875px;
  height: 345px;
  flex-shrink: 0;
  background-color: var(--color-bg-white, #FFFFFF);
  border: 0.7px solid var(--color-border, #E5DFD3);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s, background-color 0.2s;
  position: relative;
  overflow: hidden;
  gap: 20px;
  padding: 40px 32px;
  margin-bottom: 48px;
}
.upload-card.dragging {
  border-color: var(--color-primary, #C0392B);
  background-color: var(--color-primary-soft, #FBE9E7);
}
.upload-card.hasFile {
  cursor: default;
}
.upload-card.uploading {
  cursor: default;
}

/* initial state */
.upload-icon-wrap {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background-color: var(--color-bg-secondary, #F7F3EA);
  display: flex;
  align-items: center;
  justify-content: center;
}
.upload-icon-wrap .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 34px;
  color: var(--color-text-muted, #8A8578);
}
.upload-hint {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  line-height: 1.2;
  text-align: center;
}
.format-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.fmt {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  line-height: 1;
}
.fmt-w   { background-color: #2B579A; font-size: 11px; }
.fmt-x   { background-color: #217346; font-size: 11px; }
.fmt-p   { background-color: var(--color-primary, #C0392B); font-size: 11px; }
.fmt-pdf { background-color: #B03A2E; font-size: 9px; }
.fmt-md  { background-color: #4A6FA5; font-size: 9px; }
.fmt-tx  { background-color: #5A5750; font-size: 9px; }

/* ── file selected state: centered icon + name + size ── */
.replace-tip {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
}
.replace-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 0.7px solid var(--color-border, #E5DFD3);
  background-color: var(--color-bg-white, #FFFFFF);
  color: var(--color-text-muted, #8A8578);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, border-color 0.2s, background-color 0.2s, transform 0.2s;
}
.replace-icon:hover {
  color: var(--color-primary, #C0392B);
  border-color: var(--color-primary, #C0392B);
  background-color: var(--color-primary-soft, #FBE9E7);
}
.replace-icon:hover .icon {
  transform: rotate(120deg);
}
.replace-icon .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
  transition: transform 0.3s ease;
}
.file-centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: center;
}
.file-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.file-icon.fmt-docx, .file-icon.fmt-wps { background-color: #2B579A; color: #fff; }
.file-icon.fmt-xlsx                   { background-color: #217346; color: #fff; }
.file-icon.fmt-pdf                    { background-color: var(--color-primary, #C0392B); color: #fff; }
.file-icon.fmt-md                     { background-color: #4A6FA5; color: #fff; }
.file-icon.fmt-txt                    { background-color: #5A5750; color: #fff; }
.file-name {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.file-size {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-muted, #8A8578);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.file-input-hidden { display: none; }
</style>
