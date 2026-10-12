<template>
  <div class="app-layout">
    <TopNav 
      :show-settings="isSettings"
      @settings-click="$router.push('/settings/theme')"
    />
    
    <div class="main-wrapper">
      <div class="content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import TopNav from './TopNav.vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const isSettings = computed(() => route.path.startsWith('/settings'));
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-main);
}

.main-wrapper {
  flex: 1;
  display: flex;
}

.content {
  flex: 1;
  padding: 20px;
  max-width: 100%;
}
</style>
