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
        <div
          v-for="tpl in templates"
          :key="tpl.id"
          class="template-card"
        >
          <div class="template-cover">
            <span class="cover-icon ri-file-text-line"></span>
            <h4 class="cover-title">{{ tpl.name }}</h4>
            <p class="cover-subtitle">{{ tpl.type }}</p>
          </div>
          <div class="template-meta">
            <p class="template-name">{{ tpl.name }}</p>
            <p class="template-desc">{{ tpl.description || '暂无描述' }}</p>
            <button class="btn-delete-template" @click="handleDelete(tpl.id)">删除</button>
          </div>
        </div>
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
.template-cover { height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background-color: #F5EFE3; }
.cover-icon { font-size: 40px; font-family: "remixicon", sans-serif; font-style: normal; color: var(--color-primary); }
.cover-title { font-size: 14px; font-weight: 600; color: var(--color-text-primary); margin: 0; }
.cover-subtitle { font-size: 12px; color: var(--color-text-muted); margin: 0; }
.template-meta { padding: 12px 16px; }
.template-name { font-size: 13px; font-weight: 500; color: var(--color-text-primary); margin: 0 0 4px 0; }
.template-desc { font-size: 11px; color: var(--color-text-muted); margin: 0 0 8px 0; }
.btn-delete-template { font-size: 11px; color: var(--color-primary); background: none; border: 1px solid var(--color-primary); border-radius: 6px; padding: 2px 10px; cursor: pointer; }
.btn-delete-template:hover { background-color: var(--color-primary); color: white; }
.add-template { display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: var(--color-bg-card); border: 2px dashed var(--color-border); cursor: pointer; height: 320px; }
.add-icon-wrapper { width: 48px; height: 48px; background-color: var(--color-bg-card); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.add-icon-wrapper .icon { font-size: 22px; color: var(--color-text-secondary); font-family: "remixicon", sans-serif; font-style: normal; }
.add-label { font-size: 14px; color: var(--color-text-secondary); margin-top: 12px; font-weight: 500; }
</style>
