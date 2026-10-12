<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

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
  { path: '/settings/about', label: '关于回旋镖', icon: 'ri-information-line' },
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
          <path d="M 6 24 C 10 13.5 18 6.5 25 5.5 C 24.5 14 17.5 22 7.5 25.5 Z" transform="translate(-15.5, -15.5)" fill="#2B2B2B"/>
          <circle cx="2.5" cy="-2.7" r="2.5" fill="#BE3B2E"/>
        </svg>
      </div>
      <span class="brand-name">回旋镖 · 设置</span>
    </div>

    <div class="divider"></div>

    <div class="group-title">偏好与资源</div>

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

    <div class="back-area" @click="backToWorkspace">
      <span class="icon ri-arrow-left-s-line"></span>
      <span>返回工作台</span>
    </div>
  </aside>
</template>

<style scoped>
.settings-sidebar {
  width: 310px;
  flex-shrink: 0;
  min-height: 100vh;
  background-color: #FFFFFF;
  display: flex;
  flex-direction: column;
}
.brand-area {
  padding: 0 32px;
  height: 92px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
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
  color: #221C14;
}
.divider {
  height: 1px;
  background-color: #EDEAF2;
}
.group-title {
  padding: 28px 32px 12px;
  font-size: 12px;
  color: #A7A296;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.nav-list {
  padding: 0 16px;
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
  background-color: #F7F5EF;
}
.nav-item .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
  color: #3A3A3A;
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-item .label {
  font-size: 16px;
  color: #3A3A3A;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.nav-item.active {
  background-color: #F6EEDA;
}
.nav-item.active .icon,
.nav-item.active .label {
  color: #B08D3A;
  font-weight: 500;
}
.nav-spacer {
  flex: 1;
}
.back-area {
  padding: 16px 32px 32px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.back-area:hover {
  opacity: 0.7;
}
.back-area .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
  color: #221C14;
}
.back-area span:last-child {
  font-size: 15px;
  color: #221C14;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
</style>