<script setup lang="ts">
import { onMounted } from 'vue';
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();

// 同步应用本地主题，避免深色模式首屏闪白（FOUC）
themeStore.applySavedTheme();

onMounted(() => {
  themeStore.loadTheme();
});
</script>

<template>
  <router-view />
</template>
