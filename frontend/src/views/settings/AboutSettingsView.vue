<script setup lang="ts">
const repoUrl = 'https://github.com/boomerang-bid';
</script>

<template>
  <div class="about-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span>/</span>
            <span>设置中心</span>
            <span>/</span>
            <span class="active">关于回旋镖</span>
          </div>
          <div class="header-title">
            <h1>关于回旋镖</h1>
            <p>版本信息、开源仓库与版权声明</p>
          </div>
        </div>
        <button class="reset-button" @click="() => {}">
          <span class="icon ri-restart-line"></span>
          恢复默认
        </button>
      </div>
    </div>

    <!-- 品牌信息卡片 -->
    <div class="about-card">
      <div class="about-badge">
        <svg width="34" height="35" viewBox="-17 -17.5 34 35" xmlns="http://www.w3.org/2000/svg">
          <path d="M 10 42 C 17 23 30 11 44 9 C 43 24 30 37 12 44 Z" transform="translate(-27, -26.5)" fill="#BE3B2E"/>
        </svg>
      </div>

      <div class="about-product">
        <h1 class="about-name">回旋镖 · 智能标书解决方案平台</h1>
      </div>

      <div class="about-slogan">一体化智能标书创作平台 · 让每一次投标都投出有把握的那一版</div>

      <div class="about-repo">
        <div class="repo-info">
          <div class="repo-left">GitHub 开源仓库</div>
          <div class="repo-right">
            <span class="repo-link">
              <span class="icon ri-github-line"></span>
              <span>github.com/boomerang-bid</span>
              <span class="icon ri-arrow-right-up-line"></span>
            </span>
          </div>
        </div>
      </div>

      <div class="about-copy">© 2026 回旋镖智能科技（中国 · 深圳）版权所有</div>
    </div>
  </div>
</template>

<style scoped>
:root {
  --color-bg-white: #fff;
  --color-bg-secondary: #F7F4EA;
  --color-bg-main: #F7F5EE;
  --color-text-primary: #1F1D1A;
  --color-text-secondary: #3A3A3A;
  --color-text-muted: #6E6A60;
  --color-border-soft: #EFEC E3;
  --color-primary: #C6A45C;
}

.about-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

/* 页面头部卡片 */
.page-header-card {
  background-color: var(--color-bg-white);
  border: 0.7px solid var(--color-border-soft);
  border-radius: 16px;
  padding: 20px 24px;
}

.header-purpose {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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
  color: var(--color-text-primary);
  margin: 4px 0 8px 0;
  letter-spacing: -0.5px;
}

.header-title p {
  font-size: 15px;
  color: var(--color-text-muted);
  margin: 0;
}

.reset-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  height: 48px;
  border: 0.7px solid #E8E4D8;
  background-color: var(--color-bg-white);
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text-primary);
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

/* 品牌信息卡片 */
.about-card {
  background-color: var(--color-bg-white);
  border: 0.7px solid var(--color-border-soft);
  border-radius: 16px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 20px;
}

.about-badge {
  width: 118px;
  height: 118px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.about-badge svg {
  width: 50%;
  height: 50%;
}

.about-product {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.about-name {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  color: var(--color-text-primary);
}

.about-slogan {
  margin-top: 16px;
  font-size: 16px;
  color: var(--color-text-secondary);
  line-height: 1.4;
  max-width: 456px;
}

.about-repo {
  margin-top: 32px;
  width: 740px;
}

.repo-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  height: 72px;
}

.repo-left {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.repo-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.repo-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0.7px solid #ED ECC6;
  background-color: #fff;
  border-radius: 14px;
  height: 100%;
  padding: 0 24px;
  text-decoration: none;
  font-size: 15px;
  color: var(--color-text-primary);
  transition: all 0.2s;
  flex: 1;
  justify-content: flex-end;
}

.repo-link:hover {
  background-color: #F7F4EA;
}

.repo-link .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
}

.repo-link span:nth-child(2) {
  font-size: 15px;
  color: #8A8578;
}

.repo-link .icon:last-child {
  color: #A7A296;
  font-size: 18px;
}

.about-copy {
  margin-top: 32px;
  font-size: 14px;
  color: var(--color-text-muted);
}
</style>
