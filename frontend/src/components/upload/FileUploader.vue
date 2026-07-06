<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  uploaded: [file: File]
}>();

const isDragging = ref(false);

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
  if (files && files.length > 0) {
    emit('uploaded', files[0]);
  }
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    emit('uploaded', input.files[0]);
  }
}

function triggerFileInput() {
  const el = document.getElementById('fileInput') as HTMLInputElement;
  el?.click();
}
</script>

<template>
  <div
    class="upload-area"
    :class="{ dragging: isDragging }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="upload-icon-wrapper">
      <span class="icon">&#xe88c;</span>
    </div>
    <h3 class="upload-title">上传招标文件</h3>
    <p class="upload-hint">支持 PDF、DOCX、DOC 格式，单个文件不超过 50MB</p>
    <div class="upload-btn" @click="triggerFileInput">
      <span class="icon">&#xeb13;</span>
      <span>选择文件</span>
    </div>
    <input
      id="fileInput"
      type="file"
      class="file-input"
      accept=".pdf,.docx,.doc"
      @change="handleFileSelect"
    />
    <p class="drop-hint">或拖拽文件到此处</p>
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
}

.upload-btn .icon {
  font-size: 18px;
}

.file-input {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  top: 0;
  left: 0;
}

.drop-hint {
  font-size: 12px;
  color: var(--color-border);
  margin: 0;
}
</style>
