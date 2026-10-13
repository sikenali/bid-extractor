<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import apiClient from '@/api/client';
import { UiInput, UiSwitch, UiModal } from '@/components/ui';

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  biz_type: string;
  template_text: string;
  variables: string[];
  enable: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

const templates = ref<PromptTemplate[]>([]);
const loading = ref(false);
const showEditDialog = ref(false);
const editingTemplate = ref<PromptTemplate | null>(null);
const editName = ref('');
const editDescription = ref('');
const editTemplateText = ref('');
const editBizType = ref('info');
const searchTerm = ref('');

const GROUP_LABELS: Record<string, string> = {
  info: '项目信息',
  business: '商务条款',
  tech: '技术条款',
  score: '评分标准',
  seal: '封标信息',
  star: '标星条款',
};

async function loadTemplates() {
  loading.value = true;
  try {
    const res = await apiClient.get<PromptTemplate[]>('/llm-prompts');
    templates.value = res.data;
  } catch {
    ElMessage.error('加载提示词模板失败');
  } finally {
    loading.value = false;
  }
}

function openEdit(template?: PromptTemplate) {
  if (template) {
    editingTemplate.value = template;
    editName.value = template.name;
    editDescription.value = template.description;
    editTemplateText.value = template.template_text;
    editBizType.value = template.biz_type;
  } else {
    editingTemplate.value = null;
    editName.value = '';
    editDescription.value = '';
    editTemplateText.value = '';
    editBizType.value = 'info';
  }
  showEditDialog.value = true;
}

async function confirmEdit() {
  if (!editName.value.trim() || !editTemplateText.value.trim()) {
    ElMessage.warning('请输入模板名称和提示词内容');
    return;
  }
  try {
    if (editingTemplate.value) {
      await apiClient.put(`/llm-prompts/${editingTemplate.value.id}`, {
        name: editName.value.trim(),
        description: editDescription.value.trim(),
        template_text: editTemplateText.value,
        biz_type: editBizType.value,
      });
      ElMessage.success('提示词模板已更新');
    } else {
      await apiClient.post('/llm-prompts', {
        name: editName.value.trim(),
        description: editDescription.value.trim(),
        template_text: editTemplateText.value,
        biz_type: editBizType.value,
      });
      ElMessage.success('提示词模板已创建');
    }
    showEditDialog.value = false;
    await loadTemplates();
  } catch {
    ElMessage.error('保存失败');
  }
}

async function toggleEnable(template: PromptTemplate) {
  try {
    await apiClient.put(`/llm-prompts/${template.id}`, {
      enable: template.enable ? 0 : 1,
    });
    template.enable = !template.enable;
    ElMessage.success(template.enable ? '已启用' : '已禁用');
  } catch {
    ElMessage.error('操作失败');
    template.enable = !template.enable;
  }
}

async function handleDelete(template: PromptTemplate) {
  try {
    await ElMessageBox.confirm(`确定删除提示词模板「${template.name}」？`, '确认删除');
    await apiClient.delete(`/llm-prompts/${template.id}`);
    ElMessage.success('已删除');
    await loadTemplates();
  } catch {
    // cancelled
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm('确定恢复默认提示词模板？现有模板将被清除。', '确认恢复默认');
    await apiClient.post('/llm-prompts/reset');
    await loadTemplates();
    ElMessage.success('已恢复默认提示词模板');
  } catch {
    // cancelled
  }
}

onMounted(loadTemplates);
</script>

<template>
  <div class="prompt-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span class="sep">/</span>
            <span>设置中心</span>
            <span class="sep">/</span>
            <span class="current">LLM提示词管理</span>
          </div>
          <div class="header-title">
            <h1>LLM提示词管理</h1>
            <p>统一管理大模型抽取提示词模板，与规则引擎解耦，支持变量占位符</p>
          </div>
        </div>
        <button class="reset-button" @click="handleReset">
          <span class="icon ri-restart-line"></span>
          恢复默认
        </button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn-add" @click="openEdit()">
          <span class="icon ri-add-line"></span>
          <span>新增模板</span>
        </button>
      </div>
      <div class="toolbar-right">
        <UiInput
          v-model="searchTerm"
          type="search"
          class="toolbar-search"
          placeholder="搜索模板名称或描述"
          clearable
        />
      </div>
    </div>

    <!-- 内容区 -->
    <div class="content-area">
      <div v-if="loading" class="loading-state">
        <span class="icon ri-loader-4-line spinning"></span>
        <span>加载中...</span>
      </div>
      <div v-else-if="templates.length === 0" class="empty-state">
        <span class="icon ri-inbox-line"></span>
        <span>暂无提示词模板，点击「新增模板」创建</span>
      </div>
      <div v-else class="template-list">
        <div
          v-for="template in templates.filter(t =>
            !searchTerm || t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.description.toLowerCase().includes(searchTerm.toLowerCase())
          )"
          :key="template.id"
          class="template-card"
          :class="{ disabled: !template.enable }"
        >
          <div class="card-header">
            <div class="card-title-group">
              <span class="card-name">{{ template.name }}</span>
              <span class="card-biz-type">{{ GROUP_LABELS[template.biz_type] || template.biz_type }}</span>
              <span class="card-version">v{{ template.version }}</span>
            </div>
            <UiSwitch :model-value="template.enable" size="sm" @click="toggleEnable(template)" />
          </div>
          <div class="card-description">{{ template.description }}</div>
          <div class="card-preview">
            <pre class="preview-text">{{ template.template_text.slice(0, 150) }}{{ template.template_text.length > 150 ? '...' : '' }}</pre>
          </div>
          <div class="card-footer">
            <button class="action-btn edit" @click="openEdit(template)">编辑</button>
            <button class="action-btn delete" @click="handleDelete(template)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <UiModal
      v-model="showEditDialog"
      :title="editingTemplate ? '编辑提示词模板' : '新增提示词模板'"
      subtitle="配置大模型抽取提示词，支持 {{变量名}} 占位符"
      icon="ri-chat-3-line"
      :width="700"
      @confirm="confirmEdit"
    >
      <div class="form-group">
        <label class="form-label">模板名称 <span class="required">*</span></label>
        <UiInput v-model="editName" placeholder="请输入模板名称" />
      </div>
      <div class="form-group">
        <label class="form-label">关联分类</label>
        <select v-model="editBizType" class="form-select">
          <option value="info">项目信息</option>
          <option value="business">商务条款</option>
          <option value="tech">技术条款</option>
          <option value="score">评分标准</option>
          <option value="seal">封标信息</option>
          <option value="star">标星条款</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">模板描述</label>
        <UiInput v-model="editDescription" multiline :rows="2" placeholder="请输入模板描述（可选）" />
      </div>
      <div class="form-group">
        <label class="form-label">提示词内容 <span class="required">*</span></label>
        <textarea
          v-model="editTemplateText"
          class="form-textarea"
          placeholder="输入提示词内容，可使用 {{chunkText}} 或 {{preExtract}} 作为变量占位符"
          rows="8"
        ></textarea>
        <span class="form-hint">可用变量：&lsquo;{&#123;chunkText&#125;}&apos; - 章节文本，&lsquo;{&#123;preExtract&#125;}&apos; - 预抽取结果</span>
      </div>
    </UiModal>
  </div>
</template>

<style scoped>
.prompt-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1620px;
}

