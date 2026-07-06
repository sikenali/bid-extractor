<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="top-nav">
    <div class="nav-left">
      <div class="logo">
        <div class="logo-icon">
          <span class="icon">&#xeb4d;</span>
        </div>
        <span class="brand-cn">回旋标</span>
        <span class="brand-en">Boomerang</span>
      </div>
    </div>
    <div class="nav-right">
      <button class="nav-icon-btn" title="帮助">
        <span class="icon">&#xeb75;</span>
      </button>
      <button class="nav-icon-btn" title="设置" @click="router.push('/settings/theme')">
        <span class="icon">&#xec25;</span>
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

.logo-icon {
  width: 40px;
  height: 40px;
  background-color: var(--color-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 22px;
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
  gap: 16px;
}

.nav-icon-btn {
  width: 36px;
  height: 36px;
  background-color: var(--color-bg-card);
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 18px;
}
</style>
