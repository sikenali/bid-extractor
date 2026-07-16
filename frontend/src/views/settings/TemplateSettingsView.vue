<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getTemplates, addTemplate, deleteTemplate } from '@/api/templates';
import AddTemplateDialog from '@/components/settings/AddTemplateDialog.vue';

interface Template {
  id: string;
  type: string;
  category: string;
  name: string;
  description: string;
}

const activeTab = ref('bidding');
const templates = ref<Template[]>([]);
const showAddDialog = ref(false);

const tabs = [
  { key: 'bidding', label: '招标模板' },
  { key: 'proposal', label: '投标模板' },
  { key: 'custom', label: '自定义模板' }
];

const gradients: Record<string, string> = {
  government: 'linear-gradient(180deg, #F5EFE3 0%, #FBF7F0 100%)',
  engineering: 'linear-gradient(180deg, #E8F0F8 0%, #F5F8FB 100%)',
  it_service: 'linear-gradient(180deg, #F0F8F0 0%, #F5FAF5 100%)',
  consulting: 'linear-gradient(180deg, #FFF8F0 0%, #FFFCF8 100%)'
};

const gradientColors: Record<string, string> = {
  government: '#C43D3D',
  engineering: '#2D6A9F',
  it_service: '#2D8A4E',
  consulting: '#D4A017'
};

const tabContainerRef = ref<HTMLElement | null>(null);
const indicatorStyle = ref({ left: '0px', width: '0px' });
const isInitialized = ref(false);

function positionIndicator() {
  const container = tabContainerRef.value;
  if (!container) return;
  const activeEl = container.querySelector(`[data-tab-key="${activeTab.value}"]`) as HTMLElement | null;
  if (!activeEl) return;
  const containerRect = container.getBoundingClientRect();
  const elRect = activeEl.getBoundingClientRect();
  indicatorStyle.value = {
    left: `${elRect.left - containerRect.left}px`,
    width: `${elRect.width}px`,
  };
}

function selectTab(key: string) {
  activeTab.value = key;
  loadTemplates();
  nextTick(positionIndicator);
}

async function loadTemplates() {
  try {
    templates.value = await getTemplates(activeTab.value);
  } catch {
    templates.value = [];
  }
}

onMounted(() => {
  loadTemplates();
  nextTick(() => {
    positionIndicator();
    setTimeout(() => { isInitialized.value = true; }, 150);
  });
});

async function handleAddSubmit(data: { name: string; category: string; file: File | null; description?: string }) {
  try {
    await addTemplate({
      type: activeTab.value,
      category: data.category,
      name: data.name,
      description: data.description || ''
    });
    ElMessage.success('模板已添加');
    await loadTemplates();
  } catch {
    ElMessage.error('添加失败');
  }
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除此模板吗？', '确认删除');
    await deleteTemplate(id);
    ElMessage.success('模板已删除');
    await loadTemplates();
  } catch {
    // cancelled
  }
}
</script>

<template>
  <div class="settings-view">
    <div class="settings-content">
      <h2 class="page-title">模板设置</h2>
      <p class="page-desc">管理招标模板、投标模板及自定义模板</p>
      <div ref="tabContainerRef" class="tab-bar">
        <div
          class="tab-indicator"
          :class="{ animated: isInitialized }"
          :style="indicatorStyle"
        ></div>
        <div
          v-for="tab in tabs"
          :key="tab.key"
          :data-tab-key="tab.key"
          class="tab-item"
          :class="{ active: activeTab === tab.key }"
          @click="selectTab(tab.key)"
        >
          {{ tab.label }}
        </div>
      </div>
      <div class="template-grid">
        <div
          v-for="tpl in templates.slice(0, 4)"
          :key="tpl.id"
          class="template-card"
        >
          <div class="template-cover" :style="{ background: gradients[tpl.category] || gradients.government }">
            <span class="cover-icon ri-file-text-line" :style="{ color: gradientColors[tpl.category] || '#C43D3D' }"></span>
            <h4 class="cover-title">{{ tpl.name }}</h4>
            <p class="cover-subtitle">标准模板</p>
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
      :active-tab="activeTab"
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
.tab-bar { display: inline-flex; background-color: var(--color-bg-card); border-radius: 12px; padding: 4px; margin-bottom: 24px; position: relative; }
.tab-indicator { position: absolute; top: 4px; bottom: 4px; background-color: var(--color-primary); border-radius: 8px; z-index: 0; pointer-events: none; }
.tab-indicator.animated { transition: left 0.3s ease-out, width 0.3s ease-out; }
.tab-item { position: relative; z-index: 1; padding: 8px 24px; border-radius: 8px; font-size: 13px; cursor: pointer; color: var(--color-text-secondary); transition: color 0.2s; }
.tab-item.active { color: white; font-weight: 600; }
.template-grid { display: flex; gap: 20px; flex-wrap: wrap; }
.template-card { width: 200px; border: 0.7px solid var(--color-border); border-radius: 12px; overflow: hidden; background-color: white; }
.template-cover { height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
.cover-icon { font-size: 40px; font-family: "remixicon", sans-serif; font-style: normal; }
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
