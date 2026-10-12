<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { addApiKey } from '@/api/settings';

const selectedProviderId = ref<string | null>(null);
const activeFormTab = ref('manufacturer');

const domesticModels = [
  { key: 'qwen', name: '通义千问', provider: '阿里云', model: 'qwen-turbo', baseUrl: 'https://dashscope.aliyuncs.com' },
  { key: 'ernie', name: '文心一言', provider: '百度', model: 'ernie-bot', baseUrl: '' },
  { key: 'glm', name: '智谱 GLM', provider: '智谱', model: 'glm-4', baseUrl: '' }
];

const internationalModels = [
  { key: 'gpt', name: 'GPT-4o', provider: 'OpenAI', model: 'gpt-4o', baseUrl: 'https://api.openai.com' },
  { key: 'claude', name: 'Claude 3.5', provider: 'Anthropic', model: 'claude-3.5', baseUrl: '' }
];

const formState = ref({
  provider: '',
  model: '',
  apiKey: '',
  baseUrl: ''
});

const showKey = ref(false);

const formTabContainerRef = ref<HTMLElement | null>(null);
const formTabIndicatorStyle = ref({ left: '0px', width: '0px' });
const formTabInitialized = ref(false);

function positionFormTabIndicator() {
  const container = formTabContainerRef.value;
  if (!container) return;
  const activeEl = container.querySelector(`[data-form-tab="${activeFormTab.value}"]`) as HTMLElement | null;
  if (!activeEl) return;
  const containerRect = container.getBoundingClientRect();
  const elRect = activeEl.getBoundingClientRect();
  formTabIndicatorStyle.value = {
    left: `${elRect.left - containerRect.left}px`,
    width: `${elRect.width}px`,
  };
}

function selectFormTab(key: string) {
  activeFormTab.value = key;
  nextTick(positionFormTabIndicator);
}

function selectModel(key: string) {
  selectedProviderId.value = key;
  const allModels = [...domesticModels, ...internationalModels];
  const model = allModels.find(m => m.key === key);
  if (model) {
    formState.value.provider = model.provider;
    formState.value.model = model.model;
    formState.value.baseUrl = model.baseUrl || '';
  }
}

async function handleSubmit() {
  if (!formState.value.provider || !formState.value.model || !formState.value.apiKey) {
    ElMessage.warning('请填写服务商、模型和 API Key');
    return;
  }
  try {
    await addApiKey({
      provider: formState.value.provider,
      model: formState.value.model,
      api_key: formState.value.apiKey,
      base_url: formState.value.baseUrl || undefined
    });
    ElMessage.success('API Key 已保存');
    formState.value = { provider: '', model: '', apiKey: '', baseUrl: '' };
    selectedProviderId.value = null;
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '保存失败');
  }
}
</script>

<template>
  <div class="model-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span class="sep">/</span>
            <span>设置中心</span>
            <span class="sep">/</span>
            <span class="current">模型管理</span>
          </div>
          <div class="header-title">
            <h1>模型管理</h1>
            <p>配置大模型服务商与 API Key 连接</p>
          </div>
        </div>
        <button class="reset-button" @click="() => {}">
          <span class="icon ri-restart-line"></span>
          恢复默认
        </button>
      </div>
    </div>

    <div class="apikey-layout">
      <div class="model-list">
        <div class="model-group-title">国内模型</div>
        <div
          v-for="model in domesticModels"
          :key="model.key"
          class="model-item"
          :class="{ selected: selectedProviderId === model.key }"
          @click="selectModel(model.key)"
        >
          <div class="model-icon"><span class="icon ri-cloud-line"></span></div>
          <span>{{ model.name }}</span>
        </div>
        <div class="model-divider"></div>
        <div class="model-group-title">国外模型</div>
        <div
          v-for="model in internationalModels"
          :key="model.key"
          class="model-item"
          :class="{ selected: selectedProviderId === model.key }"
          @click="selectModel(model.key)"
        >
          <div class="model-icon"><span class="icon ri-earth-line"></span></div>
          <span>{{ model.name }}</span>
        </div>
      </div>

      <div class="config-panel">
        <div ref="formTabContainerRef" class="form-tabs">
          <div
            class="form-tab-indicator"
            :class="{ animated: formTabInitialized }"
            :style="formTabIndicatorStyle"
          ></div>
          <div
            :data-form-tab="'manufacturer'"
            class="form-tab"
            :class="{ active: activeFormTab === 'manufacturer' }"
            @click="selectFormTab('manufacturer')"
          >模型制造商</div>
          <div
            :data-form-tab="'custom'"
            class="form-tab"
            :class="{ active: activeFormTab === 'custom' }"
            @click="selectFormTab('custom')"
          >自定义配置</div>
        </div>

        <div class="config-form">
          <div class="form-row">
            <label class="form-label">服务商</label>
            <input v-model="formState.provider" class="form-input" placeholder="请输入服务商" />
          </div>
          <div class="form-row">
            <label class="form-label">模型</label>
            <input v-model="formState.model" class="form-input" placeholder="请输入模型名称" />
          </div>
          <div class="form-row">
            <label class="form-label">服务商 URL</label>
            <input v-model="formState.baseUrl" class="form-input" placeholder="https://api.openai.com" />
          </div>
          <div class="form-row">
            <label class="form-label">选择 API Key</label>
            <div class="api-key-input">
              <input v-model="formState.apiKey" class="form-input" :type="showKey ? 'text' : 'password'" placeholder="sk-••••••••••••••••••••••••" />
              <span class="icon toggle-icon" :class="showKey ? 'ri-eye-line' : 'ri-eye-off-line'" @click="showKey = !showKey"></span>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-add" @click="handleSubmit">保存</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1200px;
}
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
.section-card {
  background-color: #FFFFFF;
  border: 0.7px solid #EFECE3;
  border-radius: 16px;
  padding: 24px 28px;
}

