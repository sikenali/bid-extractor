<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import TopNav from '@/components/layout/TopNav.vue';
import FileUploader from '@/components/upload/FileUploader.vue';
import { uploadFile, getParseStatus } from '@/api/upload';
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
    const uploadResult = await uploadFile(file);
    const jobId = uploadResult.id;

    const pollInterval = setInterval(async () => {
      try {
        const statusData = await getParseStatus(jobId);

        if (statusData.progress != null) {
          progressPercent.value = statusData.progress;
        }

        if (statusData.status === 'parsed') {
          clearInterval(pollInterval);
          progressPercent.value = 100;

          const project = await createProject({
            name: file.name.replace(/\.(pdf|docx|doc)$/i, ''),
            ...statusData.result?.extracts
          });
          router.push(`/project/${project.id}?jobId=${jobId}`);
        } else if (statusData.status === 'error') {
          clearInterval(pollInterval);
          alert(statusData.error || '解析失败');
          uploading.value = false;
          progressPercent.value = 0;
          progressFileName.value = '';
          selectedFile.value = null;
        }
      } catch {
        // Poll failed, continue
      }
    }, 500);

    setTimeout(async () => {
      clearInterval(pollInterval);
      if (uploading.value) {
        progressPercent.value = 100;
        const project = await createProject({ name: file.name.replace(/\.(pdf|docx|doc)$/i, '') });
        router.push(`/project/${project.id}?jobId=${jobId}`);
      }
    }, 60000);

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