<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getRules, addRule, updateRule, deleteRule, importSkillMd } from '@/api/rules';
import type { SkillImportResult } from '@/api/rules';
import RuleDialog from '@/components/settings/RuleDialog.vue';

interface Rule {
  id: string;
  fieldName: string;
  pattern: string;
  enabled: boolean;
  category: string;
  groupName: string;
}

const activeSection = ref('info');

const tabItems = [
  { key: 'info', label: '项目信息', sublabel: '招标文件基本信息' },
  { key: 'business', label: '商务条款', sublabel: '招标文件商务偏离表' },
  { key: 'tech', label: '技术条款', sublabel: '招标文件技术偏离表' },
  { key: 'score', label: '评分标准', sublabel: '专家评分标准表' }
];

const rulesByGroup = ref<Record<string, Rule[]>>({
  info: [],
  business: [],
  tech: [],
  score: []
});

const showRuleDialog = ref(false);
const dialogMode = ref<'regex' | 'keyword'>('regex');
const editingRule = ref<{ id: string; fieldName: string; pattern: string } | null>(null);

async function loadRules(group: string) {
  try {
    const rules = await getRules(group);
    rulesByGroup.value[group] = rules;
  } catch {
    rulesByGroup.value[group] = [];
  }
}

async function loadAllRules() {
  for (const g of ['info', 'business', 'tech', 'score']) {
    await loadRules(g);
  }
}

onMounted(loadAllRules);

async function handleAddRule(mode: 'regex' | 'keyword') {
  dialogMode.value = mode;
  editingRule.value = null;
  showRuleDialog.value = true;
}

async function handleEditRule(rule: Rule) {
  dialogMode.value = rule.category === 'keyword' ? 'keyword' : 'regex';
  editingRule.value = { id: rule.id, fieldName: rule.fieldName, pattern: rule.pattern };
  showRuleDialog.value = true;
}

async function handleRuleSubmit(data: { fieldName: string; pattern: string; category: string }) {
  try {
    if (editingRule.value) {
      await updateRule(editingRule.value.id, {
        fieldName: data.fieldName,
        pattern: data.pattern,
        category: data.category,
        groupName: activeSection.value
      });
      ElMessage.success('规则已更新');
    } else {
      await addRule({
        fieldName: data.fieldName,
        pattern: data.pattern,
        enabled: true,
        category: data.category,
        groupName: activeSection.value
      });
      ElMessage.success('规则已添加');
    }
    await loadRules(activeSection.value);
  } catch {
    ElMessage.error('操作失败');
  }
  showRuleDialog.value = false;
}

async function handleDeleteRule(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除此规则吗？', '确认删除');
    await deleteRule(id);
    ElMessage.success('规则已删除');
    await loadRules(activeSection.value);
  } catch {
    // cancelled
  }
}

function selectTab(key: string) {
  activeSection.value = key;
}

const importResult = ref<SkillImportResult | null>(null);
const showImportResult = ref(false);
const importLoading = ref(false);

function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.yaml,.yml';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    importLoading.value = true;
    try {
      const result = await importSkillMd(file);
      importResult.value = result;
      showImportResult.value = true;
      ElMessage.success(`导入成功：${result.count} 条规则`);
      await loadAllRules();
    } catch (err: any) {
      ElMessage.error(err?.response?.data?.error || '导入失败');
    } finally {
      importLoading.value = false;
    }
  };
  input.click();
}
</script>

