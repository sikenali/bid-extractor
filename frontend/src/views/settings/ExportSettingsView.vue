<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface FormatItem {
  key: string;
  name: string;
  desc: string;
  icon: string;
  iconColor: string;
  iconName: string;
}

interface ExportItem {
  key: string;
  name: string;
  ext: string;
  desc: string;
  iconBg: string;
}

const formats: ExportItem[] = [
  { key: 'docx', name: 'Word 文档 ·.docx', ext: '.docx', desc: '保留可编辑正文，商用文库首选', iconBg: '#2B579A' },
  { key: 'pdf', name: 'PDF 文档 ·.pdf', ext: '.pdf', desc: '矢量高清，适用于打印与送审', iconBg: '#C0392B' },
  { key: 'markdown', name: 'Markdown ·.md', ext: '.md', desc: '轻盈纯文本，便于二次编辑', iconBg: '#3A4A63' },
];

const wordSettings = ref({
  preserveTemplate: true,
  autoTable: true,
  embedFont: false,
});

const pdfSettings = ref({
  vectorHD: true,
  keepBookmarks: true,
  addWatermark: false,
});

const mdSettings = ref({
  preserveTable: true,
  downgradeTitle: false,
});

const selectedFormat = ref('docx');

onMounted(() => {
  selectedFormat.value = 'docx';
});
</script>

<template>
  <div class="export-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span>/</span>
            <span>设置中心</span>
            <span>/</span>
            <span class="active">导出管理</span>
          </div>
          <div class="header-title">
            <h1>导出管理</h1>
            <p>配置 Word、PDF、Markdown 三类成品的输出规格与默认行为</p>
          </div>
        </div>
        <button class="reset-button" @click="() => {}">
          <span class="icon ri-restart-line"></span>
          恢复默认
        </button>
      </div>
    </div>

    <!-- 默认导出格式 -->
    <div class="section-card">
      <div class="card-title">默认导出格式</div>
      <div class="format-group">
        <div
          v-for="fmt in formats"
          :key="fmt.key"
          class="format-card"
          :class="{ active: selectedFormat === fmt.key }"
          @click="selectedFormat = fmt.key"
        >
          <div class="format-icon" :style="{ backgroundColor: fmt.iconBg }">
            <span class="icon-text">{{ getIconText(fmt.key) }}</span>
          </div>
          <div class="format-info">
            <div class="format-name">{{ fmt.name }}</div>
            <div class="format-desc">{{ fmt.desc }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Word 导出设置 -->
    <div class="section-card">
      <div class="card-title">Word 导出设置</div>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-name">保留原始模板样式</div>
          <div class="setting-desc">导出时沿用模板的页眉页脚与标题层级</div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: wordSettings.preserveTemplate }"
          @click="wordSettings.preserveTemplate = !wordSettings.preserveTemplate"
        >
          <div class="toggle-circle"></div>
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-name">自动生成目录与页码</div>
          <div class="setting-desc">按二级标题生成可跳转目录并标注页码</div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: wordSettings.autoTable }"
          @click="wordSettings.autoTable = !wordSettings.autoTable"
        >
          <div class="toggle-circle"></div>
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-name">嵌入正文所用字体</div>
          <div class="setting-desc">避免他人电脑打开时出现字体替换</div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: wordSettings.embedFont }"
          @click="wordSettings.embedFont = !wordSettings.embedFont"
        >
          <div class="toggle-circle"></div>
        </div>
      </div>
    </div>

    <!-- PDF 导出设置 -->
    <div class="section-card">
      <div class="card-title">PDF 导出设置</div>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-name">矢量高清输出 300dpi</div>
          <div class="setting-desc">文字与图片均不压缩，适合打印装订后送审</div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: pdfSettings.vectorHD }"
          @click="pdfSettings.vectorHD = !pdfSettings.vectorHD"
        >
          <div class="toggle-circle"></div>
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-name">保留书签导航树</div>
          <div class="setting-desc">按章节层级生成左侧书签，评委可快速跳转</div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: pdfSettings.keepBookmarks }"
          @click="pdfSettings.keepBookmarks = !pdfSettings.keepBookmarks"
        >
          <div class="toggle-circle"></div>
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-name">添加内部稿水印</div>
          <div class="setting-desc">叠加「回旋镖 · 内部稿」对角淡色水印</div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: pdfSettings.addWatermark }"
          @click="pdfSettings.addWatermark = !pdfSettings.addWatermark"
        >
          <div class="toggle-circle"></div>
        </div>
      </div>
    </div>

    <!-- Markdown 导出设置 -->
    <div class="section-card">
      <div class="card-title">Markdown 导出设置</div>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-name">保留表格与图片链接</div>
          <div class="setting-desc">表格转为 Markdown 语法，图片保留相对路径</div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: mdSettings.preserveTable }"
          @click="mdSettings.preserveTable = !mdSettings.preserveTable"
        >
          <div class="toggle-circle"></div>
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-name">一级标题自动降级</div>
          <div class="setting-desc">便于直接粘贴到团队 Wiki 的文档树中</div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: mdSettings.downgradeTitle }"
          @click="mdSettings.downgradeTitle = !mdSettings.downgradeTitle"
        >
          <div class="toggle-circle"></div>
        </div>
      </div>
    </div>

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

