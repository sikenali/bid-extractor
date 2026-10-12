<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useThemeStore } from '@/stores/theme';
import { useRouter } from 'vue-router';
import { setTheme as saveTheme } from '@/api/settings';

const themeStore = useThemeStore();
const router = useRouter();

interface ThemeOption {
  type: string;
  name: string;
  desc: string;
}

const themes: ThemeOption[] = [
  { type: 'parchment', name: '浅色主题 · 羊皮纸', desc: '当前默认，长时间阅读标书不易疲劳' },
  { type: 'dark', name: '深色主题 · 墨夜', desc: '夜间或暗光环境投标作业更护眼' },
];

interface AccentOption {
  key: string;
  name: string;
  color: string;
  varName: string;
}

const accents: AccentOption[] = [
  { key: 'vermilion', name: '朱红 · 默认', color: '#BE3B2E', varName: '--color-primary' },
  { key: 'gold', name: '鎏金', color: '#D3A93F', varName: '--color-accent-gold' },
  { key: 'jade', name: '玉绿', color: '#3E8C6E', varName: '--color-accent-jade' },
  { key: 'cloud', name: '云蓝', color: '#4A72A8', varName: '--color-accent-cloud' },
  { key: 'ink', name: '黛墨', color: '#2F3640', varName: '--color-accent-ink' },
];

interface LayoutOption {
  key: string;
  name: string;
  desc: string;
  route: string;
}

const layouts: LayoutOption[] = [
  { key: 'topbar', name: '顶栏模式 · 居中导航', desc: '六大模块在顶栏居中排布，右上角统一为返回与设置', route: '/topbar' },
  { key: 'sidebar', name: '侧边栏模式 · 左侧导航', desc: '六大模块在左侧竖列居中，顶栏不显示图标文字', route: '/sidebar' },
];

const selectedTheme = ref('parchment');
const selectedAccent = ref('vermilion');
const selectedLayout = ref('sidebar');

onMounted(() => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme && themes.some(t => t.type === savedTheme)) {
    selectedTheme.value = savedTheme;
  }
  selectedAccent.value = localStorage.getItem('accent') || 'vermilion';
  selectedLayout.value = localStorage.getItem('layout') || 'sidebar';
});

async function selectTheme(type: string) {
  selectedTheme.value = type;
  try {
    await saveTheme(type);
  } catch {}
}

async function selectAccent(key: string) {
  selectedAccent.value = key;
  const color = accents.find(a => a.key === key)?.color || '#BE3B2E';
  localStorage.setItem('accent', key);
  localStorage.setItem('accent-color', color);
  applyAccent(color);
}

async function selectLayout(key: string) {
  selectedLayout.value = key;
  const layout = layouts.find(l => l.key === key);
  if (layout) {
    localStorage.setItem('layout', key);
    router.push(`/${layout.route}`);
  }
}

function applyAccent(color: string) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', color);
}

function resetAll() {
  selectedTheme.value = 'parchment';
  selectedAccent.value = 'vermilion';
  selectedLayout.value = 'sidebar';
  themeStore.setTheme('parchment');
  saveTheme('parchment').catch(() => {});
  localStorage.setItem('accent', 'vermilion');
  localStorage.setItem('accent-color', '#BE3B2E');
  localStorage.setItem('layout', 'sidebar');
  applyAccent('#BE3B2E');
  router.push('/sidebar');
  ElMessage.success('已恢复默认');
}
</script>

