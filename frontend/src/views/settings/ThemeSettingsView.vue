<script setup lang="ts">
import { useThemeStore } from '@/stores/theme';
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

const themeStore = useThemeStore();

const themes = [
  { type: 'parchment' as const, name: '羊皮纸', desc: '温润雅致 · 默认主题', previewBg: '#FBF7F0', navBg: '#F5EFE3', sidebarBg: '#F5EFE3', cardBg: '#F0E8D8', cardSmallBg: '#F5EFE3' },
  { type: 'dark' as const, name: '墨夜', desc: '深邃护眼 · 暗色模式', previewBg: '#1A1A2E', navBg: '#16213E', sidebarBg: '#16213E', cardBg: '#2A2A4A', cardSmallBg: '#222240' },
  { type: 'white' as const, name: '白纸', desc: '简洁清爽 · 极简风格', previewBg: '#FFFFFF', navBg: '#FAFAFA', sidebarBg: '#FAFAFA', cardBg: '#F5F5F5', cardSmallBg: '#FAFAFA' }
];

function selectTheme(themeType: string) {
  themeStore.setTheme(themeType as 'parchment' | 'dark' | 'white');
}
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">主题设置</h2>
        <p class="page-desc">选择您喜欢的界面主题风格，全局即时生效</p>

        <div class="theme-cards">
          <div
            v-for="theme in themes"
            :key="theme.type"
            class="theme-card"
            :class="{ selected: themeStore.currentTheme === theme.type }"
            @click="selectTheme(theme.type)"
          >
            <div class="theme-preview" :style="{ backgroundColor: theme.previewBg }">
              <div class="preview-nav" :style="{ backgroundColor: theme.navBg }">
                <div class="preview-logo"></div>
                <span class="preview-brand">回旋标</span>
              </div>
              <div class="preview-body">
                <div class="preview-sidebar" :style="{ backgroundColor: theme.sidebarBg }"></div>
                <div class="preview-main">
                  <div class="preview-card" :style="{ backgroundColor: theme.cardBg }"></div>
                  <div class="preview-card-small" :style="{ backgroundColor: theme.cardSmallBg }"></div>
                </div>
              </div>
            </div>
            <div class="theme-info">
              <div class="theme-details">
                <h4 class="theme-name">{{ theme.name }}</h4>
                <p class="theme-desc">{{ theme.desc }}</p>
              </div>
              <div v-if="themeStore.currentTheme === theme.type" class="selected-badge">
                <span class="ri-checkbox-fill">&#xeb3b;</span>
              </div>
            </div>
          </div>
        </div>
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

.theme-cards {
  display: flex;
  gap: 24px;
  height: 272px;
}

.theme-card {
  width: 386px;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
  background-color: white;
}

.theme-card.selected {
  border-color: var(--color-primary);
  box-shadow: 0 4px 20px rgba(196, 61, 61, 0.15);
}

.theme-card:hover:not(.selected) {
  border-color: var(--color-border);
}

.theme-preview {
  height: 200px;
  display: flex;
  flex-direction: column;
}

.preview-nav {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
}

.preview-logo {
  width: 21px;
  height: 20px;
  background-color: var(--color-primary);
  border-radius: 50%;
}

.preview-brand {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.preview-body {
  flex: 1;
  display: flex;
  padding: 12px;
}

.preview-sidebar {
  width: 51px;
  border-radius: 4px;
}

.preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.preview-card {
  height: 60px;
  border-radius: 8px;
}

.preview-card-small {
  height: 40px;
  border-radius: 8px;
}

.theme-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background-color: white;
}

.theme-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-primary);
  margin: 0;
}

.theme-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.selected-badge {
  width: 24px;
  height: 24px;
  background-color: var(--color-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
}

.selected-badge .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
}
</style>
