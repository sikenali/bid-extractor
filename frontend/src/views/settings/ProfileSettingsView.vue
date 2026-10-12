<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { UiSwitch, UiSelectCard } from '@/components/ui';

interface ProfileOption {
  key: string;
  name: string;
  desc: string;
}

const profiles: ProfileOption[] = [
  { key: 'compact', name: '紧凑模式', desc: '表格行高降低，一屏展示更多字段' },
  { key: 'comfort', name: '舒适模式', desc: '默认行间距，阅读更轻松' },
];

const selectedProfile = ref('comfort');
const autoRefresh = ref(true);

const themeStore = useThemeStore();

onMounted(() => {
  selectedProfile.value = localStorage.getItem('profile') || 'comfort';
  autoRefresh.value = localStorage.getItem('auto-refresh') !== '0';
});

function selectProfile(key: string) {
  selectedProfile.value = key;
  localStorage.setItem('profile', key);
}

function toggleAutoRefresh() {
  localStorage.setItem('auto-refresh', autoRefresh.value ? '1' : '0');
}

function resetAll() {
  selectedProfile.value = 'comfort';
  autoRefresh.value = true;
  localStorage.setItem('profile', 'comfort');
  localStorage.setItem('auto-refresh', '1');
  themeStore.setTheme('parchment');
}
</script>

<template>
  <div class="profile-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span class="sep">/</span>
            <span>设置中心</span>
            <span class="sep">/</span>
            <span class="current">个性设置</span>
          </div>
          <div class="header-title">
            <h1>个性设置</h1>
            <p>调整界面密度与自动刷新等个人使用偏好</p>
          </div>
        </div>
        <button class="reset-button" @click="resetAll">
          <span class="icon ri-restart-line"></span>
          恢复默认
        </button>
      </div>
    </div>

    <!-- 界面密度 -->
    <div class="section-card">
      <div class="card-title">界面密度</div>
      <div class="density-group">
        <UiSelectCard
          v-for="p in profiles"
          :key="p.key"
          :selected="selectedProfile === p.key"
          :title="p.name"
          :desc="p.desc"
          @select="selectProfile(p.key)"
        />
      </div>
    </div>

    <!-- 自动刷新 -->
    <div class="section-card">
      <div class="card-title">行为偏好</div>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-name">解析完成后自动跳转结果页</div>
          <div class="setting-desc">上传并解析完成后，自动进入字段明细页面</div>
        </div>
        <UiSwitch v-model="autoRefresh" @change="toggleAutoRefresh" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1620px;
}

.page-header-card {
  background-color: var(--color-bg-white, #FFFFFF);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
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
  color: var(--color-text-faint, #A7A296);
}
.breadcrumb span.sep {
  color: var(--color-text-faint, #A7A296);
}
.breadcrumb span.current {
  color: var(--color-text-body, #3A3A3A);
  font-weight: 500;
}
.header-title h1 {
  font-size: 30px;
  font-weight: 700;
  color: var(--color-text-primary, #1F1D1A);
  margin: 12px 0 0 0;
  letter-spacing: -0.5px;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  line-height: 1.2;
}
.header-title p {
  font-size: 15px;
  color: var(--color-text-secondary, #6E6A60);
  margin: 8px 0 0 0;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.reset-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  height: 48px;
  border: 0.7px solid var(--color-border, #E5DFD3);
  background-color: var(--color-bg-white, #FFFFFF);
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text-body, #3A3A3A);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.reset-button:hover {
  background-color: var(--color-bg-secondary, #F7F3EA);
}
.reset-button .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
}

.section-card {
  background-color: var(--color-bg-white, #FFFFFF);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 16px;
  padding: 24px 40px;
}
.card-title {
  font-size: 17px;
  font-weight: 500;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.density-group {
  display: flex;
  gap: 24px;
  margin-top: 20px;
}
.density-group > * { flex: 1; min-width: 0; display: flex; }
.density-group > * > * { flex: 1; }
.setting-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 76px;
  gap: 20px;
}
.setting-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.setting-name {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.setting-desc {
  font-size: 15px;
  color: var(--color-text-muted, #8A8578);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
</style>