<template>
  <div class="theme-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span>/</span>
            <span>设置中心</span>
            <span>/</span>
            <span class="active">主题管理</span>
          </div>
          <div class="header-title">
            <h1>主题管理</h1>
            <p>统一切换外观底色、强调色与导航布局模式，修改即时生效</p>
          </div>
        </div>
        <button class="reset-button" @click="resetAll">
          <span class="icon ri-restart-line"></span>
          恢复默认
        </button>
      </div>
    </div>

    <!-- 外观主题卡片 -->
    <div class="section-card">
      <div class="card-title">外观主题</div>
      <div class="theme-group">
        <div
          v-for="theme in themes"
          :key="theme.type"
          class="theme-preview-card"
          :class="{ active: selectedTheme === theme.type }"
          @click="selectTheme(theme.type)"
        >
          <div class="preview-thumb">
            <div class="thumb-skin" :style="{ backgroundColor: theme.type === 'parchment' ? '#F7EED4' : '#333A45' }">
              <div class="thumb-bar-top"></div>
              <div class="thumb-bar-content"></div>
            </div>
          </div>
          <div class="preview-info">
            <div class="preview-name">{{ theme.name }}</div>
            <div class="preview-desc">{{ theme.desc }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 强调色卡片 -->
    <div class="section-card">
      <div class="card-title">强调色</div>
      <div class="accent-group">
        <div
          v-for="accent in accents"
          :key="accent.key"
          class="accent-item"
          @click="selectAccent(accent.key)"
        >
          <div class="accent-circle" :style="{ backgroundColor: accent.color }">
            <span class="icon" :class="selectedAccent === accent.key ? 'ri-check-line' : 'ri-circle-line'"></span>
          </div>
          <div class="accent-name">{{ accent.name }}</div>
        </div>
      </div>
    </div>

    <!-- 布局切换卡片 -->
    <div class="section-card">
      <div class="card-title">布局切换</div>
      <div class="layout-group">
        <div
          v-for="layout in layouts"
          :key="layout.key"
          class="layout-card"
          :class="{ active: selectedLayout === layout.key }"
          @click="selectLayout(layout.key)"
        >
          <div class="layout-preview">
            <template v-if="layout.key === 'topbar'">
              <div class="preview-mockup topbar-mockup">
                <div class="mockup-header">
                  <div class="mockup-brand">
                    <span class="brand-dot"></span>
                    <span class="brand-text"></span>
                    <span class="brand-text muted"></span>
                  </div>
                  <div class="mockup-modules">
                    <span class="module-block" style="background:#BE3B2E"></span>
                    <span class="module-block" style="background:#D3A93F"></span>
                    <span class="module-block" style="background:#3E8C6E"></span>
                    <span class="module-block" style="background:#4A72A8"></span>
                    <span class="module-block" style="background:#BE3B2E"></span>
                    <span class="module-block" style="background:#D3A93F"></span>
                  </div>
                  <div class="mockup-actions">
                    <span class="action-dot"></span>
                    <span class="action-dot"></span>
                  </div>
                </div>
                <div class="mockup-body">
                  <div class="mockup-side"></div>
                  <div class="mockup-main"></div>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="preview-mockup sidebar-mockup">
                <div class="mockup-sidebar">
                  <span class="sidebar-mod" style="background:#D3A93F"></span>
                  <span class="sidebar-mod" style="background:#BE3B2E"></span>
                  <span class="sidebar-mod" style="background:#3E8C6E"></span>
                  <span class="sidebar-mod" style="background:#4A72A8"></span>
                  <span class="sidebar-mod" style="background:#2F3640"></span>
                </div>
                <div class="mockup-content">
                  <div class="mockup-header">
                    <div class="mockup-brand">
                      <span class="brand-dot"></span>
                      <span class="brand-text"></span>
                      <span class="brand-text muted"></span>
                    </div>
                    <div class="mockup-actions">
                      <span class="action-dot"></span>
                      <span class="action-dot"></span>
                    </div>
                  </div>
                  <div class="mockup-body">
                    <div class="mockup-main"></div>
                  </div>
                </div>
              </div>
            </template>
          </div>
          <div class="layout-info">
            <div class="layout-name">{{ layout.name }}</div>
            <div class="layout-desc">{{ layout.desc }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.theme-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

/* 页面头部卡片 */
.page-header-card {
  background-color: #fff;
  border: 0.7px solid #EFEC E3;
  border-radius: 16px;
  padding: 20px 24px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}

.header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.breadcrumb span {
  color: #A7A296;
}

.breadcrumb span.active {
  color: #3A3A3A;
  font-weight: 500;
}

.header-title h1 {
  font-size: 30px;
  font-weight: 700;
  color: #1F1D1A;
  margin: 4px 0 8px 0;
  letter-spacing: -0.5px;
}

.header-title p {
  font-size: 15px;
  color: #6E6A60;
  margin: 0;
}

.reset-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  height: 48px;
  border: 0.7px solid #E8E4D8;
  background-color: #fff;
  border-radius: 12px;
  font-size: 15px;
  color: #3A3A3A;
  cursor: pointer;
  transition: all 0.2s;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.reset-button:hover {
  background-color: #F7F4EA;
}

.reset-button .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
}

/* 通用卡片样式 */
.section-card {
  background-color: #fff;
  border: 0.7px solid #EFEC E3;
  border-radius: 16px;
  padding: 24px 28px;
}

.card-title {
  font-size: 17px;
  font-weight: 500;
  color: #1F1D1A;
  margin: 0;
}

/* 外观主题 */
.theme-group {
  display: flex;
  gap: 24px;
  margin-top: 20px;
}

.theme-preview-card {
  flex: 1;
  border: 0.7px solid #E4CD8E;
  background-color: #FBF5E3;
  border-radius: 14px;
  padding: 24px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 0.2s;
}

.theme-preview-card.active {
  background-color: #F6EEDA;
  border-color: #B08D3A;
}

.preview-thumb {
  width: 100%;
  height: 128px;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.thumb-skin {
  flex: 1;
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.thumb-bar-top {
  width: 100%;
  height: 28px;
  background-color: #fff;
  border-radius: 5px;
}

.thumb-bar-content {
  flex: 1;
  background-color: #E1DCD1;
  border-radius: 6px;
}

.preview-info .preview-name {
  font-size: 16px;
  font-weight: 500;
  color: #1F1D1A;
}

.preview-info .preview-desc {
  font-size: 14px;
  color: #8A8578;
}

/* 强调色 */
.accent-group {
  display: flex;
  gap: 40px;
  margin-top: 20px;
}

.accent-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.accent-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #F7F5EE;
}

.accent-circle .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 30px;
  color: #fff;
  transition: all 0.2s;
}

.accent-name {
  font-size: 15px;
  color: #1F1D1A;
  transition: all 0.2s;
}

.accent-item:hover .accent-name {
  color: #1F1D1A;
}

/* 布局切换 */
.layout-group {
  display: flex;
  gap: 24px;
  margin-top: 20px;
}

.layout-card {
  flex: 1;
  border: 0.7px solid #E4CD8E;
  background-color: #FBF5E3;
  border-radius: 14px;
  padding: 24px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.2s;
}

.layout-card.active {
  background-color: #F6EEDA;
  border-color: #B08D3A;
}

.layout-preview {
  width: 100%;
  height: 150px;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.preview-mockup {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 顶栏模式预览 */
.topbar-mockup {
  background-color: #F5F1E6;
  border-radius: 8px;
}

.mockup-header {
  height: 32px;
  background-color: #fff;
  border-radius: 6px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mockup-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-dot {
  width: 11px;
  height: 10px;
  border-radius: 50%;
  background-color: #BE3B2E;
}

.brand-text {
  width: 25px;
  height: 6px;
  border-radius: 50%;
  background-color: #2F3640;
}

.brand-text.muted {
  width: 17px;
  background-color: #A7A296;
}

.mockup-modules {
  display: flex;
  gap: 8px;
}

.module-block {
  width: 31px;
  height: 10px;
  border-radius: 50%;
}

.mockup-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

.action-dot {
  width: 9px;
  height: 8px;
  border-radius: 50%;
  background-color: #D6CDC8;
}

.mockup-body {
  flex: 1;
  margin-top: 12px;
  display: flex;
  gap: 12px;
}

.mockup-side {
  width: 85px;
  border-radius: 6px;
  background-color: #E2DDD2;
}

.mockup-main {
  flex: 1;
  border-radius: 6px;
  background-color: #E6E2D8;
}

/* 侧边栏模式预览 */
.sidebar-mockup {
  background-color: #F5F1E6;
  border-radius: 8px;
}

.mockup-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  width: 56px;
}

.sidebar-mod {
  width: 44px;
  height: 9px;
  border-radius: 50%;
}

.mockup-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.sidebar-mockup .mockup-header {
  margin-bottom: 12px;
}

.sidebar-mockup .mockup-body {
  flex: 1;
}

.sidebar-mockup .mockup-main {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  background-color: #E6E2D8;
}

/* 布局信息 */
.layout-info .layout-name {
  font-size: 16px;
  font-weight: 500;
  color: #1F1D1A;
}

.layout-info .layout-desc {
  font-size: 14px;
  color: #8A8578;
  margin: 4px 0 0 0;
}

</style>