.apikey-layout { display: flex; gap: 32px; }
.model-list { width: 260px; padding: 32px 16px; background-color: #FFFFFF; border-radius: 12px; border: 0.7px solid #E5DFD3; }
.model-group-title { font-size: 11px; color: #8A8578; font-weight: 500; padding: 0 8px; margin-bottom: 8px; font-family: "SourceHanSans-Medium", var(--font-family-cn); }
.model-item { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; cursor: pointer; font-size: 14px; color: #3A3A3A; transition: all 0.2s; margin-bottom: 4px; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.model-item:hover { background-color: rgba(196, 61, 61, 0.05); }
.model-item.selected { background-color: #C0392B; color: white; font-weight: 600; }
.model-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; background-color: #F7F3EA; color: #6E6A60; }
.model-item.selected .model-icon { background-color: rgba(255, 255, 255, 0.2); color: white; }
.model-icon .icon { font-family: "remixicon", sans-serif; font-style: normal; }
.model-divider { height: 1px; background-color: #EDE9E0; margin: 20px 0; }
.config-panel { flex: 1; padding: 32px 0; }
.form-tabs { display: inline-flex; background-color: #F7F3EA; border-radius: 12px; padding: 4px; margin-bottom: 24px; position: relative; }
.form-tab-indicator { position: absolute; top: 4px; bottom: 4px; background-color: #C0392B; border-radius: 8px; z-index: 0; pointer-events: none; }
.form-tab-indicator.animated { transition: left 0.3s ease-out, width 0.3s ease-out; }
.form-tab { position: relative; z-index: 1; padding: 8px 20px; border-radius: 8px; font-size: 13px; cursor: pointer; color: #6E6A60; transition: color 0.2s; }
.form-tab.active { color: white; font-weight: 600; }
.config-form { border: 0.7px solid #E5DFD3; border-radius: 16px; padding: 24px; background-color: #FFFFFF; }
.form-row { display: flex; align-items: center; margin-bottom: 20px; }
.form-label { width: 100px; font-size: 14px; font-weight: 500; color: #1F1D1A; font-family: "SourceHanSans-Medium", var(--font-family-cn); }
.form-input { flex: 1; padding: 12px 16px; border: 0.7px solid #E5DFD3; border-radius: 8px; background-color: #FAF8F0; font-size: 14px; color: #1F1D1A; outline: none; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.api-key-input { flex: 1; display: flex; align-items: center; position: relative; }
.api-key-input .form-input { flex: 1; padding-right: 48px; }
.toggle-icon { position: absolute; right: 16px; font-size: 16px; color: #6E6A60; cursor: pointer; font-family: "remixicon", sans-serif; font-style: normal; }
.form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.btn-add { padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; background-color: #C0392B; color: white; border: none; cursor: pointer; font-family: "SourceHanSans-Medium", var(--font-family-cn); }
</style>