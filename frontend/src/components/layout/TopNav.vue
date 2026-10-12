<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';

const props = defineProps<{
  title?: string;
  showSettings?: boolean;
}>();

const emit = defineEmits<{
  settingsClick: [];
}>();

const router = useRouter();
const themeStore = useThemeStore();

function toggleTheme() {
  const order = themeStore.currentTheme === 'dark' ? 'parchment' : 'dark';
  themeStore.setTheme(order as any);
}
</script>

<template>
  <header class="top-nav">
    <div class="nav-left">
      <div class="tool-mark">
        <span class="tool-dot"></span>
      </div>
      <span class="brand-cn">回旋镖</span>
      <span class="divider"></span>
      <span class="page-title">{{ title || '' }}</span>
    </div>
    <div class="nav-right">
      <button class="nav-btn" title="返回" @click="router.back()" v-if="showSettings">
        <span class="ri-arrow-left-s-line icon"></span>
      </button>
      <button class="nav-btn" title="设置" @click="emit('settingsClick')" v-if="showSettings">
        <span class="ri-settings-3-line icon"></span>
      </button>
      <template v-else>
        <button class="nav-btn" title="返回" @click="router.back()">
          <span class="ri-arrow-left-s-line icon"></span>
        </button>
        <button class="nav-btn" title="切换主题" @click="toggleTheme">
          <span class="ri-sun-line icon" v-if="themeStore.currentTheme === 'dark'"></span>
          <span class="ri-moon-line icon" v-else></span>
        </button>
      </template>
    </div>
  </header>
</template>

<style scoped>
.top-nav {
  height: 72px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--color-bg-white);
  border-bottom: 1px solid var(--color-border-soft);
}
.nav-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tool-mark {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--color-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tool-dot {
  width: 9px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-primary);
}
.brand-cn {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}
.divider {
  width: 2px;
  height: 20px;
  background-color: var(--color-border);
}
.page-title {
  font-size: 16px;
  color: var(--color-text-secondary);
  line-height: 1.2;
}
.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.nav-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-white);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.nav-btn:hover {
  background-color: var(--color-bg-secondary);
}
.nav-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
  color: #3A3A3A;
}
</style>
