<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import TopNav from '@/components/layout/TopNav.vue';
import FileUploader from '@/components/upload/FileUploader.vue';
import { uploadFile } from '@/api/upload';
import { createProject } from '@/api/projects';

const router = useRouter();
const uploading = ref(false);
const selectedFile = ref<File | null>(null);
const progressPercent = ref(0);

const progressLabel = computed(() => {
  if (!selectedFile.value) return '';
  const name = selectedFile.value.name.length > 20
    ? selectedFile.value.name.substring(0, 20) + '...'
    : selectedFile.value.name;
  return `正在解析: ${name}`;
});

async function handleUploaded(file: File) {
  selectedFile.value = file;
  uploading.value = true;
  progressPercent.value = 0;

  try {
    await uploadFile(file);
    progressPercent.value = 30;
    await simulateProgress(60, 2000);
    const project = await createProject({ name: file.name.replace(/\.(pdf|docx|doc)$/i, '') });
    progressPercent.value = 90;
    await simulateProgress(100, 500);
    router.push(`/project/${project.id}`);
  } catch (err: any) {
    const msg = err?.response?.data?.error || '上传失败，请重试';
    alert(msg);
    uploading.value = false;
    progressPercent.value = 0;
    selectedFile.value = null;
  }
}

function simulateProgress(target: number, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const start = progressPercent.value;
    const delta = target - start;
    const steps = 20;
    const interval = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      progressPercent.value = Math.min(start + (delta * step / steps), target);
      if (step >= steps) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
}
</script>

<template>
  <div class="upload-view">
    <TopNav />
    <div class="main-content">
      <FileUploader :loading="uploading" @uploaded="handleUploaded" />
      <div v-if="uploading" class="progress-overlay">
        <div class="progress-card">
          <div class="progress-header">
            <span class="progress-label">{{ progressLabel }}</span>
            <span class="progress-percent">{{ Math.round(progressPercent) }}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-bar" :style="{ width: progressPercent + '%' }">
              <div class="shimmer"></div>
            </div>
          </div>
          <div class="progress-steps">
            <span class="step" :class="{ active: progressPercent >= 30 }">文件上传</span>
            <span class="step" :class="{ active: progressPercent >= 60 }">文档解析</span>
            <span class="step" :class="{ active: progressPercent >= 90 }">信息提取</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}
.main-content {
  padding: 32px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  position: relative;
}
.progress-overlay {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 600px;
  z-index: 10;
}
.progress-card {
  background-color: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  border: 1px solid var(--color-border);
}
.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.progress-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}
.progress-percent {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
}
.progress-track {
  height: 8px;
  background-color: var(--color-bg-card);
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 16px;
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
.progress-steps {
  display: flex;
  gap: 16px;
}
.step {
  font-size: 12px;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.step::before {
  content: '';
  width: 8px;
  height: 8px;
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
</style>