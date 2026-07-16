<script setup lang="ts">
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <router-view />
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
</style>