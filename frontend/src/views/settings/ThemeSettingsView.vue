<script setup lang="ts">
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">主题设置</h2>
        <p class="page-desc">选择您喜欢的界面主题风格，全局即时生效</p>
        <p>页面开发中...</p>
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
  margin: 0 0 32px 0;
}
</style>
