<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const menuItems = [
  { path: '/settings/theme', label: '主题设置', icon: 'ri-palette-line', color: '#2D8B57' },
  { path: '/settings/skill', label: '技能管理', icon: 'ri-git-branch-line', color: '#8B5CF6' },
  { path: '/settings/rules', label: '规则设置', icon: 'ri-list-settings-line', color: '#C23B22' },
  { path: '/settings/export', label: '导出设置', icon: 'ri-download-2-line', color: '#2D6A9F' },
  { path: '/settings/apikey', label: 'API Key', icon: 'ri-key-2-line', color: '#6366F1' }
];

const activeTab = computed(() => route.path);
const indicatorStyle = ref({ top: '0px', height: '0px', backgroundColor: '#C23B22' });
const isInitialized = ref(false);
const navRef = ref<HTMLElement | null>(null);

function positionIndicator() {
  const container = navRef.value;
  if (!container) return;
  const items = container.querySelectorAll('.sidebar-item');
  let targetItem: HTMLElement | null = null;
  for (const item of items) {
    if ((item as HTMLElement).dataset.tabKey === activeTab.value) {
      targetItem = item as HTMLElement;
      break;
    }
  }
  if (!targetItem) return;
  const containerRect = container.getBoundingClientRect();
  const itemRect = targetItem.getBoundingClientRect();
  indicatorStyle.value = {
    top: `${itemRect.top - containerRect.top}px`,
    height: `${itemRect.height}px`,
    backgroundColor: menuItems.find(t => t.path === activeTab.value)?.color || '#C23B22'
  };
}

async function selectTab(path: string) {
  await router.push(path);
  nextTick(positionIndicator);
}

onMounted(() => {
  nextTick(() => {
    positionIndicator();
    setTimeout(() => { isInitialized.value = true }, 150);
  });
});

watch(() => route.path, () => {
  nextTick(positionIndicator);
});
</script>

<template>
  <div class="settings-sidebar">
    <div class="sidebar-title">系统设置</div>
    <div ref="navRef" class="sidebar-items">
      <div
        class="sidebar-indicator"
        :class="{ animated: isInitialized }"
        :style="indicatorStyle"
      ></div>
      <div
        v-for="item in menuItems"
        :key="item.path"
        :data-tab-key="item.path"
        class="sidebar-item"
        :class="{ active: activeTab === item.path }"
        @click="selectTab(item.path)"
      >
        <span class="icon" :class="item.icon"></span>
        <span class="label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-sidebar {
  width: 220px;
  min-height: calc(100vh - 64px);
  background-color: var(--color-bg-secondary);
  padding: 24px 12px;
}
.sidebar-title {
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: 500;
  padding: 0 12px;
  margin-bottom: 8px;
}
.sidebar-items {
  position: relative;
}
.sidebar-indicator {
  position: absolute;
  left: 0;
  right: 0;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  z-index: 0;
  pointer-events: none;
}
.sidebar-indicator.animated {
  transition: top 0.3s ease-out, height 0.3s ease-out, background-color 0.3s ease-out;
}
.sidebar-item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: color 0.2s;
  margin-bottom: 4px;
}
.sidebar-item:hover {
  background-color: rgba(0,0,0,0.03);
}
.sidebar-item .icon {
  font-size: 18px;
  font-family: "remixicon", sans-serif;
  font-style: normal;
  color: var(--color-text-secondary);
  transition: color 0.2s;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}
.sidebar-item.active .icon {
  color: white;
}
.sidebar-item .label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: color 0.2s;
}
.sidebar-item.active .label {
  color: white;
  font-weight: 600;
}
</style>