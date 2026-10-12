<template>
  <footer class="page-footer">
    <div class="footer-left">
      <span class="footer-mark ri-reactjs-line"></span>
    </div>
    <span class="footer-copy">© 2026 回旋镖 Powered by LightOS</span>
    <span class="footer-right ri-links-line"></span>
  </footer>
</template>

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
.footer-right {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
  color: #A7A296;
}
</style>
