<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getExportSettings, setExportSettings } from '@/api/settings';

const selectedFormat = ref<'docx' | 'markdown'>('docx');

const formats = [
  {
    key: 'docx',
    name: 'Word 格式',
    ext: '.docx',
    icon: 'ri-file-word-2-line',
    iconColor: '#2D6A9F',
    bgColor: '#E8F0F8',
    features: ['保留完整格式与排版样式', '支持表格、图片、页眉页脚', '兼容 Microsoft Word / WPS', '支持目录自动生成']
  },
  {
    key: 'markdown',
    name: 'Markdown 格式',
    ext: '.md',
    icon: 'ri-markdown-line',
    iconColor: '#8B7355',
    bgColor: '#F0E8D8',
    features: ['纯文本格式，轻量易读', '适合版本管理与协作', '可快速转换为 HTML/PDF', '兼容各类 Markdown 编辑器']
  }
];

onMounted(async () => {
  try {
    const settings = await getExportSettings();
    if (settings.format === 'docx' || settings.format === 'markdown') {
      selectedFormat.value = settings.format;
    }
  } catch {
    // fallback to default
  }
});

async function selectFormat(format: 'docx' | 'markdown') {
  selectedFormat.value = format;
  try {
    await setExportSettings({ format });
  } catch {
    // backend sync optional
  }
}
</script>

<template>
      
      <div class="settings-content">
        <h2 class="page-title">导出设置</h2>
        <p class="page-desc">配置标书导出的默认格式</p>
        <div class="format-cards">
          <div
            v-for="fmt in formats"
            :key="fmt.key"
            class="format-card"
            :class="{ selected: selectedFormat === fmt.key }"
            @click="selectFormat(fmt.key as 'docx' | 'markdown')"
          >
            <div class="card-header">
              <div class="format-icon" :style="{ backgroundColor: fmt.bgColor }">
                <span class="icon" :class="fmt.icon" :style="{ color: fmt.iconColor }"></span>
              </div>
              <div class="format-title">
                <h4>{{ fmt.name }}</h4>
                <p>{{ fmt.ext }}</p>
              </div>
              <div v-if="selectedFormat === fmt.key" class="selected-indicator">
                <span class="icon ri-check-line"></span>
              </div>
            </div>
            <ul class="features-list">
              <li v-for="(feature, i) in fmt.features" :key="i">
                <span class="icon ri-checkbox-circle-fill check"></span>
                <span>{{ feature }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
</template>

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