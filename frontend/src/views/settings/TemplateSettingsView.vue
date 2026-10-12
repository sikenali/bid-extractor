<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';

const templates = ref([]);
const showDialog = ref(false);
const formState = ref({ name: '', description: '', category: '', keywords: '', type: 'custom' });

function openCreateDialog() {
  formState.value = { name: '', description: '', category: '', keywords: '', type: 'custom' };
  showDialog.value = true;
}

function handleSubmit() {
  ElMessage.success('模板功能开发中...');
  showDialog.value = false;
}

function handleDeleteTemplate(template: any) {
  ElMessage.success('模板功能开发中...');
}

function closedDialog() {
  showDialog.value = false;
}

const filteredTemplates = computed(() => templates.value);
</script>

<template>
  <div class="settings-content">
    <h2 class="page-title">模板管理</h2>
    <div class="tabs">
      <button :class="{ active: true }">招标模板</button>
      <button>标书模板</button>
      <button>自定义模板</button>
    </div>
    <div class="template-list">
      <button class="add-btn" @click="openCreateDialog"><span class="icon ri-add-line"></span> 新增模板</button>
      <div class="cards">
        <div class="card">
          <div class="card-header">
            <div class="template-info">
              <h3 class="card-title">工程项目招标模板</h3>
              <p class="card-desc">用于工程建设类招标文件的标准化提取</p>
              <div class="card-tags"><span class="tag">工程建设</span><span class="tag secondary">标价分离</span></div>
            </div>
            <div class="card-icon"><span class="icon ri-file-lines-line"></span></div>
          </div>
          <div class="card-footer">
            <button class="btn btn-sm">编辑</button>
            <button class="btn btn-sm btn-danger">删除</button>
          </div>
        </div>
      </div>
      <div class="feature-notice">模板管理功能开发中，敬请期待...</div>
    </div>
  </div>
</template>

<style scoped>
.settings-content { flex: 1; padding: 32px; overflow-y: auto; }
.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 24px 0; }
.tabs { display: flex; gap: 12px; margin-bottom: 24px; }
.tabs button { padding: 8px 16px; border-radius: 8px; border: 0.7px solid var(--color-border); background: var(--color-bg-card); color: var(--color-text-secondary); font-size: 14px; cursor: pointer; }
.tabs button.active { background: var(--color-primary); color: white; }
.template-list { max-width: 1200px; }
.add-btn { display: flex; gap: 8px; padding: 12px 24px; border-radius: 10px; border: none; background: var(--color-primary); color: white; font-size: 14px; cursor: pointer; margin-bottom: 24px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }
.card { background: white; border: 0.7px solid var(--color-border); border-radius: 16px; overflow: hidden; }
.card-header { display: flex; justify-content: space-between; align-items: start; padding: 24px; gap: 16px; }
.template-info { flex: 1; }
.card-title { font-size: 18px; font-weight: 600; color: var(--color-text-primary); margin: 0 0 8px 0; }
.card-desc { font-size: 14px; color: var(--color-text-secondary); margin: 0 0 12px 0; }
.card-tags { display: flex; gap: 6px; }
.tag { font-size: 12px; padding: 4px 10px; border-radius: 12px; background: var(--color-primary-soft); color: var(--color-primary); font-weight: 500; }
.tag.secondary { background: var(--color-bg-secondary); color: var(--color-text-secondary); }
.card-icon { font-size: 24px; color: var(--color-text-muted); }
.card-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 0.7px solid var(--color-border-soft); }
.btn { padding: 6px 12px; border-radius: 6px; border: none; background: var(--color-bg-secondary); color: var(--color-text-secondary); font-size: 13px; cursor: pointer; }
.btn-sm { padding: 4px 12px; font-size: 13px; }
.btn-danger { background: rgba(192, 57, 43, 0.1); color: #C0392B; }
.feature-notice { text-align: center; padding: 40px; color: var(--color-text-secondary); background: var(--color-bg-secondary); border-radius: 12px; margin-top: 32px; }
</style>
