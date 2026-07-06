<script setup lang="ts">
import { ref } from 'vue';
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

const activeTab = ref('bidding');

const tabs = [
  { key: 'bidding', label: '招标模板' },
  { key: 'proposal', label: '投标模板' },
  { key: 'custom', label: '自定义模板' }
];

const templates = [
  {
    category: 'government',
    name: '政府采购货物类',
    desc: '适用于货物类采购项目',
    gradient: 'linear-gradient(180deg, #F5EFE3 0%, #FBF7F0 100%)',
    color: '#C43D3D'
  },
  {
    category: 'engineering',
    name: '工程施工类',
    desc: '适用于工程施工招标',
    gradient: 'linear-gradient(180deg, #E8F0F8 0%, #F5F8FB 100%)',
    color: '#2D6A9F'
  },
  {
    category: 'it_service',
    name: '信息化服务类',
    desc: '适用于IT服务采购',
    gradient: 'linear-gradient(180deg, #F0F8F0 0%, #F5FAF5 100%)',
    color: '#2D8A4E'
  },
  {
    category: 'consulting',
    name: '咨询服务类',
    desc: '适用于咨询类采购',
    gradient: 'linear-gradient(180deg, #FFF8F0 0%, #FFFCF8 100%)',
    color: '#D4A017'
  }
];
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">模板设置</h2>
        <p class="page-desc">管理招标模板、投标模板及自定义模板</p>

        <div class="tab-bar">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-item"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </div>
        </div>

        <div class="template-grid">
          <div
            v-for="tpl in templates"
            :key="tpl.category"
            class="template-card"
          >
            <div class="template-cover" :style="{ background: tpl.gradient }">
              <span class="cover-icon" :style="{ color: tpl.color }">&#xee4f;</span>
              <h4 class="cover-title">{{ tpl.name }}</h4>
              <p class="cover-subtitle">标准模板</p>
            </div>
            <div class="template-meta">
              <p class="template-name">{{ tpl.name }}</p>
              <p class="template-desc">{{ tpl.desc }}</p>
            </div>
          </div>

          <div class="template-card add-template">
            <div class="add-icon-wrapper">
              <span class="icon">&#xeb13;</span>
            </div>
            <p class="add-label">添加模板</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}

.settings-body {
  display: flex;
  min-height: calc(100vh - 64px);
}

.settings-content {
  flex: 1;
  padding: 32px;
}

.page-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.page-desc {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0 0 24px 0;
}

.tab-bar {
  display: inline-flex;
  background-color: var(--color-bg-card);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 24px;
}

.tab-item {
  padding: 8px 24px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--color-text-secondary);
}

.tab-item.active {
  background-color: var(--color-primary);
  color: white;
  font-weight: 600;
}

.template-grid {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.template-card {
  width: 200px;
  border: 0.7px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  background-color: white;
}

.template-cover {
  height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.cover-icon {
  font-size: 40px;
  font-family: "remixicon", sans-serif;
  font-style: normal;
}

.cover-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.cover-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.template-meta {
  padding: 12px 16px;
}

.template-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.template-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  margin: 0;
}

.add-template {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-card);
  border: 2px dashed var(--color-border);
  cursor: pointer;
}

.add-icon-wrapper {
  width: 48px;
  height: 48px;
  background-color: var(--color-bg-card);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-icon-wrapper .icon {
  font-size: 22px;
  color: var(--color-text-secondary);
  font-family: "remixicon", sans-serif;
  font-style: normal;
}

.add-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-top: 12px;
  font-weight: 500;
}
</style>
