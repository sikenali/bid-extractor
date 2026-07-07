<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  visible: boolean;
  filename: string;
}>();

const emit = defineEmits<{
  close: []
}>();

const currentPage = ref(3);
const totalPages = ref(86);
const zoomLevel = ref(100);

function prevPage() {
  if (currentPage.value > 1) currentPage.value--;
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++;
}

function zoomIn() {
  zoomLevel.value = Math.min(zoomLevel.value + 25, 200);
}

function zoomOut() {
  zoomLevel.value = Math.max(zoomLevel.value - 25, 25);
}
</script>

<template>
  <el-dialog
    v-model="props.visible"
    width="900px"
    class="preview-modal"
    :close-on-click-modal="false"
    :show-close="false"
  >
    <div class="preview-container">
      <div class="preview-header">
        <div class="file-info">
          <span class="icon file-icon">&#xeb47;</span>
          <span class="file-name">{{ props.filename }}</span>
        </div>
        <button class="close-btn" @click="emit('close')">
          <span class="icon">&#xeb99;</span>
        </button>
      </div>

      <div class="preview-toolbar">
        <div class="toolbar-left">
          <button class="nav-btn" @click="prevPage"><span class="icon">&#xeb38;</span></button>
          <div class="page-input">
            <span class="current-page">{{ currentPage }}</span>
            <span class="page-separator">/</span>
            <span class="total-pages">{{ totalPages }}</span>
          </div>
          <button class="nav-btn" @click="nextPage"><span class="icon">&#xeb3a;</span></button>

          <span class="toolbar-divider"></span>

          <button class="nav-btn" @click="zoomOut"><span class="icon">&#xf31d;</span></button>
          <span class="zoom-level">{{ zoomLevel }}%</span>
          <button class="nav-btn" @click="zoomIn"><span class="icon">&#xf31c;</span></button>
        </div>

        <div class="toolbar-right">
          <button class="nav-btn" title="搜索"><span class="icon">&#xeb75;</span></button>
          <button class="nav-btn download-btn" title="下载"><span class="icon">&#xec54;</span></button>
        </div>
      </div>

      <div class="preview-content">
        <div class="pdf-page" :style="{ transform: `scale(${zoomLevel / 100})` }">
          <div class="pdf-header">
            <h1 class="pdf-title">XX市智慧城市建设项目（一期）</h1>
            <h2 class="pdf-subtitle">基础设施及平台建设</h2>
            <p class="pdf-doc-type">招 标 文 件</p>
            <p class="pdf-bidding-no">招标编号：SC-ZC-2024-0815</p>
          </div>
          <div class="pdf-body">
            <h3 class="chapter-title">第一章 招标公告</h3>
            <p class="content-text">XX市智慧城市建设项目（一期）已由XX市发展和改革委员会以X发改投资〔2024〕128号批准建设，项目业主为XX市大数据中心，建设资金来自财政拨款，项目出资比例为100%，招标人为XX市大数据中心。项目已具备招标条件，现对该项目进行公开招标。</p>
            <p class="content-text">项目概况：本项目主要建设内容包括城市大数据平台、智慧交通系统、智慧安防系统、智慧政务服务平台等子系统的建设与集成。</p>
            <p class="content-text">建设地点：XX市辖区内指定地点。</p>
            <p class="content-text">计划工期：180日历天。</p>
            <p class="content-text">招标范围：本项目工程量清单及施工图纸范围内的全部内容。</p>
          </div>
          <div class="pdf-footer">
            <span class="page-num">第 {{ currentPage }} 页</span>
            <span class="doc-ref">SC-ZC-2024-0815</span>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.preview-container {
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background-color: var(--color-bg-card);
  border-radius: 16px 16px 0 0;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  font-size: 22px;
  color: var(--color-primary);
  font-family: "remixicon", sans-serif;
  font-style: normal;
}

.file-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  max-width: 600px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  width: 32px;
  height: 32px;
  background-color: var(--color-bg-card);
  border-radius: 8px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 18px;
}

.close-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background-color: var(--color-bg-main);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-btn {
  width: 32px;
  height: 32px;
  background-color: var(--color-bg-card);
  border-radius: 8px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 16px;
}

.nav-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
}

.nav-btn.download-btn {
  background-color: var(--color-primary);
  color: white;
}

.page-input {
  display: flex;
  align-items: center;
  background-color: var(--color-bg-card);
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 13px;
}

.current-page {
  font-weight: 500;
  color: var(--color-text-primary);
}

.page-separator {
  color: var(--color-text-muted);
  margin: 0 4px;
}

.total-pages {
  color: var(--color-text-muted);
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background-color: var(--color-bg-card);
  margin: 0 12px;
}

.zoom-level {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.preview-content {
  background-color: #E8E0D0;
  padding: 32px;
  display: flex;
  justify-content: center;
  min-height: 500px;
}

.pdf-page {
  width: 650px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(61, 43, 31, 0.12);
  transition: transform 0.2s;
  transform-origin: top center;
}

.pdf-header {
  padding: 32px 40px;
  text-align: center;
}

.pdf-title {
  font-size: 22px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.pdf-subtitle {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.pdf-doc-type {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-primary);
  margin: 0 0 12px 0;
  letter-spacing: 8px;
}

.pdf-bidding-no {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
}

.pdf-body {
  padding: 32px 40px;
}

.chapter-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.content-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 12px 0;
}

.pdf-footer {
  display: flex;
  justify-content: space-between;
  padding: 16px 40px;
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
