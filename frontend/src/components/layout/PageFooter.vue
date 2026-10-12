<template>
  <footer class="page-footer">
    <div class="footer-left" @click="$emit('credit-query')">
      <span class="footer-mark ri-shield-check-line"></span>
    </div>
    <span class="footer-copy">© {{ year }} {{ BRAND_NAME }} Powered by <a href="https://lazycat.cloud" target="_blank" rel="noopener noreferrer" class="footer-link">LightOS</a></span>
    <span class="footer-right ri-links-line" @click="$emit('bidding-sites')"></span>
  </footer>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { BRAND_NAME } from '@/constants/brand';
defineEmits(['credit-query', 'bidding-sites'])

const year = ref(new Date().getFullYear())
onMounted(() => { year.value = new Date().getFullYear() })
</script>

<style scoped>
.page-footer {
  height: 58px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--color-bg-white);
  border-top: 1px solid var(--color-border-soft);
}
.footer-left {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.2s;
  color: var(--color-text-secondary, #6E6A60);
}
.footer-left:hover {
  color: var(--color-primary, #C0392B);
}
.footer-mark {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 22px;
  color: inherit;
}
.footer-copy {
  font-size: 15px;
  color: var(--color-text-body, #3A3A3A);
}
.footer-link {
  color: var(--color-primary);
  text-decoration: none;
  transition: opacity 0.2s;
}
.footer-link:hover {
  opacity: 0.75;
  text-decoration: underline;
}
.footer-right {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 22px;
  color: var(--color-text-secondary, #6E6A60);
  cursor: pointer;
  transition: color 0.2s;
}
.footer-right:hover {
  color: var(--color-primary, #C0392B);
}
</style>