.export-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
}

/* 页面头部卡片 */
.page-header-card {
  background-color: var(--color-bg-white);
  border: 0.7px solid var(--color-border-soft);
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

/* 通用卡片 */
.section-card {
  background-color: var(--color-bg-white);
  border: 0.7px solid var(--color-border-soft);
  border-radius: 16px;
  padding: 24px 28px;
}

.card-title {
  font-size: 17px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0;
}

/* 默认导出格式 */
.format-group {
  display: flex;
  gap: 24px;
  margin-top: 24px;
}

.format-card {
  flex: 1;
  border: 0.7px solid var(--color-border-soft);
  background-color: var(--color-bg-white);
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.2s;
}

.format-card.active {
  border-color: var(--color-primary);
  background-color: #FBF5E6;
}

.format-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-text {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
}

.format-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.format-name {
  font-size: 17px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.format-desc {
  font-size: 13px;
  color: #8A8578;
  margin-top: 8px;
}

/* 设置项 */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0;
  gap: 20px;
}

.setting-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-name {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.setting-desc {
  font-size: 15px;
  color: #8A8578;
}

.toggle-switch {
  width: 46px;
  height: 26px;
  border: 0.7px solid #E3E4E6;
  border-radius: 9999px;
  padding: 3px;
  cursor: pointer;
  background-color: #E3E0D6;
  transition: all 0.2s;
  border-color: #E3E0D6;
}

.toggle-switch.active {
  background-color: #C6A45C;
  border-color: #C6A45C;
}

.toggle-circle {
  width: 21px;
  height: 20px;
  border-radius: 9999px;
  background-color: #fff;
  transition: transform 0.2s;
}

.toggle-switch.active .toggle-circle {
  transform: translateX(20px);
}
</style>
</template>

<script>
function getIconText(key) {
  if (key === 'docx') return 'W';
  if (key === 'pdf') return 'PDF';
  if (key === 'markdown') return 'MD';
  return '';
}
</script>



<style scoped>
.settings-content { flex: 1; padding: 32px; }
.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 4px 0; }
.page-desc { font-size: 14px; color: var(--color-text-muted); margin: 0 0 32px 0; }
.format-cards { display: flex; gap: 24px; }
.format-card { flex: 1; max-width: 578px; border-radius: 16px; padding: 32px; background-color: white; border: 2px solid transparent; cursor: pointer; transition: all 0.2s; }
.format-card.selected { border-color: var(--color-primary); box-shadow: 0 4px 20px rgba(196, 61, 61, 0.1); }
.format-card:hover:not(.selected) { border-color: var(--color-border); }
.card-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.format-icon { width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
.format-icon .icon { font-family: "remixicon", sans-serif; font-style: normal; }
.format-title h4 { font-size: 20px; font-weight: bold; color: var(--color-text-primary); margin: 0; }
.format-title p { font-size: 13px; color: var(--color-text-muted); margin: 4px 0 0 0; }
.selected-indicator { margin-left: auto; width: 28px; height: 28px; background-color: var(--color-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; }
.selected-indicator .icon { font-family: "remixicon", sans-serif; font-style: normal; }
.features-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.features-list li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text-secondary); }
.features-list .check { color: #2D8A4E; font-size: 16px; font-family: "remixicon", sans-serif; font-style: normal; }
</style>