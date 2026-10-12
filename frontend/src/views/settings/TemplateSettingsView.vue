<script setup lang="ts">
// @ts-nocheck
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getTemplateList, deleteTemplate } from '@/api/settings';

const templates = ref<Array<{ id: number; name: string; description: string; category: string; keywords: string[] }>>([]);
const activeTab = ref('bidding');

const tabs = [
  { key: 'bidding', label: '招标模板' },
  { key: 'proposal', label: '标书模板' },
  { key: 'custom', label: '自定义模板' },
];

async function loadTemplates() {
  try {
    const res = await getTemplateList();
    templates.value = (res.templates || []).filter((t: any) => t.type === activeTab.value || (activeTab.value === 'custom' && t.type === 'custom'));
  } catch {
    templates.value = EMPTY_PLACEHOLDER;
  }
}

const EMPTY_PLACEHOLDER = [
  {
    id: 0,
    name: '工程项目招标模板',
    description: '用于工程建设类招标文件的标准化提取',
    category: '工程建设',
    keywords: ['标价分离'],
    type: 'bidding',
  },
];

async function handleDeleteTemplate(template: any) {
  try {
    await ElMessageBox.confirm(`确定删除模板「${template.name}」？`, '确认删除');
    if (template.id) await deleteTemplate(template.id);
    ElMessage.success('已删除');
    templates.value = templates.value.filter(t => t.id !== template.id);
  } catch {
    // cancelled
  }
}

function switchTab(key: string) {
  activeTab.value = key;
  loadTemplates();
}

loadTemplates();
</script>

<template>
  <div class="template-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span class="sep">/</span>
            <span>设置中心</span>
            <span class="sep">/</span>
            <span class="current">模板管理</span>
          </div>
          <div class="header-title">
            <h1>模板管理</h1>
            <p>管理招标、标书与自定义三类提取模板</p>
          </div>
        </div>
        <button class="reset-button" @click="() => {}">
          <span class="icon ri-restart-line"></span>
          恢复默认
        </button>
      </div>
    </div>

    <div class="toolbar-card">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >{{ tab.label }}</button>
      </div>
    </div>

    <div class="section-card">
      <div class="cards">
        <div v-for="template in templates" :key="template.id" class="card">
          <div class="card-header">
            <div class="template-info">
              <h3 class="card-title">{{ template.name }}</h3>
              <p class="card-desc">{{ template.description }}</p>
              <div class="card-tags">
                <span class="tag">{{ template.category }}</span>
                <span v-for="kw in template.keywords" :key="kw" class="tag secondary">{{ kw }}</span>
              </div>
            </div>
            <div class="card-icon"><span class="icon ri-file-lines-line"></span></div>
          </div>
          <div class="card-footer">
            <button class="btn btn-sm">编辑</button>
            <button class="btn btn-sm btn-danger" @click="handleDeleteTemplate(template)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1200px;
}
.page-header-card {
  background-color: #FFFFFF;
  border: 0.7px solid #EFECE3;
  border-radius: 16px;
  padding: 20px 24px;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}
.header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.breadcrumb span {
  color: #A7A296;
}
.breadcrumb span.sep {
  color: #C9C3B6;
}
.breadcrumb span.current {
  color: #3A3A3A;
  font-weight: 500;
}
.header-title h1 {
  font-size: 30px;
  font-weight: 700;
  color: #1F1D1A;
  margin: 12px 0 0 0;
  letter-spacing: -0.5px;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  line-height: 1.2;
}
.header-title p {
  font-size: 15px;
  color: #6E6A60;
  margin: 8px 0 0 0;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.reset-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  height: 48px;
  border: 0.7px solid #E8E4D8;
  background-color: #FFFFFF;
  border-radius: 12px;
  font-size: 15px;
  color: #3A3A3A;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.reset-button:hover {
  background-color: #F7F4EA;
}
.reset-button .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
}
.toolbar-card {
  display: flex;
  align-items: center;
}
.tabs {
  display: inline-flex;
  background-color: #FFFFFF;
  border: 0.7px solid #EFECE3;
  border-radius: 14px;
  padding: 4px;
  gap: 4px;
}
.tab-btn {
  padding: 10px 24px;
  border-radius: 10px;
  border: none;
  background-color: transparent;
  color: #3A3A3A;
  font-size: 15px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active {
  background-color: #C0392B;
  color: white;
  font-weight: 500;
}
.section-card {
  background-color: #FFFFFF;
  border: 0.7px solid #EFECE3;
  border-radius: 16px;
  padding: 24px 28px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}
.card {
  background: #FFFFFF;
  border: 0.7px solid #EFECE3;
  border-radius: 16px;
  overflow: hidden;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  padding: 24px;
  gap: 16px;
}
.template-info {
  flex: 1;
}
.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #1F1D1A;
  margin: 0 0 8px 0;
  font-family: "SourceHanSans-Semibold", var(--font-family-cn);
}
.card-desc {
  font-size: 14px;
  color: #6E6A60;
  margin: 0 0 12px 0;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.card-tags {
  display: flex;
  gap: 6px;
}
.tag {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: #FBE9E7;
  color: #C0392B;
  font-weight: 500;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.tag.secondary {
  background: #F7F3EA;
  color: #6E6A60;
  font-weight: 400;
}
.card-icon {
  font-size: 24px;
  color: #8A8578;
}
.card-icon .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
}
.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 0.7px solid #EDE9E0;
}
.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: #F7F3EA;
  color: #6E6A60;
  font-size: 13px;
  cursor: pointer;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.btn-sm {
  padding: 4px 12px;
  font-size: 13px;
}
.btn-danger {
  background: rgba(192, 57, 43, 0.1);
  color: #C0392B;
}
</style>