<template>
  <div class="layout-sidebar">
    <div class="sidebar-main">
      <SettingsSidebar />
      <div class="main-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';
</script>

<style scoped>
.layout-sidebar {
  display: flex;
  min-height: 100vh;
  flex-direction: row;
  background-color: var(--color-bg-main);
}

.sidebar-main {
  display: flex;
  flex: 1;
}

.main-content {
  flex: 1;
  padding: 20px;
  background-color: var(--color-bg-main);
}
</style>
