<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getRules, addRule, updateRule, deleteRule } from '@/api/rules';
import apiClient from '@/api/client';
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
  { key: 'score', label: '评分标准', sublabel: '专家评分标准表' },
  { key: 'seal', label: '封标标准', sublabel: '封装密封及递交要求' },
  { key: 'star', label: '标星信息', sublabel: '★▲等重要标识条款' },
];

const rulesByGroup = ref<Record<string, Rule[]>>({
  info: [],
  business: [],
  tech: [],
  score: [],
  seal: [],
  star: [],
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
  for (const g of ['info', 'business', 'tech', 'score', 'seal', 'star']) {
    await loadRules(g);
  }
}

onMounted(async () => {
  await loadAllRules();
  await loadSuggestions();
});

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

const regexRules = computed(() =>
  (rulesByGroup.value[activeSection.value] || []).filter(r => r.category === 'regex')
);

const keywordRules = computed(() =>
  (rulesByGroup.value[activeSection.value] || []).filter(r => r.category === 'keyword')
);

const suggestions = ref<{ field: string; pattern: string; category: string }[]>([]);
const addingFields = ref<Set<string>>(new Set());

async function loadSuggestions() {
  try {
    const res = await apiClient.get<{ field: string; pattern: string; category: string }[]>(
      `/rules/suggestions/${activeSection.value}`
    );
    suggestions.value = res.data;
  } catch {
    suggestions.value = [];
  }
}

async function addSuggestion(field: string) {
  addingFields.value.add(field);
  try {
    await addRule({
      fieldName: field,
      pattern: '',
      enabled: true,
      category: 'keyword',
      groupName: activeSection.value
    });
    ElMessage.success(`已添加「${field}」`);
    await loadRules(activeSection.value);
    await loadSuggestions();
  } catch {
    ElMessage.error('添加失败');
  } finally {
    addingFields.value.delete(field);
  }
}

async function addAllSuggestions() {
  const fields = suggestions.value.map(s => s.field);
  try {
    await apiClient.post('/rules/suggestions/batch-add', {
      group: activeSection.value,
      fields
    });
    ElMessage.success(`已添加 ${fields.length} 个关键字`);
    await loadRules(activeSection.value);
    await loadSuggestions();
  } catch {
    ElMessage.error('批量添加失败');
  }
}

watch(activeSection, () => {
  loadSuggestions();
});

</script>

<template>
  <div class="settings-content">
    <div class="tab-content">
    <h2 class="page-title">规则设置</h2>
    <p class="page-desc">配置提取规则、正则表达式及关键字匹配</p>

    <div class="tabs-bar">
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
    </div>

    <!-- Regex Rules Section -->
    <div class="rule-card">
      <div class="card-header">
        <div class="card-title-group">
          <div class="card-icon">
            <span class="icon ri-code-line"></span>
          </div>
          <div>
            <div class="card-title">正则表达式规则</div>
            <div class="card-subtitle">用于匹配和提取招标文件中的结构化字段</div>
          </div>
        </div>
        <button class="btn-add" @click="handleAddRule('regex')">
          <span class="icon ri-add-line"></span>
          <span>添加规则</span>
        </button>
      </div>

      <div class="regex-rules">
        <table class="rule-table">
          <thead>
            <tr>
              <th class="col-field">字段名称</th>
              <th class="col-pattern">正则表达式</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rule in regexRules" :key="rule.id">
              <td :title="rule.fieldName">{{ rule.fieldName }}</td>
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
        <div v-if="regexRules.length === 0" class="empty-hint">暂无正则规则</div>
      </div>
    </div>

    <!-- Keyword Rules Section -->
    <div class="rule-card">
      <div class="card-header">
        <div class="card-title-group">
          <div class="card-icon card-icon-keyword">
            <span class="icon ri-font-size-2"></span>
          </div>
          <div>
            <div class="card-title">关键字匹配规则</div>
            <div class="card-subtitle">通过关键字定位招标文件中的关键段落</div>
          </div>
        </div>
        <button class="btn-add" @click="handleAddRule('keyword')">
          <span class="icon ri-add-line"></span>
          <span>添加关键字</span>
        </button>
      </div>

      <div class="keyword-tags">
        <div
          v-for="rule in keywordRules"
          :key="rule.id"
          class="keyword-tag"
        >
          <span class="tag-text">{{ rule.fieldName }}</span>
          <span class="tag-close" @click="handleDeleteRule(rule.id)"><span class="icon ri-close-line"></span></span>
        </div>
        <div v-if="keywordRules.length === 0" class="empty-hint">暂无关键字规则</div>
      </div>

      <div v-if="suggestions.length > 0" class="suggestions-section">
        <div class="suggestions-header">
          <span class="suggestions-title">词汇建议</span>
          <button class="btn-add-all" @click="addAllSuggestions">一键添加全部 ({{ suggestions.length }})</button>
        </div>
        <div class="suggestions-tags">
          <div
            v-for="s in suggestions"
            :key="s.field"
            class="suggestion-tag"
            :class="{ adding: addingFields.has(s.field) }"
            @click="addSuggestion(s.field)"
          >
            <span class="suggestion-icon ri-add-line"></span>
            <span class="suggestion-text">{{ s.field }}</span>
          </div>
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

    </div>
  </div>
</template>

<style scoped>
.settings-content {
  flex: 1;
  padding: 32px;
  max-width: 1600px;
  background-color: var(--color-bg-main);
  min-height: 100vh;
}

.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 4px 0; }
.page-desc { font-size: 14px; color: var(--color-text-muted); margin: 0 0 28px 0; }

