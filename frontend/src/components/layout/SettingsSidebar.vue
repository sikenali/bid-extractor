<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BRAND_NAME } from '@/constants/brand';

const route = useRoute();
const router = useRouter();

const menuItems = [
  { path: '/settings/theme', label: '主题管理', icon: 'ri-palette-line' },
  { path: '/settings/template', label: '模板管理', icon: 'ri-file-list-2-line' },
  { path: '/settings/skill', label: '技能管理', icon: 'ri-git-branch-line' },
  { path: '/settings/rules', label: '规则管理', icon: 'ri-list-settings-line' },
  { path: '/settings/model', label: '模型管理', icon: 'ri-cpu-line' },
  { path: '/settings/export', label: '导出管理', icon: 'ri-download-2-line' },
  { path: '/settings/profile', label: '个性设置', icon: 'ri-vip-crown-line' },
  { path: '/settings/about', label: '关于', icon: 'ri-information-line' },
];

const activeTab = computed(() => route.path);

function selectTab(path: string) {
  router.push(path);
}

function backToWorkspace() {
  router.push('/upload');
}
</script>

<template>
  <aside class="settings-sidebar">
    <div class="brand-area" @click="router.push('/settings/theme')">
      <div class="brand-mark">
        <svg width="24" height="24" viewBox="-9.5 -10 19 20" xmlns="http://www.w3.org/2000/svg">
          <path d="M 6 24 C 10 13.5 18 6.5 25 5.5 C 24.5 14 17.5 22 7.5 25.5 Z" transform="translate(-15.5, -15.5)" fill="var(--color-text-primary, #2B2B2B)"/>
          <circle cx="2.5" cy="-2.7" r="2.5" fill="var(--color-primary, #BE3B2E)"/>
        </svg>
      </div>
      <span class="brand-name">{{ BRAND_NAME }} · 设置</span>
    </div>

    <div class="divider"></div>

    <nav class="nav-list">
      <div
        v-for="item in menuItems"
        :key="item.path"
        class="nav-item"
        :class="{ active: activeTab === item.path }"
        @click="selectTab(item.path)"
      >
        <span class="icon" :class="item.icon"></span>
        <span class="label">{{ item.label }}</span>
      </div>
    </nav>

    <div class="nav-spacer"></div>

    <div class="back-wrap">
      <button class="back-btn" @click="backToWorkspace" title="返回上传">
        <span class="icon ri-arrow-left-s-line"></span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.settings-sidebar {
  width: 310px;
  flex-shrink: 0;
  margin: 20px 0 20px 20px;
  max-height: calc(100vh - 40px);
  position: sticky;
  top: 20px;
  background-color: var(--color-bg-white, #FFFFFF);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.brand-area {
  display: none; /* 暂隐藏，后续 UI 有变化再恢复 */
}
.brand-mark {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-name {
  font-size: 19px;
  font-weight: 700;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  color: var(--color-text-primary, #1F1D1A);
}
.divider {
  height: 1px;
  background-color: var(--color-primary-soft, #FBE9E7);
}
.nav-list {
  padding: 16px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-item {
  height: 52px;
  padding: 0 28px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.nav-item:hover {
  background-color: var(--color-bg-secondary, #F7F3EA);
}
.nav-item .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
  color: var(--color-text-body, #3A3A3A);
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-item .label {
  font-size: 16px;
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.nav-item.active {
  background-color: #F6EEDA;
}
.nav-item.active .icon,
.nav-item.active .label {
  color: var(--color-primary, #C0392B);
  font-weight: 500;
}
.nav-spacer {
  flex: 1;
}
.back-wrap {
  padding: 0 16px 20px;
  display: flex;
  align-items: center;
}
.back-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 0.7px solid var(--color-border, #E5DFD3);
  background-color: var(--color-bg-white, #FFFFFF);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.back-btn:hover {
  background-color: var(--color-bg-secondary, #F7F3EA);
}
.back-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
  color: var(--color-text-body, #3A3A3A);
}
</style>