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

  try {
    progressPercent.value = 30;
    const uploadResult = await uploadFile(file);
    const jobId = uploadResult.id;

    progressPercent.value = 100;

    router.push({ path: '/project', query: { jobId } });
  } catch (err: any) {
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