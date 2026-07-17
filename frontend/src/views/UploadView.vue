<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import TopNav from '@/components/layout/TopNav.vue';
import FileUploader from '@/components/upload/FileUploader.vue';
import { uploadFile } from '@/api/upload';

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

  let cancelled = false;
  const simProgress = () => {
    if (cancelled || progressPercent.value >= 95) return;
    const target = progressPercent.value < 30 ? 30
      : progressPercent.value < 60 ? 60
      : 90;
    const step = Math.max(1, (target - progressPercent.value) / 8);
    progressPercent.value = Math.min(target, progressPercent.value + step);
    setTimeout(simProgress, 600);
  };
  setTimeout(simProgress, 300);

  try {
    const uploadResult = await uploadFile(file);
    cancelled = true;
    progressPercent.value = 100;

    setTimeout(() => {
      router.replace({ path: '/project', query: { jobId: uploadResult.id } });
    }, 400);
  } catch (err: any) {
    cancelled = true;
    const msg = err?.response?.data?.error || '上传失败，请重试';
    alert(msg);
    uploading.value = false;
    progressPercent.value = 0;
    progressFileName.value = '';
    selectedFile.value = null;
  }
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