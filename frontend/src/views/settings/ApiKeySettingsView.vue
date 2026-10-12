<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import apiClient from '@/api/client';
import { toggleApiKey, deleteApiKey, testApiKey } from '@/api/settings';

const domesticModels = [
  { id: 'qwen', name: '通义千问', provider: '阿里云', model: 'qwen-turbo', baseUrl: 'https://dashscope.aliyuncs.com' },
  { id: 'ernie', name: '文心一言', provider: '百度', model: 'ernie-bot', baseUrl: '' },
  { id: 'glm', name: '智谱 GLM', provider: '智谱', model: 'glm-4', baseUrl: '' },
];

const internationalModels = [
  { id: 'gpt', name: 'GPT-4o', provider: 'OpenAI', model: 'gpt-4o', baseUrl: 'https://api.openai.com' },
  { id: 'claude', name: 'Claude 3.5', provider: 'Anthropic', model: 'claude-3-5-sonnet', baseUrl: 'https://api.anthropic.com' },
];

const allModels = [...domesticModels, ...internationalModels];

const selectedModelId = ref<string | null>(null);
const customFormat = ref<'openai' | 'anthropic'>('openai');
const customEndpoint = ref('');
const customModelId = ref('');
const customApiKey = ref('');
const showCustomKey = ref(false);
const quickApiKey = ref('');
const showQuickKey = ref(false);

const savedKeys = ref<Array<{ id: string; provider: string; model: string; maskedKey: string; enabled: boolean; baseUrl?: string; format?: string }>>([]);

// Test state
const testingKey = ref<string | null>(null);
const testSuccess = ref<Record<string, boolean>>({});
const testFailed = ref<Record<string, boolean>>({});
const testError = ref<Record<string, string>>({});

// Edit state
const editingId = ref<string | null>(null);
const editForm = ref({ provider: '', model: '', baseUrl: '', apiKey: '' });
const showEditKey = ref(false);

onMounted(async () => {
  try {
    const res = await apiClient.get('/settings/apikeys');
    savedKeys.value = (res.data || []).map((k: any) => ({
      id: k.id,
      provider: k.provider,
      model: k.model,
      maskedKey: k.api_key || '••••',
      enabled: k.enabled !== false,
      baseUrl: k.base_url || '',
      format: 'openai',
    }));
  } catch {}
});

function onSelectModel(key: string) {
  selectedModelId.value = key;
}

async function reloadKeys() {
  try {
    const res = await apiClient.get('/settings/apikeys');
    savedKeys.value = (res.data || []).map((k: any) => ({
      id: k.id, provider: k.provider, model: k.model,
      maskedKey: k.api_key || '••••',
      enabled: k.enabled !== false,
      baseUrl: k.base_url || '',
      format: 'openai',
    }));
  } catch {}
}

async function handleDelete(id: string) {
  try {
    await deleteApiKey(id);
    await reloadKeys();
    ElMessage.success('已删除');
  } catch { ElMessage.error('删除失败'); }
}

async function handleToggle(key: typeof savedKeys.value[0]) {
  try {
    const result = await toggleApiKey(key.id);
    key.enabled = result.enabled === 1;
  } catch { ElMessage.error('操作失败'); }
}

function startEdit(key: typeof savedKeys.value[0]) {
  editingId.value = key.id;
  editForm.value = {
    provider: key.provider,
    model: key.model,
    baseUrl: key.baseUrl || '',
    apiKey: '',
  };
  showEditKey.value = false;
}

async function saveEdit() {
  if (!editingId.value) return;
  try {
    await apiClient.put(`/settings/apikeys/${editingId.value}`, {
      ...editForm.value,
      enabled: savedKeys.value.find(k => k.id === editingId.value)?.enabled ? 1 : 0,
    });
    ElMessage.success('已更新');
    editingId.value = null;
    await reloadKeys();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '更新失败');
  }
}

function cancelEdit() {
  editingId.value = null;
}

const keyStore = ref<Record<string, string>>({});

async function handleSaveQuickReal() {
  const model = allModels.find(m => m.id === selectedModelId.value);
  if (!model) { ElMessage.warning('请先选择模型'); return; }
  if (!quickApiKey.value.trim()) { ElMessage.warning('请填写 API Key'); return; }
  try {
    const res: any = await apiClient.post('/settings/apikeys', {
      provider: model.provider,
      model: model.model,
      api_key: quickApiKey.value.trim(),
      base_url: model.baseUrl || undefined,
    });
    keyStore.value[res.data.id] = quickApiKey.value.trim();
    ElMessage.success(`「${model.name}」API Key 已保存`);
    quickApiKey.value = '';
    await reloadKeys();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '保存失败');
  }
}

