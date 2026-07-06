<script setup lang="ts">
import { ref } from 'vue';
import TopNav from '@/components/layout/TopNav.vue';
import ProjectForm from '@/components/project/ProjectForm.vue';
import PreviewModal from '@/components/preview/PreviewModal.vue';

const showPreview = ref(false);
</script>

<template>
  <div class="project-view">
    <TopNav />
    <div class="main-content">
      <ProjectForm />
      <el-button type="primary" @click="showPreview = true">预览招标文件</el-button>
    </div>

    <PreviewModal
      v-model:visible="showPreview"
      filename="XX市智慧城市建设项目招标文件.docx"
      @close="showPreview = false"
    />
  </div>
</template>

<style scoped>
.main-content {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
