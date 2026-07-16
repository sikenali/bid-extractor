<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="top-nav">
    <div class="nav-left">
      <div class="logo" @click="router.push('/upload')" style="cursor: pointer">
        <img src="/logo.svg" alt="文取猩" class="logo-img" />
        <span class="brand-cn">文取猩</span>
        <span class="brand-en">文档智能提取平台</span>
      </div>
    </div>
    <div class="nav-right">
      <button class="nav-expand-btn" title="帮助">
        <span class="icon ri-question-line"></span>
        <span class="btn-label">帮助</span>
      </button>
      <button class="nav-expand-btn" title="设置" @click="router.push('/settings/theme')">
        <span class="icon ri-settings-3-line"></span>
        <span class="btn-label">设置</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.top-nav {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--color-bg-main);
}
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo-img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}
.icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
}
.brand-cn {
  font-size: 22px;
  font-weight: bold;
  color: var(--color-text-primary);
}
.brand-en {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-left: 4px;
}
.nav-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nav-expand-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background-color: var(--color-bg-card);
  color: var(--color-text-secondary);
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.nav-expand-btn .icon {
  flex-shrink: 0;
  width: 36px;
  font-size: 18px;
  text-align: center;
  transition: color 0.2s;
}
.nav-expand-btn .btn-label {
  font-size: 13px;
  font-weight: 500;
  opacity: 0;
  transition: opacity 0.2s;
  padding-right: 12px;
  color: white;
}
.nav-expand-btn:hover {
  width: 90px;
  background-color: var(--color-primary);
  border-color: transparent;
}
.nav-expand-btn:hover .icon {
  color: white;
}
.nav-expand-btn:hover .btn-label {
  opacity: 1;
}
</style>