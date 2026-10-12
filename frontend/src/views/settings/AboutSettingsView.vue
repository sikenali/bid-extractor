<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="about-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span class="sep">/</span>
            <span>设置中心</span>
            <span class="sep">/</span>
            <span class="current">关于回旋镖</span>
          </div>
          <div class="header-title">
            <h1>关于回旋镖</h1>
            <p>版本信息、开源仓库与版权声明</p>
          </div>
        </div>
        <button class="reset-button" @click="router.push('/settings/theme')">
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

      <div class="about-name">回旋镖 · 智能标书解决方案平台</div>

      <div class="about-slogan">一体化智能标书创作平台 · 让每一次投标都投出有把握的那一版</div>

      <div class="about-repo" @click="router.push('/settings/theme')">
        <span class="repo-left">GitHub 开源仓库</span>
        <span class="repo-right">
          <span class="icon ri-github-line"></span>
          <span class="repo-url">github.com/boomerang-bid</span>
          <span class="icon ri-arrow-right-up-line"></span>
        </span>
      </div>

      <div class="about-copy">© 2026 回旋镖智能科技（中国 · 深圳）版权所有</div>
    </div>
  </div>
</template>

<style scoped>
.about-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1620px;
}

/* 页面头部卡片 */
.page-header-card {
  background-color: #FFFFFF;
  border: 0.7px solid #EFECE3;
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
  color: #A7A296;
}
.breadcrumb span.sep {
  color: #C9C3B6;
}
.breadcrumb span.current {
  color: #3A3A3A;
  font-weight: 500;
}
.header-title h1 {
  font-size: 30px;
  font-weight: 700;
  color: #1F1D1A;
  margin: 12px 0 0 0;
  letter-spacing: -0.5px;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  line-height: 1.2;
}
.header-title p {
  font-size: 15px;
  color: #6E6A60;
  margin: 8px 0 0 0;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.reset-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  height: 48px;
  border: 0.7px solid #E8E4D8;
  background-color: #FFFFFF;
  border-radius: 12px;
  font-size: 15px;
  color: #3A3A3A;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
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
  background-color: #FFFFFF;
  border: 0.7px solid #EFECE3;
  border-radius: 16px;
  height: 525px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.about-badge {
  width: 118px;
  height: 118px;
  border-radius: 50%;
  border: 0.7px solid #E8D9B0;
  background-color: #FBF5E3;
  display: flex;
  align-items: center;
  justify-content: center;
}
.about-name {
  margin-top: 32px;
  font-size: 24px;
  font-weight: 700;
  color: #1F1D1A;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  line-height: 1.2;
}
.about-slogan {
  margin-top: 16px;
  font-size: 16px;
  color: #6E6A60;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  line-height: 1.4;
}
.about-repo {
  margin-top: 32px;
  width: 740px;
  height: 72px;
  border: 0.7px solid #EFECE3;
  background-color: #FFFFFF;
  border-radius: 14px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background-color 0.2s;
  box-sizing: border-box;
}
.about-repo:hover {
  background-color: #FAF8F0;
}
.repo-left {
  font-size: 16px;
  font-weight: 500;
  color: #1F1D1A;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.repo-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.repo-right .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
  color: #6E6A60;
}
.repo-right .icon:last-child {
  font-size: 20px;
  color: #A7A296;
}
.repo-url {
  font-size: 15px;
  color: #8A8578;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.about-copy {
  margin-top: 32px;
  font-size: 14px;
  color: #A7A296;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
</style>