.page-header-card {
  background-color: var(--color-bg-white, #FFFFFF);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
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
  color: var(--color-text-faint, #A7A296);
}

.breadcrumb span.sep {
  color: var(--color-text-faint, #A7A296);
}

.breadcrumb span.current {
  color: var(--color-text-body, #3A3A3A);
  font-weight: 500;
}

.header-title h1 {
  font-size: 30px;
  font-weight: 700;
  color: var(--color-text-primary, #1F1D1A);
  margin: 12px 0 0 0;
  letter-spacing: -0.5px;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  line-height: 1.2;
}

.header-title p {
  font-size: 15px;
  color: var(--color-text-secondary, #6E6A60);
  margin: 8px 0 0 0;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-left {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btn-add {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  height: 46px;
  border: none;
  border-radius: 10px;
  background: var(--color-primary, #C0392B);
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  transition: all 0.2s;
}

.btn-add:hover {
  background: color-mix(in srgb, var(--color-primary, #C0392B) 88%, black);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-search {
  width: 300px;
}

.reset-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  height: 48px;
  border: 0.7px solid var(--color-border, #E5DFD3);
  background-color: var(--color-bg-white, #FFFFFF);
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text-body, #3A3A3A);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.reset-button:hover {
  background-color: var(--color-bg-secondary, #F7F3EA);
}

.reset-button .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
}

.content-area {
  flex: 1;
}

.loading-state, .empty-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 40px;
  color: var(--color-text-muted, #8A8578);
  font-size: 14px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  justify-content: center;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.template-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.template-card {
  background: var(--color-bg-white, #fff);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: box-shadow 0.2s;
}

.template-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.template-card.disabled {
  opacity: 0.6;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.card-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}

.card-biz-type {
  font-size: 12px;
  color: var(--color-text-muted, #8A8578);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.card-version {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--color-bg-secondary, #F7F3EA);
  color: var(--color-text-muted, #8A8578);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  width: fit-content;
}

.card-description {
  font-size: 14px;
  color: var(--color-text-secondary, #6E6A60);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  line-height: 1.5;
}

.card-preview {
  background: var(--color-bg-secondary, #F7F3EA);
  border-radius: 8px;
  padding: 12px;
}

.preview-text {
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-body, #3A3A3A);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border-soft, #EDE9E0);
}

.action-btn {
  font-size: 14px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.action-btn.edit {
  color: var(--color-info, #4A72A8);
}

.action-btn.edit:hover {
  background: rgba(74, 114, 168, 0.08);
}

.action-btn.delete {
  color: var(--color-error, #E74C3C);
}

.action-btn.delete:hover {
  background: rgba(201, 80, 60, 0.08);
}

/* 表单样式 */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.form-label {
  font-size: 14px;
  color: var(--color-text-body, #3A3A3A);
  font-weight: 500;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.form-label .required {
  color: var(--color-primary, #C0392B);
}

.form-select {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--color-border, #E5DFD3);
  border-radius: 8px;
  background: var(--color-bg-white, #fff);
  font-size: 14px;
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  outline: none;
}

.form-select:focus {
  border-color: var(--color-primary, #C0392B);
}

.form-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border, #E5DFD3);
  border-radius: 8px;
  background: var(--color-bg-white, #fff);
  font-size: 14px;
  color: var(--color-text-body, #3A3A3A);
  font-family: monospace;
  resize: vertical;
  outline: none;
}

.form-textarea:focus {
  border-color: var(--color-primary, #C0392B);
}

.form-hint {
  font-size: 12px;
  color: var(--color-text-muted, #8A8578);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
</style>
