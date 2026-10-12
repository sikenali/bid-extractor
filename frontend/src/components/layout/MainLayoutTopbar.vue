<template>
  <div class="layout-topbar">
    <TopNav title="标题" />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import TopNav from '@/components/layout/TopNav.vue';
</script>

<style scoped>
.layout-topbar {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}
</style>
