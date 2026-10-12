<template>
  <footer class="page-footer">
    <div class="footer-left" @click="$emit('credit-query')">
      <span class="footer-mark ri-shield-check-line"></span>
    </div>
    <span class="footer-copy">© {{ year }} 回旋镖 Powered by <a href="https://lazycat.cloud" target="_blank" rel="noopener noreferrer" class="footer-link">LightOS</a></span>
    <span class="footer-right ri-links-line" @click="$emit('bidding-sites')"></span>
  </footer>
</template>

<script setup>
import { ref, onMounted } from 'vue';
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
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.footer-left:hover {
  border-color: rgba(196, 58, 49, 0.4);
  color: rgba(196, 58, 49, 1);
}
.footer-mark {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 14px;
  color: #A7A296;
}
.footer-copy {
  font-size: 14px;
  color: #A7A296;
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
  font-size: 18px;
  color: #A7A296;
  cursor: pointer;
  transition: color 0.2s;
}
.footer-right:hover {
  color: rgba(196, 58, 49, 1);
}
</style>