<template>
  <div class="settings-content">
    <div class="tab-content">
    <h2 class="page-title">规则设置</h2>
    <p class="page-desc">配置提取规则、正则表达式及关键字匹配</p>
    <div class="rule-section">
      <div class="section-header">
        <div class="tabs-inner">
          <div
            v-for="item in tabItems"
            :key="item.key"
            class="tab-item"
            :class="{ active: activeSection === item.key }"
            @click="selectTab(item.key)"
          >
            <div class="tab-label">{{ item.label }}</div>
            <div class="tab-sublabel">{{ item.sublabel }}</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-add-rule" @click="handleAddRule('regex')">
            <span class="icon ri-code-line"></span>
            <span>正则规则</span>
          </button>
          <button class="btn-add-rule btn-add-keyword" @click="handleAddRule('keyword')">
            <span class="icon ri-text-line"></span>
            <span>关键字规则</span>
          </button>
          <button class="btn-import-skill" :disabled="importLoading" @click="triggerImport">
            <span class="icon ri-file-upload-line"></span>
            <span>{{ importLoading ? '导入中...' : '导入 Skill' }}</span>
          </button>
        </div>
      </div>

          <div class="rule-table-wrapper">
            <table class="rule-table">
              <thead>
                <tr>
                  <th>字段名称</th>
                  <th>规则类型</th>
                  <th>正则表达式</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rule in rulesByGroup[activeSection]" :key="rule.id">
                  <td :title="rule.fieldName">{{ rule.fieldName }}</td>
                  <td>
                    <span class="type-tag" :class="rule.category">
                      {{ rule.category === 'keyword' ? '关键字' : '正则' }}
                    </span>
                  </td>
                  <td :title="rule.pattern">
                    <code v-if="rule.pattern" class="pattern">{{ rule.pattern }}</code>
                    <span v-else class="empty-pattern">—</span>
                  </td>
                  <td>
                    <div class="action-buttons">
                      <button class="btn-action" title="编辑" @click="handleEditRule(rule)"><span class="icon ri-pencil-line"></span></button>
                      <button class="btn-action btn-delete" title="删除" @click="handleDeleteRule(rule.id)"><span class="icon ri-delete-bin-line"></span></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="!(rulesByGroup[activeSection] || []).length" class="empty-state">
              暂无规则，点击上方按钮添加
            </div>
          </div>
        </div>

        <RuleDialog
          v-model:visible="showRuleDialog"
          :mode="dialogMode"
          :edit-rule="editingRule"
          @close="showRuleDialog = false"
          @submit="handleRuleSubmit"
 />

        <el-dialog v-model="showImportResult" title="导入结果" width="520px" :close-on-click-modal="false">
          <div v-if="importResult" class="import-result">
            <div class="import-summary">
              <span class="import-badge success">✓ {{ importResult.count }} 条导入</span>
              <span v-if="importResult.skipped.length" class="import-badge skip">⏭ {{ importResult.skipped.length }} 条跳过（已存在）</span>
            </div>
            <p class="import-name">来源：{{ importResult.name }}</p>
            <div v-if="importResult.inserted.length" class="import-list">
              <h4>新增规则</h4>
              <div v-for="r in importResult.inserted" :key="r.field" class="import-item">
                <span class="import-field">{{ r.field }}</span>
                <span class="import-tag" :class="r.category">{{ r.category === 'regex' ? '正则' : '关键字' }}</span>
                <span class="import-group">{{ r.group }}</span>
              </div>
            </div>
            <div v-if="importResult.skipped.length" class="import-list">
              <h4>已跳过（重复）</h4>
              <div v-for="name in importResult.skipped" :key="name" class="import-item">
                <span class="import-field">{{ name }}</span>
                <span class="import-tag skip">已存在</span>
              </div>
            </div>
          </div>
        </el-dialog>
    </div>
  </div>
</template>

<style scoped>
.settings-content {
  flex: 1;
  padding: 32px;
  max-width: 1600px;
}

