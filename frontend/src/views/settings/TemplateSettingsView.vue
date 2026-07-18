<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { addTemplate } from '@/api/templates';
import AddTemplateDialog from '@/components/settings/AddTemplateDialog.vue';

const showAddDialog = ref(false);

async function handleAddSubmit(data: { name: string; category: string; file: File | null; description?: string }) {
  try {
    await addTemplate({
      type: 'bidding',
      category: data.category,
      name: data.name,
      description: data.description || ''
    });
    ElMessage.success('模板已添加');
    showAddDialog.value = false;
  } catch {
    ElMessage.error('添加失败');
  }
}
</script>

<template>
  <div class="settings-view">
    <div class="settings-content">
      <h2 class="page-title">模板设置</h2>
      <p class="page-desc">管理招标模板、投标模板及自定义模板</p>
      <div class="template-grid">
        <div class="template-card add-template" @click="showAddDialog = true">
          <div class="add-icon-wrapper">
            <span class="icon ri-add-line"></span>
          </div>
          <p class="add-label">添加模板</p>
        </div>
      </div>
    </div>
    <AddTemplateDialog
      v-model:visible="showAddDialog"
      @close="showAddDialog = false"
      @submit="handleAddSubmit"
    />
  </div>
</template>

<style scoped>
.settings-view { min-height: 100vh; background-color: var(--color-bg-main); }
.settings-content { flex: 1; padding: 32px; }
.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 4px 0; }
.page-desc { font-size: 14px; color: var(--color-text-muted); margin: 0 0 24px 0; }

.template-grid { display: flex; gap: 20px; flex-wrap: wrap; }
.template-card { width: 200px; border: 0.7px solid var(--color-border); border-radius: 12px; overflow: hidden; background-color: white; }
.add-template { display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: var(--color-bg-card); border: 2px dashed var(--color-border); cursor: pointer; height: 320px; }
.add-icon-wrapper { width: 48px; height: 48px; background-color: var(--color-bg-card); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.add-icon-wrapper .icon { font-size: 22px; color: var(--color-text-secondary); font-family: "remixicon", sans-serif; font-style: normal; }
.add-label { font-size: 14px; color: var(--color-text-secondary); margin-top: 12px; font-weight: 500; }
</style>
