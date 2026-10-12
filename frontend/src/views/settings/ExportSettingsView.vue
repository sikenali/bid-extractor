<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface ExportItem {
  key: string;
  name: string;
  desc: string;
  iconText: string;
  iconColor: string;
}

const formats: ExportItem[] = [
  { key: 'docx', name: 'Word 文档 ·.docx', desc: '保留可编辑正文，商用文库首选', iconText: 'W', iconColor: '#2B579A' },
  { key: 'pdf', name: 'PDF 文档 ·.pdf', desc: '矢量高清，适用于打印与送审', iconText: 'PDF', iconColor: '#C0392B' },
  { key: 'markdown', name: 'Markdown ·.md', desc: '轻盈纯文本，便于二次编辑', iconText: 'MD', iconColor: '#3A4A63' },
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
            <span class="sep">/</span>
            <span>设置中心</span>
            <span class="sep">/</span>
            <span class="current">导出管理</span>
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
          <div class="format-icon" :style="{ backgroundColor: fmt.iconColor }">
            <span class="icon-text">{{ fmt.iconText }}</span>
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
  </div>
</template>

<style scoped>
.export-view {
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

/* 通用卡片 */
.section-card {
  background-color: #FFFFFF;
  border: 0.7px solid #EFECE3;
  border-radius: 16px;
  padding: 24px 40px;
}
.card-title {
  font-size: 17px;
  font-weight: 500;
  color: #1F1D1A;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}

/* 默认导出格式 */
.format-group {
  display: flex;
  gap: 24px;
  margin-top: 20px;
  height: 154px;
  align-items: stretch;
}
.format-card {
  flex: 1;
  border: 0.7px solid #EFECE3;
  background-color: #FFFFFF;
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  transition: all 0.2s;
}
.format-card.active {
  border-color: #E0C98A;
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
  font-weight: 700;
  color: #fff;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  font-size: 17px;
  line-height: 1;
}
.format-card:nth-child(2) .icon-text,
.format-card:nth-child(3) .icon-text {
  font-size: 14px;
}
.format-info {
  display: flex;
  flex-direction: column;
  margin-top: 16px;
}
.format-name {
  font-size: 17px;
  font-weight: 500;
  color: #1F1D1A;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.format-desc {
  font-size: 13px;
  color: #8A8578;
  margin-top: 8px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

/* 设置项 */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 76px;
  gap: 20px;
}
.setting-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.setting-name {
  font-size: 16px;
  font-weight: 500;
  color: #1F1D1A;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.setting-desc {
  font-size: 15px;
  color: #8A8578;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.toggle-switch {
  width: 46px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 9999px;
  padding: 3px;
  cursor: pointer;
  background-color: #E3E0D6;
  transition: background-color 0.2s;
  display: flex;
  justify-content: flex-start;
}
.toggle-switch.active {
  background-color: #C6A45C;
  justify-content: flex-end;
}
.toggle-circle {
  width: 21px;
  height: 20px;
  border-radius: 9999px;
  background-color: #fff;
  transition: transform 0.2s;
}
</style>