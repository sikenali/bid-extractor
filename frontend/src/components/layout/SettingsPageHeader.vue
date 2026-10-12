<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
  crumbs?: string[];
}>();

const emit = defineEmits<{
  reset: []
}>();
</script>

<template>
  <div class="page-header-card">
    <div class="header-layout">
      <div class="header-info">
        <div v-if="crumbs && crumbs.length" class="header-crumbs">
          <template v-for="(c, i) in crumbs" :key="i">
            <span v-if="i > 0" class="crumb-sep">/</span>
            <span class="crumb" :class="{ current: i === crumbs.length - 1 }">{{ c }}</span>
          </template>
        </div>
        <div class="header-title">{{ title }}</div>
        <div v-if="subtitle" class="header-subtitle">{{ subtitle }}</div>
      </div>
      <button class="reset-btn" @click="emit('reset')">
        <span class="icon ri-restart-line"></span>
        <span>恢复默认</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.page-header-card {
  width: 100%;
  background-color: var(--color-bg-white);
  border: 1px solid var(--color-border-soft);
  border-radius: 16px;
  padding: 20px 24px;
}
.header-layout {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.header-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.header-crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
}
.crumb {
  font-size: 14px;
  color: var(--color-text-muted);
}
.crumb.current {
  color: #3A3A3A;
  font-weight: 500;
}
.crumb-sep {
  font-size: 14px;
  color: #C9C3B6;
}
.header-title {
  font-size: 30px;
  font-weight: 700;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  color: var(--color-text-primary);
  line-height: 1.2;
  padding-top: 8px;
}
.header-subtitle {
  font-size: 15px;
  color: var(--color-text-secondary);
  padding-top: 4px;
}
.reset-btn {
  height: 48px;
  padding: 0 20px;
  border: 1px solid #E8E4D8;
  border-radius: 12px;
  background-color: var(--color-bg-white);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: #3A3A3A;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.reset-btn:hover {
  background-color: var(--color-bg-secondary);
}
.reset-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
}
</style>
