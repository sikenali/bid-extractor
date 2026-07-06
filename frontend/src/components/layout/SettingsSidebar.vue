<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const menuItems = [
  { path: '/settings/theme', label: '主题设置', icon: '\xeb75' },
  { path: '/settings/template', label: '模板设置', icon: '\xee55' },
  { path: '/settings/rules', label: '规则设置', icon: '\xee27' },
  { path: '/settings/export', label: '导出设置', icon: '\xec54' },
  { path: '/settings/apikey', label: 'API Key', icon: '\xeaaf' }
];

function isActive(p: string) {
  return route.path === p;
}

function navigate(p: string) {
  router.push(p);
}
</script>

<template>
  <div class="settings-sidebar">
    <div class="sidebar-title">系统设置</div>
    <div
      v-for="item in menuItems"
      :key="item.path"
      class="sidebar-item"
      :class="{ active: isActive(item.path) }"
      @click="navigate(item.path)"
    >
      <span class="icon">{{ item.icon }}</span>
      <span>{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.settings-sidebar {
  width: 220px;
  min-height: calc(100vh - 64px);
  background-color: var(--color-bg-secondary);
  padding: 24px 12px;
}

.sidebar-title {
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: 500;
  padding: 0 12px;
  margin-bottom: 8px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.sidebar-item:hover {
  background-color: rgba(196, 61, 61, 0.1);
}

.sidebar-item.active {
  background-color: var(--color-primary);
  color: white;
  font-weight: 600;
}

.sidebar-item .icon {
  font-size: 18px;
  font-family: "remixicon", sans-serif;
  font-style: normal;
}
</style>
