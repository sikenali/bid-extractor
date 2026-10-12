<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import apiClient from '@/api/client';
import { UiInput, UiSwitch, UiModal } from '@/components/ui';

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  type: string;
  enabled: boolean;
}

const templates = ref<TemplateItem[]>([]);
const loading = ref(false);
const viewMode = ref<'list' | 'grid'>('list');
const searchQuery = ref('');
const showAddDialog = ref(false);
const newTemplateName = ref('');
const newTemplateDesc = ref('');
const newTemplateCategory = ref('');

async function loadTemplates() {
  loading.value = true;
  try {
    const res = await apiClient.get('/settings/templates');
    templates.value = ((res.data.templates || []) as any[]).map((t: any) => ({
      ...t,
      enabled: t.enabled ?? true,
    }));
  } catch {
    templates.value = getPlaceholderTemplates();
  } finally {
    loading.value = false;
  }
}

function getPlaceholderTemplates(): TemplateItem[] {
  return [
    { id: 'tpl-1', name: '商务标 · 通用章节模板', description: '含投标函、授权委托书、工程量清单等 12 个章节', category: '商务标', type: 'bidding', enabled: true },
    { id: 'tpl-2', name: '技术标 · 施工组织设计模板', description: '覆盖施工方案、进度计划、质量与安全保障措施', category: '技术标', type: 'bidding', enabled: true },
    { id: 'tpl-3', name: '资格标 · 资质业绩模板', description: '营业执照、资质证书、类似项目业绩汇总表', category: '资格标', type: 'bidding', enabled: true },
    { id: 'tpl-4', name: '报价标 · 清单报价模板', description: '分部分项、措施项目、规费税金标准表式', category: '报价标', type: 'bidding', enabled: true },
    { id: 'tpl-5', name: '封面目录 · 标书装帧模板', description: '统一封面、目录、页眉页脚与装订顺序', category: '排版', type: 'custom', enabled: true },
    { id: 'tpl-6', name: '承诺函 · 合规声明模板', description: '廉政承诺、质保承诺、售后服务承诺标准文案', category: '合规', type: 'custom', enabled: true },
  ];
}

const filteredTemplates = ref<TemplateItem[]>([]);

function applyFilter() {
  let list = templates.value;
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }
  filteredTemplates.value = list;
}

async function toggleEnabled(tpl: TemplateItem) {
  tpl.enabled = !tpl.enabled;
  ElMessage.success(tpl.enabled ? `已启用「${tpl.name}」` : `已停用「${tpl.name}」`);
}

async function handleDelete(tpl: TemplateItem) {
  try {
    await ElMessageBox.confirm(`确定删除模板「${tpl.name}」？`, '确认删除');
    await apiClient.delete(`/settings/templates/${tpl.id}`);
    templates.value = templates.value.filter(t => t.id !== tpl.id);
    applyFilter();
    ElMessage.success('已删除');
  } catch { /* cancelled */ }
}

async function handleAdd() {
  if (!newTemplateName.value.trim()) {
    ElMessage.warning('请输入模板名称'); return;
  }
  try {
    const res: any = await apiClient.post('/settings/templates', {
      name: newTemplateName.value.trim(),
      description: newTemplateDesc.value.trim(),
      category: newTemplateCategory.value.trim() || '自定义',
      type: 'custom',
    });
    templates.value.unshift({ ...res.data, enabled: true });
    showAddDialog.value = false;
    newTemplateName.value = '';
    newTemplateDesc.value = '';
    newTemplateCategory.value = '';
    applyFilter();
    ElMessage.success('已添加');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '添加失败');
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm('确定恢复默认模板？自定义模板将被清除。', '确认恢复默认');
    templates.value = getPlaceholderTemplates();
    filteredTemplates.value = templates.value;
    ElMessage.success('已恢复默认模板');
  } catch { /* cancelled */ }
}

onMounted(() => {
  loadTemplates().then(applyFilter);
});
</script>

