<script setup lang="ts">
import { useRouter } from 'vue-router';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

const router = useRouter();
</script>

<template>
  <div class="settings-layout">
    <SettingsSidebar />
    <div class="settings-main">
      <div class="settings-topbar">
        <div class="topbar-crumbs">
          <span class="crumb">首页</span>
          <span class="sep">/</span>
          <span class="crumb current">设置中心</span>
        </div>
        <div class="topbar-actions">
          <button class="action-btn" title="返回" @click="router.back()">
            <span class="ri-arrow-left-s-line icon"></span>
          </button>
          <button class="action-btn" title="设置" @click="router.push('/settings/theme')">
            <span class="ri-settings-3-line icon"></span>
          </button>
        </div>
      </div>
      <div class="settings-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-layout {
  display: flex;
  min-height: 100vh;
  background-color: var(--color-bg-secondary, #F7F3EA);
}
.settings-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.settings-topbar {
  display: none; /* 暂隐藏，后续 UI 有变化再恢复 */
}
.topbar-crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
}
.crumb {
  font-size: 15px;
  color: var(--color-text-faint, #A7A296);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.crumb.current {
  color: var(--color-text-secondary, #6E6A60);
}
.topbar-crumbs .sep {
  font-size: 15px;
  color: var(--color-text-faint, #A7A296);
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 46px;
  padding: 0 4px;
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 14px;
  background-color: var(--color-bg-white, #FFFFFF);
}
.action-btn {
  width: 44px;
  height: 38px;
  border: none;
  border-radius: 10px;
  background-color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s;
}
.action-btn:hover {
  background-color: var(--color-bg-secondary, #F7F3EA);
}
.action-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
  color: var(--color-text-body, #3A3A3A);
}
.settings-content {
  flex: 1;
  padding: 20px 20px 40px;
  min-width: 0;
}
</style>