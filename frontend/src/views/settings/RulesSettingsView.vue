<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import RuleDialog from '@/components/settings/RuleDialog.vue';
import apiClient from '@/api/client';

interface RuleItem {
  id: string;
  name: string;
  description: string;
}

const rules = ref<RuleItem[]>([
  { id: '1', name: '废标条款强制校对', description: '命中未按要求签字盖章等红线时阻断提交' },
  { id: '2', name: '报价一致性校验', description: '校验大写金额、单价×数量与合价是否一致' },
  { id: '3', name: '工期承诺合规检查', description: '检查工期是否超出招标文件最大限定天数' },
  { id: '4', name: '资质门槛匹配规则', description: '比对业绩数量、证书等级是否满足准入条件' },
  { id: '5', name: '敏感信息脱敏规则', description: '自动识别并遮挡身份证号、银行账号与联系方式' },
  { id: '6', name: '字体字号统一规则', description: '正文仿宋 GB2312 三号、行距固定值 28 磅' },
]);

const showRuleDialog = ref(false);
const dialogMode = ref<'regex' | 'keyword'>('regex');
const editingRule = ref<{ id: string; fieldName: string; pattern: string } | null>(null);

function handleAddRule(mode: 'regex' | 'keyword') {
  dialogMode.value = mode;
  editingRule.value = null;
  showRuleDialog.value = true;
}

function handleEditRule(rule: RuleItem) {
  dialogMode.value = 'regex';
  editingRule.value = { id: rule.id, fieldName: rule.name, pattern: rule.description };
  showRuleDialog.value = true;
}

async function handleResetRules() {
  try {
    await ElMessageBox.confirm('确定恢复默认规则？当前自定义规则将被清空。', '确认恢复默认');
    await apiClient.post('/rules/reset');
    ElMessage.success('已恢复默认规则');
    rules.value = [
      { id: '1', name: '废标条款强制校对', description: '命中未按要求签字盖章等红线时阻断提交' },
      { id: '2', name: '报价一致性校验', description: '校验大写金额、单价×数量与合价是否一致' },
      { id: '3', name: '工期承诺合规检查', description: '检查工期是否超出招标文件最大限定天数' },
      { id: '4', name: '资质门槛匹配规则', description: '比对业绩数量、证书等级是否满足准入条件' },
      { id: '5', name: '敏感信息脱敏规则', description: '自动识别并遮挡身份证号、银行账号与联系方式' },
      { id: '6', name: '字体字号统一规则', description: '正文仿宋 GB2312 三号、行距固定值 28 磅' },
    ];
  } catch { /* cancelled */ }
}

function handleDeleteRule(id: string) {
  if (confirm('确定要删除此规则吗？')) {
    rules.value = rules.value.filter(r => r.id !== id);
  }
}

function handleRuleSubmit(data: { fieldName: string; pattern: string; category: string }) {
  showRuleDialog.value = false;
  if (editingRule.value) {
    const rule = rules.value.find(r => r.id === editingRule.value?.id);
    if (rule) {
      rule.name = data.fieldName;
      rule.description = data.pattern;
    }
  } else {
    rules.value.push({
      id: Date.now().toString(),
      name: data.fieldName,
      description: data.pattern
    });
  }
}
</script>

<template>
  <div class="rules-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span class="sep">/</span>
            <span>设置中心</span>
            <span class="sep">/</span>
            <span class="current">规则管理</span>
          </div>
          <div class="header-title">
            <h1>规则管理</h1>
            <p>配置标书生成与校验环节的强制规则，命中即拦截或预警</p>
          </div>
        </div>
        <button class="reset-button" @click="handleResetRules">
          <span class="icon ri-restart-line"></span>
          恢复默认
        </button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar-card">
      <div class="toolbar-left">
        <button class="add-rule-button" @click="handleAddRule('regex')">
          <span class="icon ri-add-line"></span>
          <span>新增规则</span>
        </button>
      </div>
      <div class="toolbar-right">
        <div class="search-box">
          <span class="icon ri-search-line"></span>
          <span>搜索规则名称或描述</span>
        </div>
      </div>
    </div>

    <!-- 规则表格 -->
    <div class="table-card">
      <table class="rule-table">
        <thead>
          <tr>
            <th>规则名称</th>
            <th>规则描述</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rule in rules" :key="rule.id">
            <td class="rule-name">{{ rule.name }}</td>
            <td class="rule-desc">{{ rule.description }}</td>
            <td class="rule-actions">
              <span class="action-link edit" @click="handleEditRule(rule)">修改</span>
              <span class="action-link delete" @click="handleDeleteRule(rule.id)">删除</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="table-footer">
        共 18 条规则 · 已启用 14 · 当前显示 1-6
      </div>
    </div>

    <RuleDialog
      v-model:visible="showRuleDialog"
      :mode="dialogMode"
      :edit-rule="editingRule"
      @close="showRuleDialog = false"
      @submit="handleRuleSubmit"
    />
  </div>
</template>

<style scoped>
.rules-view {
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

.toolbar-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.toolbar-left .add-rule-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  height: 46px;
  background-color: var(--color-primary, #C0392B);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  transition: all 0.2s;
}
.add-rule-button:hover {
  filter: brightness(1.05);
}
.add-rule-button .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
}
.toolbar-right .search-box {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 46px;
  width: 548px;
  border: 0.7px solid var(--color-border, #E5DFD3);
  background-color: var(--color-bg-white, #FFFFFF);
  border-radius: 10px;
  font-size: 15px;
  color: var(--color-text-faint, #A7A296);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.search-box .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
  color: var(--color-text-faint, #A7A296);
}

.table-card {
  background-color: var(--color-bg-white, #FFFFFF);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 16px;
  overflow: hidden;
}
.rule-table {
  width: 100%;
  border-collapse: collapse;
}
.rule-table thead {
  background-color: var(--color-bg-secondary, #F7F3EA);
}
.rule-table thead tr th {
  text-align: left;
  font-size: 15px;
  font-weight: 400;
  color: var(--color-text-secondary, #6E6A60);
  padding: 0 40px;
  height: 52px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.rule-table thead tr th:last-child {
  text-align: right;
}
.rule-table tbody tr td {
  padding: 0 40px;
  height: 76px;
  vertical-align: middle;
  border-bottom: 0.7px solid var(--color-border-soft, #EDE9E0);
}
.rule-table tbody tr td:last-child {
  text-align: right;
}
.rule-name {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.rule-desc {
  font-size: 15px;
  color: var(--color-text-secondary, #6E6A60);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.rule-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 36px;
}
.action-link {
  font-size: 15px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  cursor: pointer;
}
.action-link.edit {
  color: var(--color-info, #4A72A8);
}
.action-link.delete {
  color: var(--color-error, #E74C3C);
}
.table-footer {
  padding: 0 40px;
  height: 54px;
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--color-text-faint, #A7A296);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
</style>