<template>
  <div class="template-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span><span class="sep">/</span>
            <span>设置中心</span><span class="sep">/</span>
            <span class="current">模板管理</span>
          </div>
          <div class="header-title">
            <h1>模板管理</h1>
            <p>维护标书章节模板与排版模板，可在编辑文书时一键套用</p>
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
        <button class="btn-add" @click="showAddDialog = true">
          <span class="icon ri-add-line"></span>
          <span>新增模板</span>
        </button>
      </div>
      <div class="toolbar-right">
        <UiInput
          v-model="searchQuery"
          type="search"
          class="toolbar-search"
          placeholder="搜索模板名称或描述"
          clearable
          @update:modelValue="applyFilter"
        />
        <div class="view-toggle">
          <button class="view-btn" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'" title="列表视图">
            <span class="icon ri-layout-column-line"></span>
          </button>
          <button class="view-btn" :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'" title="网格视图">
            <span class="icon ri-layout-grid-line"></span>
          </button>
        </div>
      </div>
    </div>

    <!-- 列表视图 -->
    <div v-if="viewMode === 'list'" class="list-container">
      <div class="table-card">
        <table class="list-table">
          <thead>
            <tr>
              <th class="col-name">模板名称</th>
              <th class="col-desc">模板描述</th>
              <th class="col-action">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tpl in filteredTemplates" :key="tpl.id" class="list-row">
              <td class="col-name">
                <span class="row-name">{{ tpl.name }}</span>
                <span class="row-category">{{ tpl.category }}</span>
              </td>
              <td class="col-desc">
                <span class="row-desc">{{ tpl.description }}</span>
              </td>
              <td class="col-action">
                <div class="row-actions">
                  <button class="action-btn edit" @click="ElMessage.info('编辑功能开发中')">修改</button>
                  <button class="action-btn delete" @click="handleDelete(tpl)">删除</button>
                  <UiSwitch :model-value="tpl.enabled" size="sm" @update:model-value="toggleEnabled(tpl)" />
                </div>
              </td>
            </tr>
            <tr v-if="filteredTemplates.length === 0" class="empty-row">
              <td colspan="3" class="empty-cell">暂无模板</td>
            </tr>
          </tbody>
        </table>
        <div class="table-footer">
          共 {{ filteredTemplates.length }} 个模板
        </div>
      </div>
    </div>

    <!-- 网格视图 -->
    <div v-else class="grid-container">
      <div class="grid-cards">
        <div
          v-for="tpl in filteredTemplates"
          :key="tpl.id"
          class="grid-card"
        >
          <div class="grid-card-body">
            <div class="grid-card-icon">{{ tpl.category }}</div>
            <div class="grid-card-title">{{ tpl.name }}</div>
            <div class="grid-card-desc">{{ tpl.description }}</div>
          </div>
          <div class="grid-card-footer">
            <div class="grid-card-actions">
              <button class="action-btn edit" @click="ElMessage.info('编辑功能开发中')">修改</button>
              <button class="action-btn delete" @click="handleDelete(tpl)">删除</button>
              <UiSwitch :model-value="tpl.enabled" size="sm" @update:model-value="toggleEnabled(tpl)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增模板弹窗 -->
    <UiModal
      v-model="showAddDialog"
      title="新增模板"
      subtitle="填写模板基本信息，创建后可在列表中启用"
      icon="ri-add-line"
      :width="560"
      @confirm="handleAdd"
    >
      <div class="form-group">
        <label class="form-label">模板名称 <span class="required">*</span></label>
        <UiInput v-model="newTemplateName" placeholder="请输入模板名称" />
      </div>
      <div class="form-group">
        <label class="form-label">模板描述</label>
        <UiInput v-model="newTemplateDesc" multiline :rows="3" placeholder="请输入模板描述（可选）" />
      </div>
      <div class="form-group">
        <label class="form-label">所属分类</label>
        <UiInput v-model="newTemplateCategory" placeholder="例如：商务标、技术标" />
      </div>
    </UiModal>
  </div>
</template>

<style scoped>
.template-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1620px;
}

