<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import TopNav from '@/components/layout/TopNav.vue';
import FileUploader from '@/components/upload/FileUploader.vue';
import { uploadFile } from '@/api/upload';
import { createProject } from '@/api/projects';

const router = useRouter();
const uploading = ref(false);
const selectedFile = ref<File | null>(null);
const progressPercent = ref(0);
const progressFileName = ref('');

async function handleUploaded(file: File) {
  selectedFile.value = file;
  progressFileName.value = file.name;
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
    progressFileName.value = '';
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
      <FileUploader :loading="uploading" :percent="progressPercent" :fileName="progressFileName" @uploaded="handleUploaded" />
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
}
</style>