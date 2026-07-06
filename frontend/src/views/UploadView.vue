<script setup lang="ts">
import TopNav from '@/components/layout/TopNav.vue';
import FileUploader from '@/components/upload/FileUploader.vue';
</script>

<template>
  <div class="upload-view">
    <TopNav />
    <div class="main-content">
      <FileUploader @uploaded="handleUploaded" />
    </div>
  </div>
</template>

<script lang="ts">
function handleUploaded(file: File) {
  console.log('File uploaded:', file.name);
}
</script>

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
