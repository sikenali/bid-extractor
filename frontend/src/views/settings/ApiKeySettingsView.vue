<script setup lang="ts">
import { ref } from 'vue';
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

const selectedProvider = ref('qwen');
const activeFormTab = ref('manufacturer');

const domesticModels = [
  { key: 'qwen', name: '通义千问' },
  { key: 'ernie', name: '文心一言' },
  { key: 'glm', name: '智谱 GLM' }
];

const internationalModels = [
  { key: 'gpt', name: 'GPT-4o' },
  { key: 'claude', name: 'Claude 3.5' }
];

const formState = ref({
  provider: '阿里云',
  model: 'qwen-turbo',
  apiKey: ''
});
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">API Key</h2>
        <p class="page-desc">配置 AI 模型的 API 访问密钥</p>

        <div class="apikey-layout">
          <div class="model-list">
            <div class="model-group-title">国内模型</div>
            <div
              v-for="model in domesticModels"
              :key="model.key"
              class="model-item"
              :class="{ selected: selectedProvider === model.key }"
              @click="selectedProvider = model.key"
            >
              <div class="model-icon"><span class="icon">&#xec12;</span></div>
              <span>{{ model.name }}</span>
            </div>

            <div class="model-divider"></div>
            <div class="model-group-title">国外模型</div>

            <div
              v-for="model in internationalModels"
              :key="model.key"
              class="model-item"
              :class="{ selected: selectedProvider === model.key }"
              @click="selectedProvider = model.key"
            >
              <div class="model-icon"><span class="icon">&#xf30b;</span></div>
              <span>{{ model.name }}</span>
            </div>
          </div>

          <div class="config-panel">
            <div class="form-tabs">
              <div class="form-tab" :class="{ active: activeFormTab === 'manufacturer' }" @click="activeFormTab = 'manufacturer'">模型制造商</div>
              <div class="form-tab" :class="{ active: activeFormTab === 'custom' }" @click="activeFormTab = 'custom'">自定义配置</div>
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
                <label class="form-label">API Key</label>
                <div class="api-key-input">
                  <input v-model="formState.apiKey" class="form-input" type="password" placeholder="sk-••••••••••••••••••••••••" />
                  <span class="icon toggle-icon">&#xec35;</span>
                </div>
              </div>

              <div class="form-actions">
                <button class="btn-cancel">取消</button>
                <button class="btn-add">添加</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view { min-height: 100vh; background-color: var(--color-bg-main); }
.settings-body { display: flex; min-height: calc(100vh - 64px); }
.settings-content { flex: 1; padding: 32px; }
.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 4px 0; }
.page-desc { font-size: 14px; color: var(--color-text-muted); margin: 0 0 24px 0; }

.apikey-layout { display: flex; gap: 32px; }

.model-list {
  width: 260px;
  padding: 32px 16px;
  background-color: white;
  border-radius: 12px;
  border: 0.7px solid var(--color-border);
}

.model-group-title {
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: 500;
  padding: 0 8px;
  margin-bottom: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
  margin-bottom: 4px;
}

.model-item:hover { background-color: rgba(196, 61, 61, 0.05); }

.model-item.selected {
  background-color: var(--color-primary);
  color: white;
  font-weight: 600;
}

.model-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background-color: var(--color-bg-card);
  color: var(--color-text-secondary);
}

.model-item.selected .model-icon {
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
}

.model-icon .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
}

.model-divider {
  height: 1px;
  background-color: var(--color-bg-card);
  margin: 20px 0;
}

.config-panel { flex: 1; padding: 32px 0; }

.form-tabs {
  display: inline-flex;
  background-color: var(--color-bg-card);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 24px;
}

.form-tab {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.form-tab.active {
  background-color: var(--color-primary);
  color: white;
  font-weight: 600;
}

.config-form {
  border: 0.7px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  background-color: white;
}

.form-row {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.form-label {
  width: 100px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-input {
  flex: 1;
  padding: 12px 16px;
  border: 0.7px solid var(--color-border);
  border-radius: 8px;
  background-color: var(--color-bg-secondary);
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
}

.api-key-input {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
}

.api-key-input .form-input { flex: 1; padding-right: 48px; }

.toggle-icon {
  position: absolute;
  right: 16px;
  font-size: 16px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: "remixicon", sans-serif;
  font-style: normal;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.btn-cancel {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  background-color: var(--color-bg-card);
  color: var(--color-text-secondary);
  border: none;
  cursor: pointer;
}

.btn-add {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  background-color: var(--color-primary);
  color: white;
  border: none;
  cursor: pointer;
}
</style>