.tabs-bar { margin-bottom: 28px; }
.tabs-inner {
  display: inline-flex;
  gap: 4px;
  background: var(--color-bg-secondary);
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
.tab-item:hover { background: rgba(255,255,255,0.5); }
.tab-item.active { background: var(--color-bg-white); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.tab-label { font-size: 14px; font-weight: 500; color: var(--color-text-secondary); line-height: 1.4; white-space: nowrap; }
.tab-item.active .tab-label { color: var(--color-text-primary); font-weight: 600; }
.tab-sublabel { font-size: 10px; color: var(--color-text-muted); line-height: 1.3; margin-top: 1px; white-space: nowrap; }
.tab-item.active .tab-sublabel { color: var(--color-text-secondary); }

.rule-card {
  background-color: var(--color-bg-white);
  border: 0.7px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.card-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-icon {
  width: 36px;
  height: 36px;
  background-color: var(--color-bg-card);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--color-text-primary);
  flex-shrink: 0;
}

.card-icon .icon { font-family: "remixicon", sans-serif; font-style: normal; }

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.3;
}

.card-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.3;
  margin-top: 2px;
}

.btn-add {
  height: 36px;
  padding: 0 16px;
  background-color: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-add .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 14px; }

.regex-rules {
  border: 0.7px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.rule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.rule-table th {
  background-color: var(--color-bg-secondary);
  padding: 12px 16px;
  height: 42px;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  color: var(--color-text-primary);
}

.rule-table td {
  padding: 12px 16px;
  height: 53px;
  font-size: 13px;
  border-top: 1px solid var(--color-bg-secondary);
  vertical-align: middle;
  color: var(--color-text-primary);
}

.col-field { width: 160px; }
.col-pattern { width: auto; }
.col-actions { width: 120px; text-align: center; }

.rule-table th.col-actions { text-align: center; }
.rule-table td:first-child { font-weight: 500; }
.rule-table td:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pattern {
  font-family: monospace;
  font-size: 12px;
  color: var(--color-primary);
  background-color: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
}

.empty-pattern { color: var(--color-text-muted); }
.empty-hint { padding: 32px 0; text-align: center; color: var(--color-text-muted); font-size: 13px; }

.action-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-action {
  width: 28px;
  height: 28px;
  background-color: var(--color-bg-card);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 14px;
  transition: opacity 0.15s;
}

.btn-action .icon { font-family: "remixicon", sans-serif; font-style: normal; }
.btn-action:hover { opacity: 0.8; }
.btn-action.btn-delete { background-color: var(--color-bg-card); color: var(--color-primary); }

.keyword-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.keyword-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background-color: var(--color-bg-card);
  color: var(--color-text-primary);
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 9999px;
}

.tag-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 14px;
  margin-left: 4px;
}

.tag-close .icon { font-family: "remixicon", sans-serif; font-style: normal; }

.suggestions-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}
.suggestions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.suggestions-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
}
.btn-add-all {
  font-size: 12px;
  color: #4f6ef7;
  background: none;
  border: 0.7px solid #4f6ef7;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-add-all:hover {
  background-color: #4f6ef7;
  color: #fff;
}
.suggestions-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.suggestion-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px dashed var(--color-border);
  border-radius: 9999px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background-color: var(--color-bg-main);
  cursor: pointer;
  transition: all 0.2s;
}
.suggestion-tag:hover {
  border-color: #4f6ef7;
  color: #4f6ef7;
  background-color: rgba(79, 110, 247, 0.05);
}
.suggestion-tag.adding {
  opacity: 0.5;
  pointer-events: none;
}
.suggestion-icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 12px;
}
</style>