async function handleSaveCustomReal() {
  if (!customEndpoint.value.trim() || !customModelId.value.trim() || !customApiKey.value.trim()) {
    ElMessage.warning('请填写完整配置信息'); return;
  }
  try {
    const res: any = await apiClient.post('/settings/apikeys', {
      provider: customFormat.value === 'anthropic' ? 'Anthropic (自定义)' : 'OpenAI (自定义)',
      model: customModelId.value.trim(),
      api_key: customApiKey.value.trim(),
      base_url: customEndpoint.value.trim(),
    });
    keyStore.value[res.data.id] = customApiKey.value.trim();
    ElMessage.success('自定义配置已保存');
    customEndpoint.value = '';
    customModelId.value = '';
    customApiKey.value = '';
    await reloadKeys();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '保存失败');
  }
}

async function handleTestReal(key: typeof savedKeys.value[0]) {
  const realKey = keyStore.value[key.id] || '';
  if (!realKey) { ElMessage.warning('该 Key 未在本地缓存，请重新保存'); return; }
  testingKey.value = key.id;
  testSuccess.value[key.id] = false;
  testFailed.value[key.id] = false;
  testError.value[key.id] = '';
  try {
    const result = await testApiKey({
      provider: key.provider,
      model: key.model,
      key: realKey,
      endpoint: key.baseUrl || undefined,
    });
    if (result.available) {
      testSuccess.value[key.id] = true;
    } else {
      testFailed.value[key.id] = true;
      testError.value[key.id] = result.error || '测试失败';
    }
  } catch (err: any) {
    testFailed.value[key.id] = true;
    testError.value[key.id] = err?.response?.data?.error || '网络错误';
  } finally {
    testingKey.value = null;
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
            <span>首页</span><span class="sep">/</span>
            <span>设置中心</span><span class="sep">/</span>
            <span class="current">模型管理</span>
          </div>
          <div class="header-title">
            <h1>模型管理</h1>
            <p>配置 AI 大模型服务商与 API Key 连接</p>
          </div>
        </div>
        <button class="reset-button" @click="() => {}">
          <span class="icon ri-restart-line"></span>
          恢复默认
        </button>
      </div>
    </div>

    <!-- 快速配置 -->
    <div class="section-card">
      <div class="card-title">快速配置</div>
      <div class="card-desc">从内置服务商列表中选择模型并填写 API Key</div>
      <div class="model-select-list">
        <div class="model-group-label">国内模型</div>
        <div
          v-for="m in domesticModels"
          :key="m.id"
          class="model-option"
          :class="{ active: selectedModelId === m.id }"
          @click="onSelectModel(m.id)"
        >
          <div class="model-option-icon"><span class="icon ri-cloud-line"></span></div>
          <div class="model-option-info">
            <div class="model-option-name">{{ m.name }}</div>
            <div class="model-option-meta">{{ m.provider }} · {{ m.model }}</div>
          </div>
          <span class="model-option-check" :class="{ visible: selectedModelId === m.id }"><span class="icon ri-check-line"></span></span>
        </div>
        <div class="model-divider"></div>
        <div class="model-group-label">海外模型</div>
        <div
          v-for="m in internationalModels"
          :key="m.id"
          class="model-option"
          :class="{ active: selectedModelId === m.id }"
          @click="onSelectModel(m.id)"
        >
          <div class="model-option-icon"><span class="icon ri-earth-line"></span></div>
          <div class="model-option-info">
            <div class="model-option-name">{{ m.name }}</div>
            <div class="model-option-meta">{{ m.provider }} · {{ m.model }}</div>
          </div>
          <span class="model-option-check" :class="{ visible: selectedModelId === m.id }"><span class="icon ri-check-line"></span></span>
        </div>
      </div>

      <div v-if="selectedModel" class="config-form-inline">
        <div class="form-field" style="flex:1">
          <label class="form-label">API Key</label>
          <div class="api-key-row">
            <input v-model="quickApiKey" :type="showQuickKey ? 'text' : 'password'" class="form-input" placeholder="sk-••••••••••••••••" />
            <span class="key-toggle icon" :class="showQuickKey ? 'ri-eye-line' : 'ri-eye-off-line'" @click="showQuickKey = !showQuickKey"></span>
          </div>
        </div>
        <button class="btn-save" @click="handleSaveQuickReal">保存配置</button>
      </div>
    </div>

    <!-- 自定义配置 -->
    <div class="section-card">
      <div class="card-title">自定义配置</div>
      <div class="card-desc">手动填写 API 格式、端点地址和模型 ID，适用于未内置的服务商</div>
      <div class="config-form-grid">
        <div class="form-field">
          <label class="form-label">API 格式</label>
          <div class="format-tabs">
            <button class="format-tab" :class="{ active: customFormat === 'openai' }" @click="customFormat = 'openai'">OpenAI Chat</button>
            <button class="format-tab" :class="{ active: customFormat === 'anthropic' }" @click="customFormat = 'anthropic'">Anthropic Messages</button>
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">端点地址</label>
          <input v-model="customEndpoint" class="form-input" placeholder="https://api.example.com/v1" />
        </div>
        <div class="form-field">
          <label class="form-label">模型 ID</label>
          <input v-model="customModelId" class="form-input" placeholder="例如：gpt-4o" />
        </div>
        <div class="form-field form-field-key">
          <label class="form-label">API Key</label>
          <div class="api-key-row">
            <input v-model="customApiKey" :type="showCustomKey ? 'text' : 'password'" class="form-input" placeholder="sk-••••••••••••••••" />
            <span class="key-toggle icon" :class="showCustomKey ? 'ri-eye-line' : 'ri-eye-off-line'" @click="showCustomKey = !showCustomKey"></span>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-save" @click="handleSaveCustomReal">保存配置</button>
      </div>
    </div>

    <!-- 已保存配置 -->
    <div v-if="savedKeys.length > 0" class="section-card">
      <div class="card-title">已保存的配置</div>
      <div class="saved-keys-list">
        <div v-for="key in savedKeys" :key="key.id" class="saved-key-item">
          <!-- 编辑模式 -->
          <template v-if="editingId === key.id">
            <div class="edit-form" style="grid-column:1/-1">
              <div class="form-field">
                <label class="form-label">服务商</label>
                <input v-model="editForm.provider" class="form-input" placeholder="服务商名称" />
              </div>
              <div class="form-field">
                <label class="form-label">模型</label>
                <input v-model="editForm.model" class="form-input" placeholder="模型名称" />
              </div>
              <div class="form-field">
                <label class="form-label">端点地址</label>
                <input v-model="editForm.baseUrl" class="form-input" placeholder="https://api.example.com/v1" />
              </div>
              <div class="form-field">
                <label class="form-label">API Key</label>
                <div class="api-key-row">
                  <input v-model="editForm.apiKey" :type="showEditKey ? 'text' : 'password'" class="form-input" placeholder="留空则不修改" />
                  <span class="key-toggle icon" :class="showEditKey ? 'ri-eye-line' : 'ri-eye-off-line'" @click="showEditKey = !showEditKey"></span>
                </div>
              </div>
              <div class="edit-actions">
                <button class="btn-sm cancel" @click="cancelEdit">取消</button>
                <button class="btn-sm save" @click="saveEdit">保存</button>
              </div>
            </div>
          </template>

          <!-- 正常显示模式 -->
          <template v-else>
            <div class="saved-key-info">
              <div class="saved-key-provider">{{ key.provider }}</div>
              <div class="saved-key-model">{{ key.model }}<span v-if="key.baseUrl" class="saved-key-endpoint">{{ key.baseUrl }}</span></div>
            </div>
            <div class="saved-key-actions">
              <span class="saved-key-masked">{{ key.maskedKey }}</span>
              <button class="action-icon-btn" :class="{ on: key.enabled }" :title="key.enabled ? '禁用' : '启用'" @click="handleToggle(key)">
                <span class="icon" :class="key.enabled ? 'ri-checkbox-circle-line' : 'ri-radio-button-line'"></span>
              </button>
              <button class="action-icon-btn" title="测试连接" @click="handleTestReal(key)" :disabled="testingKey === key.id">
                <span v-if="testingKey === key.id" class="icon ri-loader-4-line spinning"></span>
                <span v-else-if="testSuccess[key.id]" class="icon ri-check-line success"></span>
                <span v-else-if="testFailed[key.id]" class="icon ri-close-circle-line failed"></span>
                <span v-else class="icon ri-flight-takeoff-line"></span>
              </button>
              <button class="action-icon-btn" title="编辑" @click="startEdit(key)">
                <span class="icon ri-edit-line"></span>
              </button>
              <button class="action-icon-btn" title="删除" @click="handleDelete(key.id)">
                <span class="icon ri-delete-bin-line"></span>
              </button>
            </div>
          </template>
        </div>
      </div>
      <div v-if="testError[key.id]" class="test-error-msg">{{ testError[key.id] }}</div>
    </div>
  </div>
</template>

<style scoped>
.model-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1620px;
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
.header-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 14px; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.breadcrumb span { color: #A7A296; }
.breadcrumb span.sep { color: #C9C3B6; }
.breadcrumb span.current { color: #3A3A3A; font-weight: 500; }
.header-title h1 { font-size: 30px; font-weight: 700; color: #1F1D1A; margin: 12px 0 0 0; letter-spacing: -0.5px; font-family: "SourceHanSans-Bold", var(--font-family-cn); line-height: 1.2; }
.header-title p { font-size: 15px; color: #6E6A60; margin: 8px 0 0 0; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.reset-button {
  display: inline-flex; align-items: center; gap: 8px; padding: 0 20px; height: 48px;
  border: 0.7px solid #E8E4D8; background-color: #FFFFFF; border-radius: 12px;
  font-size: 15px; color: #3A3A3A; cursor: pointer; transition: all 0.2s; flex-shrink: 0;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.reset-button:hover { background-color: #F7F4EA; }
.reset-button .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 18px; }

.section-card {
  background-color: #FFFFFF;
  border: 0.7px solid #EFECE3;
  border-radius: 16px;
  padding: 24px 40px;
}
.card-title { font-size: 17px; font-weight: 500; color: #1F1D1A; font-family: "SourceHanSans-Medium", var(--font-family-cn); }
.card-desc { font-size: 13px; color: #8A8578; margin-top: 6px; font-family: "SourceHanSans-Regular", var(--font-family-cn); }

/* 模型选择列表 */
.model-select-list { margin-top: 20px; display: flex; flex-direction: column; gap: 4px; }
.model-group-label { font-size: 11px; color: #8A8578; font-weight: 500; padding: 12px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.model-option {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; border-radius: 12px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  border: 0.7px solid transparent;
}
.model-option:hover { background-color: #FBF7F0; }
.model-option.active { background-color: #FBF5E6; border-color: #E0C98A; }
.model-option-icon {
  width: 36px; height: 36px; border-radius: 10px;
  background-color: #F7F3EA; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.model-option.active .model-option-icon { background-color: rgba(196, 164, 92, 0.2); }
.model-option-icon .icon { font-size: 18px; color: #6E6A60; font-family: "remixicon", sans-serif; font-style: normal; }
.model-option.active .model-option-icon .icon { color: #B08D3A; }
.model-option-info { flex: 1; min-width: 0; }
.model-option-name { font-size: 15px; font-weight: 500; color: #1F1D1A; font-family: "SourceHanSans-Medium", var(--font-family-cn); }
.model-option-meta { font-size: 12px; color: #8A8578; margin-top: 2px; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.model-option-check {
  width: 20px; height: 20px; border-radius: 50%;
  background-color: #E0C98A; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s; flex-shrink: 0;
}
.model-option-check.visible { opacity: 1; }
.model-option-check .icon { font-size: 12px; color: #fff; font-family: "remixicon", sans-serif; font-style: normal; }
.model-divider { height: 1px; background-color: #EDE9E0; margin: 8px 0; }

/* 配置表单 */
.config-form-inline {
  display: flex; align-items: flex-end; gap: 16px; margin-top: 24px;
  padding-top: 24px; border-top: 1px solid #F0EDE4;
}
.config-form-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px 32px;
  margin-top: 24px; padding-top: 24px; border-top: 1px solid #F0EDE4;
}
.form-field { display: flex; flex-direction: column; gap: 8px; }
.form-field-key { grid-column: 1 / -1; }
.form-label { font-size: 13px; color: #6E6A60; font-weight: 500; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.form-input {
  height: 44px; padding: 0 16px;
  border: 0.7px solid #E5DFD3; border-radius: 10px;
  background-color: #FAF8F0; font-size: 14px; color: #1F1D1A;
  outline: none; transition: border-color 0.2s;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.form-input:focus { border-color: #B08D3A; background-color: #fff; }
.form-input::placeholder { color: #C9C3B6; }

.api-key-row { position: relative; flex: 1; }
.api-key-row .form-input { padding-right: 48px; width: 100%; box-sizing: border-box; }
.key-toggle {
  position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
  font-size: 18px; color: #A7A296; cursor: pointer;
  font-family: "remixicon", sans-serif; font-style: normal;
  transition: color 0.15s;
}
.key-toggle:hover { color: #6E6A60; }

.format-tabs { display: flex; gap: 4px; background: #F7F3EA; border-radius: 10px; padding: 4px; width: fit-content; }
.format-tab {
  padding: 8px 20px; border-radius: 8px; border: none;
  background: transparent; font-size: 13px; color: #6E6A60;
  cursor: pointer; font-family: "SourceHanSans-Regular", var(--font-family-cn);
  transition: all 0.15s;
}
.format-tab.active { background: #C6A45C; color: #fff; font-weight: 600; }

.btn-save {
  height: 44px; padding: 0 28px; border: none; border-radius: 10px;
  background: #C6A45C; color: #fff; font-size: 15px; font-weight: 500;
  cursor: pointer; font-family: "SourceHanSans-Medium", var(--font-family-cn);
  transition: background 0.2s, transform 0.1s; white-space: nowrap;
}
.btn-save:hover { background: #B8944A; }
.btn-save:active { transform: scale(0.97); }
.form-actions { margin-top: 20px; display: flex; justify-content: flex-end; }

/* 已保存配置 */
.saved-keys-list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.saved-key-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 0.7px solid #EFECE3;
  border-radius: 12px;
  background: #FCFBF8;
  transition: background 0.15s;
}
.saved-key-item:hover { background: #FDFBF5; }
.saved-key-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.saved-key-provider { font-size: 14px; font-weight: 500; color: #1F1D1A; font-family: "SourceHanSans-Medium", var(--font-family-cn); }
.saved-key-model { font-size: 12px; color: #8A8578; font-family: "SourceHanSans-Regular", var(--font-family-cn); display: flex; align-items: center; gap: 8px; }
.saved-key-endpoint { font-size: 11px; color: #A7A296; font-family: monospace; }
.saved-key-actions { display: flex; align-items: center; gap: 6px; }
.saved-key-masked { font-size: 13px; color: #A7A296; font-family: monospace; padding: 0 8px; }

.action-icon-btn {
  width: 32px; height: 32px; border: none; border-radius: 8px;
  background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s; position: relative;
}
.action-icon-btn:hover { background: rgba(196, 164, 92, 0.12); }
.action-icon-btn.on:hover { background: rgba(196, 58, 49, 0.08); }
.action-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-icon-btn .icon { font-size: 16px; color: #8A8578; font-family: "remixicon", sans-serif; font-style: normal; transition: color 0.15s; }
.action-icon-btn:hover .icon { color: #B08D3A; }
.action-icon-btn .icon.spinning { animation: spin 1s linear infinite; }
.action-icon-btn .icon.success { color: #2D8A4E; }
.action-icon-btn .icon.failed { color: #C9503C; }
.action-icon-btn .icon.ri-checkbox-circle-line { color: #2D8A4E; }
.action-icon-btn .icon.ri-radio-button-line { color: #C9C3B6; }

.test-error-msg {
  margin-top: 8px; font-size: 12px; color: #C9503C;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* 编辑表单 */
.edit-form {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 12px 16px;
  padding: 16px;
  background: #FBF7F0;
  border-radius: 10px;
  align-items: start;
}
.edit-form .form-field { grid-column: 2; }
.edit-form .form-label { margin-bottom: 0; }
.edit-actions { grid-column: 2; display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
.btn-sm {
  height: 34px; padding: 0 16px; border-radius: 8px; font-size: 13px;
  cursor: pointer; font-family: "SourceHanSans-Regular", var(--font-family-cn);
  transition: all 0.15s; border: none;
}
.btn-sm.cancel { background: #F7F3EA; color: #6E6A60; }
.btn-sm.cancel:hover { background: #EDE9E0; }
.btn-sm.save { background: #C6A45C; color: #fff; }
.btn-sm.save:hover { background: #B8944A; }
</style>