.tabs-inner {
  display: inline-flex;
  gap: 4px;
  background: #F0E8D5;
  border-radius: 12px;
  padding: 4px;
}
.tab-item {
  padding: 10px 24px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.25s;
  text-align: center;
}
.tab-item:hover {
  background: rgba(255,255,255,0.5);
}
.tab-item.active {
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.tab-label {
  font-size: 14px;
  font-weight: 500;
  color: #8B7355;
  line-height: 1.4;
  white-space: nowrap;
}
.tab-item.active .tab-label {
  color: #3D2B1F;
  font-weight: 600;
}
.tab-sublabel {
  font-size: 10px;
  color: #B8A58C;
  line-height: 1.3;
  margin-top: 1px;
  white-space: nowrap;
}
.tab-item.active .tab-sublabel {
  color: #8B7355;
}

.tab-content {}
.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 4px 0; }
.page-desc { font-size: 14px; color: var(--color-text-muted); margin: 0 0 24px 0; }
.rule-section { border: 0.7px solid var(--color-border); border-radius: 16px; padding: 24px; background-color: white; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.btn-add-rule { height: 32px; padding: 0 16px; background-color: var(--color-primary); color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.btn-add-rule .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 14px; }
.btn-add-keyword { background-color: #8B7355; }

.rule-table-wrapper { border: 0.7px solid var(--color-bg-card); border-radius: 12px; overflow: hidden; }
.rule-table { width: 100%; border-collapse: collapse; }
.rule-table th { background-color: #F5EFE3; padding: 12px 16px; height: 42px; font-size: 13px; font-weight: 600; text-align: left; color: var(--color-text-primary); }
.rule-table td { padding: 12px 16px; height: 53px; font-size: 13px; border-top: 1px solid var(--color-bg-card); vertical-align: middle; }
.rule-table { table-layout: fixed; }
.rule-table th:first-child, .rule-table td:first-child { width: 22%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rule-table th:nth-child(2), .rule-table td:nth-child(2) { width: 10%; }
.rule-table th:nth-child(3), .rule-table td:nth-child(3) { width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rule-table th:nth-child(4), .rule-table td:nth-child(4) { width: 18%; text-align: center; }
.rule-table tr td:first-child { font-weight: 500; color: var(--color-text-primary); }

.type-tag { font-size: 12px; padding: 2px 8px; border-radius: 9999px; }
.type-tag.regex { background-color: #E8F0F8; color: #2D6A9F; }
.type-tag.keyword { background-color: #F0E8D8; color: #8B7355; }

.pattern { font-family: monospace; font-size: 12px; color: #2D6A9F; background-color: var(--color-bg-secondary); padding: 2px 6px; border-radius: 4px; }
.empty-pattern { color: var(--color-text-muted); }

.action-buttons { display: flex; align-items: center; justify-content: center; gap: 8px; }
.btn-action { width: 28px; height: 28px; background-color: #F0E8D8; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #8B7355; font-size: 14px; }
.btn-action .icon { font-family: "remixicon", sans-serif; font-style: normal; }
.btn-action.btn-delete { background-color: #FFEBEE; color: var(--color-primary); }

.empty-state { padding: 48px 0; text-align: center; color: var(--color-text-muted); font-size: 14px; }
.btn-import-skill { height: 32px; padding: 0 16px; background: none; border: 1px solid var(--color-primary); color: var(--color-primary); border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.btn-import-skill:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-import-skill .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 14px; }
.import-result { font-size: 14px; }
.import-summary { display: flex; gap: 12px; margin-bottom: 12px; }
.import-badge { font-size: 13px; padding: 4px 12px; border-radius: 9999px; font-weight: 500; }
.import-badge.success { background-color: #e8faf0; color: #22c55e; }
.import-badge.skip { background-color: #f0e8d8; color: #8b7355; }
.import-name { color: var(--color-text-secondary); margin: 0 0 16px; font-size: 13px; }
.import-list { margin-bottom: 12px; }
.import-list h4 { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: var(--color-text-primary); }
.import-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.import-field { font-weight: 500; color: var(--color-text-primary); min-width: 120px; }
.import-tag { font-size: 11px; padding: 2px 8px; border-radius: 9999px; }
.import-tag.regex { background-color: #e8f0f8; color: #2d6a9f; }
.import-tag.keyword { background-color: #f0e8d8; color: #8b7355; }
.import-tag.skip { background-color: var(--color-bg-card); color: var(--color-text-muted); }
.import-group { font-size: 12px; color: var(--color-text-muted); }
</style>
