<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getTemplates, addTemplate, deleteTemplate } from '@/api/templates';
import type { Template } from '@/api/templates';
import AddTemplateDialog from '@/components/settings/AddTemplateDialog.vue';

const showAddDialog = ref(false);
const templates = ref<Template[]>([]);
const activeCategory = ref('all');

const categories = [
  { key: 'all', label: '全部' },
  { key: 'government', label: '政府采购' },
  { key: 'engineering', label: '工程施工' },
  { key: 'it_service', label: '信息化服务' },
  { key: 'consulting', label: '咨询服务' },
];

async function loadTemplates() {
  try {
    templates.value = await getTemplates();
  } catch {
    templates.value = [];
  }
}

const filteredTemplates = ref<Template[]>([]);

watch([templates, activeCategory], () => {
  if (activeCategory.value === 'all') {
    filteredTemplates.value = templates.value;
  } else {
    filteredTemplates.value = templates.value.filter(t => t.category === activeCategory.value);
  }
}, { immediate: true });

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
    await loadTemplates();
  } catch {
    ElMessage.error('添加失败');
  }
}

async function handleDelete(tmpl: Template) {
  try {
    await ElMessageBox.confirm(`确定删除模板「${tmpl.name}」？`, '确认删除');
    await deleteTemplate(tmpl.id);
    ElMessage.success('已删除');
    await loadTemplates();
  } catch {
    // cancelled
  }
}

const categoryColors: Record<string, string> = {
  government: '#c43d3d',
  engineering: '#e68a2e',
  it_service: '#3b82f6',
  consulting: '#8b5cf6',
};

const categoryLabels: Record<string, string> = {
  government: '政府采购',
  engineering: '工程施工',
  it_service: '信息化服务',
  consulting: '咨询服务',
};

onMounted(loadTemplates);
</script>

<template>
  <div class="settings-view">
    <div class="settings-content">
      <h2 class="page-title">模板设置</h2>
      <p class="page-desc">管理招标模板、投标模板及自定义模板</p>

      <div class="category-tabs">
        <button
          v-for="cat in categories"
          :key="cat.key"
          class="category-tab"
          :class="{ active: activeCategory === cat.key }"
          @click="activeCategory = cat.key"
        >{{ cat.label }}</button>
      </div>

      <div class="template-grid">
        <div
          v-for="tmpl in filteredTemplates"
          :key="tmpl.id"
          class="template-card"
          :style="{ '--card-accent': categoryColors[tmpl.category] || '#c43d3d' }"
        >
          <div class="card-accent-bar"></div>
          <div class="card-body">
            <span class="card-icon ri-file-list-3-line"></span>
            <h3 class="card-name">{{ tmpl.name }}</h3>
            <span class="card-category">{{ categoryLabels[tmpl.category] || tmpl.category }}</span>
            <p v-if="tmpl.description" class="card-desc">{{ tmpl.description }}</p>
          </div>
          <button class="card-delete" @click="handleDelete(tmpl)">删除</button>
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

.category-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
.category-tab { padding: 8px 20px; border-radius: 20px; font-size: 13px; border: 0.7px solid var(--color-border); background-color: white; color: var(--color-text-secondary); cursor: pointer; transition: all 0.2s; }
.category-tab.active { background-color: var(--color-primary); color: white; border-color: var(--color-primary); font-weight: 600; }

.template-grid { display: flex; gap: 20px; flex-wrap: wrap; }
.template-card { width: 200px; border: 0.7px solid var(--color-border); border-radius: 12px; overflow: hidden; background-color: white; position: relative; }
.card-accent-bar { height: 6px; background-color: var(--card-accent, #c43d3d); }
.card-body { padding: 20px 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.card-icon { font-size: 32px; color: var(--card-accent, #c43d3d); font-family: "remixicon", sans-serif; font-style: normal; }
.card-name { font-size: 15px; font-weight: 600; color: var(--color-text-primary); margin: 0; }
.card-category { font-size: 11px; color: var(--color-text-muted); background-color: var(--color-bg-card); padding: 2px 8px; border-radius: 4px; }
.card-desc { font-size: 12px; color: var(--color-text-secondary); margin: 4px 0 0; line-height: 1.5; }
.card-delete { position: absolute; top: 12px; right: 12px; font-size: 11px; color: var(--color-text-muted); background: none; border: none; cursor: pointer; padding: 2px 6px; border-radius: 4px; opacity: 0; transition: all 0.2s; }
.template-card:hover .card-delete { opacity: 1; }
.card-delete:hover { background-color: rgba(196, 61, 61, 0.1); color: var(--color-primary); }
.add-template { display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: var(--color-bg-card); border: 2px dashed var(--color-border); cursor: pointer; height: 320px; }
.add-icon-wrapper { width: 48px; height: 48px; background-color: var(--color-bg-card); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.add-icon-wrapper .icon { font-size: 22px; color: var(--color-text-secondary); font-family: "remixicon", sans-serif; font-style: normal; }
.add-label { font-size: 14px; color: var(--color-text-secondary); margin-top: 12px; font-weight: 500; }
</style>
