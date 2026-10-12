<script setup lang="ts">
import { useRouter } from 'vue-router';

const props = defineProps<{
  title?: string;
  brand?: string;
}>();

const router = useRouter();
</script>

<template>
  <header class="top-nav">
    <div class="nav-left">
      <div class="tool-mark">
        <span class="tool-dot"></span>
      </div>
      <span class="brand-cn">{{ brand || '文取猩' }}</span>
      <span class="divider"></span>
      <span class="page-title">{{ title || '' }}</span>
    </div>
    <div class="nav-right">
      <button class="nav-btn" title="返回" @click="router.back()">
        <span class="ri-arrow-left-s-line icon"></span>
      </button>
      <button class="nav-btn" title="设置" @click="router.push('/settings/theme')">
        <span class="ri-settings-3-line icon"></span>
      </button>
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
  background-color: #FFFFFF;
  border-bottom: 0.7px solid #EDE9E0;
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
  background-color: #FBE9E7;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tool-dot {
  width: 9px;
  height: 8px;
  border-radius: 50%;
  background-color: #C0392B;
}
.brand-cn {
  font-size: 20px;
  font-weight: 700;
  color: #1F1D1A;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  line-height: 1.2;
}
.divider {
  width: 2px;
  height: 20px;
  background-color: #E5DFD3;
}
.page-title {
  font-size: 16px;
  color: #6E6A60;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
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
  border: 0.7px solid #E5DFD3;
  background-color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.nav-btn:hover {
  background-color: #F7F3EA;
}
.nav-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
  color: #3A3A3A;
}
</style>