<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';

const props = withDefaults(defineProps<{
  loading?: boolean;
  percent?: number;
  fileName?: string;
}>(), { loading: false, percent: 0, fileName: '' });

const emit = defineEmits<{
  uploaded: [file: File]
}>();

const isDragging = ref(false);
const selectedFile = ref<File | null>(null);

function validateFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (ext === '.doc') {
    ElMessage.warning('不支持 .doc 格式，请转换成 Docx 格式后再上传～');
    return false;
  }
  if (ext !== '.docx') {
    ElMessage.warning('仅支持 .docx 格式');
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
  if (files && files.length > 0 && !props.loading) {
    selectedFile.value = files[0];
    if (validateFile(files[0])) {
      emit('uploaded', files[0]);
    } else {
      selectedFile.value = null;
    }
  }
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0 && !props.loading) {
    selectedFile.value = input.files[0];
    if (validateFile(input.files[0])) {
      emit('uploaded', input.files[0]);
    } else {
      selectedFile.value = null;
      input.value = '';
    }
  }
}

function triggerFileInput() {
  if (props.loading) return;
  const el = document.getElementById('fileInput') as HTMLInputElement;
  el?.click();
}

</script>

<template>
  <div
    class="upload-area"
    :class="{ dragging: isDragging, loading: props.loading }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="upload-icon-wrapper">
      <span class="icon ri-book-2-line"></span>
    </div>

    <template v-if="!props.loading">
      <p class="upload-title">
        {{ selectedFile ? `已选择: ${selectedFile.name}` : '上传招标文件' }}
      </p>
      <p class="upload-hint">支持 DOCX 格式，单个文件不超过 50MB</p>
    </template>
    <template v-else>
      <p class="upload-title">正在解析: {{ props.fileName }}</p>
    </template>

    <div v-if="props.loading" class="progress-wrapper">
      <div class="progress-track">
        <div class="progress-bar" :style="{ width: props.percent + '%' }">
          <div class="shimmer"></div>
        </div>
      </div>
      <p class="progress-text">{{ Math.round(props.percent) }}% · 文件解析中...</p>
      <div class="progress-steps">
        <span class="step" :class="{ active: props.percent >= 30 }">上传</span>
        <span class="step" :class="{ active: props.percent >= 60 }">解析</span>
        <span class="step" :class="{ active: props.percent >= 90 }">提取</span>
      </div>
    </div>

    <input
      id="fileInput"
      type="file"
      class="file-input-hidden"
      accept=".docx"
      :disabled="props.loading"
      @change="handleFileSelect"
    />

    <div v-if="!props.loading" class="upload-btn" @click="triggerFileInput">
      <span class="icon ri-upload-2-line"></span>
      <span>选择文件</span>
    </div>
  </div>
</template>

<style scoped>
.upload-area {
  width: 100%;
  height: 531px;
  border: 2px dashed var(--color-border);
  border-radius: 16px;
  background-color: var(--color-bg-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  transition: all 0.3s;
  position: relative;
}
.upload-area.dragging {
  border-color: var(--color-primary);
  background-color: rgba(196, 61, 61, 0.05);
}
.upload-area.loading {
  opacity: 0.7;
  pointer-events: none;
}
.upload-icon-wrapper {
  width: 80px;
  height: 80px;
  background-color: var(--color-bg-card);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
}
.upload-icon-wrapper .icon {
  font-size: 36px;
  color: var(--color-primary);
}
.upload-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}
.upload-hint {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0;
}
.progress-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 300px;
}
.progress-track {
  width: 100%;
  height: 8px;
  background-color: var(--color-bg-secondary);
  border-radius: 9999px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background-color: var(--color-primary);
  border-radius: 9999px;
  transition: width 0.3s ease;
  position: relative;
}
.shimmer {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  0% { left: -100%; }
  100% { left: 100%; }
}
.progress-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
}
.progress-steps {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}
.step {
  font-size: 11px;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}
.step::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-border);
  transition: background-color 0.3s;
}
.step.active {
  color: var(--color-primary);
  font-weight: 500;
}
.step.active::before {
  background-color: var(--color-primary);
}
.upload-btn {
  height: 44px;
  padding: 12px 32px;
  font-size: 15px;
  font-weight: 600;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.upload-btn:hover {
  opacity: 0.9;
}
.upload-btn .icon {
  font-size: 18px;
}
.file-input-hidden {
  display: none;
}
.drop-hint {
  font-size: 12px;
  color: var(--color-border);
  margin: 0;
}
</style>