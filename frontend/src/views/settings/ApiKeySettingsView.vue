<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getApiKeys, addApiKey, deleteApiKey } from '@/api/settings';

interface ApiKeyItem {
  id: string;
  provider: string;
  model: string;
  region?: string;
  base_url?: string;
}

const selectedProviderId = ref<string | null>(null);
const activeFormTab = ref('manufacturer');
const apiKeys = ref<ApiKeyItem[]>([]);

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
  provider: '阿里云',
  model: 'qwen-turbo',
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

async function loadApiKeys() {
  try {
    apiKeys.value = await getApiKeys();
  } catch {
    apiKeys.value = [];
  }
}

onMounted(async () => {
  await loadApiKeys();
  nextTick(() => {
    positionFormTabIndicator();
    setTimeout(() => { formTabInitialized.value = true; }, 150);
  });
});

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
  if (!formState.value.apiKey) {
    ElMessage.warning('请输入 API Key');
    return;
  }
  try {
    await addApiKey({
      provider: formState.value.provider,
      model: formState.value.model,
      api_key: formState.value.apiKey,
      base_url: formState.value.baseUrl || undefined
    });
    ElMessage.success('API Key 已添加');
    formState.value.apiKey = '';
    await loadApiKeys();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '添加失败');
  }
}

async function handleDeleteKey(key: ApiKeyItem) {
  try {
    await ElMessageBox.confirm(`确定删除 ${key.provider} / ${key.model} 的 API Key？`, '确认删除');
    await deleteApiKey(key.id);
    ElMessage.success('已删除');
    await loadApiKeys();
  } catch {
    // cancelled
  }
}
</script>

<template>
      
      <div class="settings-content">
        <h2 class="page-title">API Key</h2>

        <div v-if="apiKeys.length > 0" class="existing-keys">
          <div v-for="key in apiKeys" :key="key.id" class="key-item">
            <div class="key-info">
              <span class="key-provider">{{ key.provider }}</span>
              <span class="key-model">{{ key.model }}</span>
              <span v-if="key.base_url" class="key-url">{{ key.base_url }}</span>
              <span class="key-masked">••••••••••••••••</span>
            </div>
            <button class="btn-delete-key" @click="handleDeleteKey(key)">删除</button>
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
                <button class="btn-cancel" @click="formState.apiKey = ''">取消</button>
                <button class="btn-add" @click="handleSubmit">添加</button>
              </div>
            </div>
          </div>
        </div>
      </div>
</template>

<style scoped>
.settings-content { flex: 1; padding: 32px; }
.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 4px 0; }
.page-desc { font-size: 14px; color: var(--color-text-muted); margin: 0 0 24px 0; }
.existing-keys { margin-bottom: 24px; display: flex; flex-direction: column; gap: 8px; }
.key-item { display: flex; align-items: center; justify-content: space-between; background-color: white; border: 0.7px solid var(--color-border); border-radius: 12px; padding: 12px 16px; }
.key-info { display: flex; align-items: center; gap: 16px; }
.key-provider { font-size: 14px; font-weight: 600; color: var(--color-text-primary); }
.key-model { font-size: 13px; color: var(--color-text-secondary); }
.key-url { font-size: 12px; color: var(--color-text-muted); font-family: monospace; }
.key-masked { font-size: 12px; color: var(--color-text-muted); font-family: monospace; }
.btn-delete-key { font-size: 12px; color: var(--color-primary); background: none; border: 1px solid var(--color-primary); border-radius: 6px; padding: 4px 12px; cursor: pointer; }
.btn-delete-key:hover { background-color: var(--color-primary); color: white; }
.apikey-layout { display: flex; gap: 32px; }
.model-list { width: 260px; padding: 32px 16px; background-color: white; border-radius: 12px; border: 0.7px solid var(--color-border); }
.model-group-title { font-size: 11px; color: var(--color-text-muted); font-weight: 500; padding: 0 8px; margin-bottom: 8px; }
.model-item { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; cursor: pointer; font-size: 14px; color: var(--color-text-secondary); transition: all 0.2s; margin-bottom: 4px; }
.model-item:hover { background-color: rgba(196, 61, 61, 0.05); }
.model-item.selected { background-color: var(--color-primary); color: white; font-weight: 600; }
.model-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; background-color: var(--color-bg-card); color: var(--color-text-secondary); }
.model-item.selected .model-icon { background-color: rgba(255, 255, 255, 0.2); color: white; }
.model-icon .icon { font-family: "remixicon", sans-serif; font-style: normal; }
.model-divider { height: 1px; background-color: var(--color-bg-card); margin: 20px 0; }
.config-panel { flex: 1; padding: 32px 0; }
.form-tabs { display: inline-flex; background-color: var(--color-bg-card); border-radius: 12px; padding: 4px; margin-bottom: 24px; position: relative; }
.form-tab-indicator { position: absolute; top: 4px; bottom: 4px; background-color: var(--color-primary); border-radius: 8px; z-index: 0; pointer-events: none; }
.form-tab-indicator.animated { transition: left 0.3s ease-out, width 0.3s ease-out; }
.form-tab { position: relative; z-index: 1; padding: 8px 20px; border-radius: 8px; font-size: 13px; cursor: pointer; color: var(--color-text-secondary); transition: color 0.2s; }
.form-tab.active { color: white; font-weight: 600; }
.config-form { border: 0.7px solid var(--color-border); border-radius: 16px; padding: 24px; background-color: white; }
.form-row { display: flex; align-items: center; margin-bottom: 20px; }
.form-label { width: 100px; font-size: 14px; font-weight: 500; color: var(--color-text-primary); }
.form-input { flex: 1; padding: 12px 16px; border: 0.7px solid var(--color-border); border-radius: 8px; background-color: var(--color-bg-secondary); font-size: 14px; color: var(--color-text-primary); outline: none; }
.api-key-input { flex: 1; display: flex; align-items: center; position: relative; }
.api-key-input .form-input { flex: 1; padding-right: 48px; }
.toggle-icon { position: absolute; right: 16px; font-size: 16px; color: var(--color-text-secondary); cursor: pointer; font-family: "remixicon", sans-serif; font-style: normal; }
.form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.btn-cancel { padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; background-color: var(--color-bg-card); color: var(--color-text-secondary); border: none; cursor: pointer; }
.btn-add { padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; background-color: var(--color-primary); color: white; border: none; cursor: pointer; }
</style>