/* 页面头部 */
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

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.toolbar-left { display: flex; gap: 12px; align-items: center; }
.toolbar-right { display: flex; align-items: center; gap: 12px; }
.btn-add {
  display: inline-flex; align-items: center; gap: 8px; padding: 0 20px; height: 46px;
  border: none; border-radius: 10px; background: #C6A45C; color: #fff;
  font-size: 16px; font-weight: 500; cursor: pointer;
  font-family: "SourceHanSans-Medium", var(--font-family-cn); transition: all 0.2s;
}
.btn-add:hover { background: #B8944A; }
.btn-add .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 20px; }
.toolbar-search { width: 548px; }
.view-toggle {
  display: flex; border: 0.7px solid #E8E4D8; border-radius: 12px; padding: 4px;
  background: #fff; gap: 4px;
}
.view-btn {
  width: 54px; height: 38px; border: none; border-radius: 9px; background: transparent;
  display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
}
.view-btn .icon {
  font-family: "remixicon", sans-serif; font-style: normal; font-size: 18px; color: #8A8578;
}
.view-btn.active { background: #F6EEDA; }
.view-btn.active .icon { color: #B08D3A; }

/* 列表视图 */
.list-container { background-color: #FFFFFF; border: 0.7px solid #EFECE3; border-radius: 16px; overflow: hidden; }
.table-card { background: #fff; }
.list-table { width: 100%; border-collapse: collapse; }
.list-table thead { background-color: #F7F4EA; }
.list-table th {
  text-align: left; font-size: 15px; font-weight: 400; color: #6E6A60;
  padding: 0 40px; height: 52px; font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.list-table th:last-child { text-align: right; }
.list-table td { padding: 0 40px; height: 76px; vertical-align: middle; border-bottom: 0.7px solid #F0EDE4; }
.list-table td:last-child { text-align: right; }
.col-name { width: 430px; flex-shrink: 0; }
.col-desc { flex: 1; }
.col-action { width: 260px; flex-shrink: 0; }
.row-name {
  display: block; font-size: 16px; font-weight: 500; color: #1F1D1A;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.row-category {
  display: block; font-size: 12px; color: #8A8578; margin-top: 2px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.row-desc { font-size: 15px; color: #6E6A60; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 24px; }

/* 操作按钮（与技能管理一致） */
.row-actions .action-btn {
  font-size: 15px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.2s;
}
.row-actions .action-btn.edit {
  color: #4A72A8;
}
.row-actions .action-btn.delete {
  color: #C9503C;
}
.row-actions .action-btn:hover {
  opacity: 0.7;
}

/* 开关已统一为 UiSwitch，样式见 components/ui */
.empty-row td { text-align: center; color: #A7A296; font-size: 14px; padding: 40px; }
.table-footer {
  padding: 0 40px; height: 54px; display: flex; align-items: center;
  font-size: 14px; color: #A7A296; font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

/* 网格视图 */
.grid-container { display: flex; flex-direction: column; gap: 20px; }
.grid-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.grid-card {
  border: 0.7px solid #EFECE3; border-radius: 14px; background: #fff;
  overflow: hidden; display: flex; flex-direction: column;
  transition: box-shadow 0.2s; min-height: 220px;
}
.grid-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.grid-card-body { padding: 24px; display: flex; flex: 1; flex-direction: column; gap: 8px; }
.grid-card-icon {
  display: inline-block; padding: 4px 12px; border-radius: 20px;
  background: #F7F3EA; font-size: 12px; color: #8A8578;
  font-family: "SourceHanSans-Regular", var(--font-family-cn); width: fit-content;
}
.grid-card-title { font-size: 17px; font-weight: 500; color: #1F1D1A; font-family: "SourceHanSans-Medium", var(--font-family-cn); margin: 0; }
.grid-card-desc { font-size: 14px; color: #6E6A60; font-family: "SourceHanSans-Regular", var(--font-family-cn); flex: 1; }
.grid-card-footer { padding: 16px 24px; border-top: 1px solid #F0EDE4; display: flex; justify-content: flex-end; }
.grid-card-actions { display: flex; align-items: center; gap: 12px; }
.grid-card-actions .action-btn {
  font-size: 14px; font-family: "SourceHanSans-Regular", var(--font-family-cn);
  background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 6px;
  transition: background 0.15s;
}
.grid-card-actions .action-btn.edit { color: #4A72A8; }
.grid-card-actions .action-btn.edit:hover { background: rgba(74, 114, 168, 0.08); }
.grid-card-actions .action-btn.delete { color: #C9503C; }
.grid-card-actions .action-btn.delete:hover { background: rgba(201, 80, 60, 0.08); }

@media (max-width: 1200px) { .grid-cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .grid-cards { grid-template-columns: 1fr; } }

/* 弹窗表单（壳已统一为 UiModal） */
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-label { font-size: 14px; color: #3A3A3A; font-weight: 500; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.form-label .required { color: #C0392B; }
.form-group .ui-input { width: 100%; }
</style>
