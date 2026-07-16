<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getRules, addRule, updateRule, deleteRule } from '@/api/rules';
import RuleDialog from '@/components/settings/RuleDialog.vue';

interface Rule {
  id: string;
  fieldName: string;
  pattern: string;
  enabled: boolean;
  category: string;
  groupName: string;
}

const activeGroup = ref('bidding');

const groups = [
  { key: 'bidding', label: '招标模板' },
  { key: 'proposal', label: '投标模板' },
  { key: 'custom', label: '自定义' }
];

const rulesByGroup = ref<Record<string, Rule[]>>({
  bidding: [],
  proposal: [],
  custom: []
});

const showRuleDialog = ref(false);
const dialogMode = ref<'regex' | 'keyword'>('regex');
const editingRule = ref<{ id: string; fieldName: string; pattern: string } | null>(null);

const tabContainerRef = ref<HTMLElement | null>(null);
const indicatorStyle = ref({ left: '0px', width: '0px' });
const isInitialized = ref(false);

async function loadRules(group: string) {
  try {
    const rules = await getRules(group);
    rulesByGroup.value[group] = rules;
  } catch {
    rulesByGroup.value[group] = [];
  }
}

async function loadAllRules() {
  for (const g of groups.map(g => g.key)) {
    await loadRules(g);
  }
}

onMounted(() => {
  loadAllRules();
  nextTick(() => {
    positionIndicator();
    setTimeout(() => { isInitialized.value = true; }, 150);
  });
});

function positionIndicator() {
  const container = tabContainerRef.value;
  if (!container) return;
  const activeEl = container.querySelector(`[data-tab-key="${activeGroup.value}"]`) as HTMLElement | null;
  if (!activeEl) return;
  const containerRect = container.getBoundingClientRect();
  const elRect = activeEl.getBoundingClientRect();
  indicatorStyle.value = {
    left: `${elRect.left - containerRect.left}px`,
    width: `${elRect.width}px`,
  };
}

function selectGroup(key: string) {
  activeGroup.value = key;
  loadRules(key);
  nextTick(positionIndicator);
}

async function handleAddRule() {
  dialogMode.value = 'regex';
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
        groupName: activeGroup.value
      });
      ElMessage.success('规则已更新');
    } else {
      await addRule({
        fieldName: data.fieldName,
        pattern: data.pattern,
        enabled: true,
        category: data.category,
        groupName: activeGroup.value
      });
      ElMessage.success('规则已添加');
    }
    await loadRules(activeGroup.value);
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
    await loadRules(activeGroup.value);
  } catch {
    // cancelled
  }
}
</script>

<template>
  <div class="settings-content">
    <h2 class="page-title">规则设置</h2>
    <p class="page-desc">管理字段提取规则，按分类组织知识库</p>

    <div ref="tabContainerRef" class="tab-bar">
      <div class="tab-indicator" :class="{ animated: isInitialized }" :style="indicatorStyle"></div>
      <div
        v-for="tab in groups"
        :key="tab.key"
        class="tab-item"
        :data-tab-key="tab.key"
        :class="{ active: activeGroup === tab.key }"
        @click="selectGroup(tab.key)"
      >
        {{ tab.label }}
      </div>
    </div>

    <div class="rule-section">
      <div class="section-header">
        <div class="section-title">
          <div class="section-icon"><span class="icon ri-code-line"></span></div>
          <div>
            <h3>{{ groups.find(g => g.key === activeGroup)?.label }} · 提取规则</h3>
            <p>共 {{ (rulesByGroup[activeGroup] || []).length }} 条规则</p>
          </div>
        </div>
        <button class="btn-add-rule" @click="handleAddRule">
          <span class="icon ri-add-line"></span>
          <span>添加规则</span>
        </button>
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
            <tr v-for="rule in rulesByGroup[activeGroup]" :key="rule.id">
              <td>{{ rule.fieldName }}</td>
              <td>
                <span class="type-tag" :class="rule.category">
                  {{ rule.category === 'keyword' ? '关键字' : '正则' }}
                </span>
              </td>
              <td>
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
        <div v-if="!(rulesByGroup[activeGroup] || []).length" class="empty-state">
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
  </div>
</template>

<style scoped>
.settings-content { flex: 1; padding: 32px; }
.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 4px 0; }
.page-desc { font-size: 14px; color: var(--color-text-muted); margin: 0 0 24px 0; }

.tab-bar { display: inline-flex; background-color: var(--color-bg-card); border-radius: 12px; padding: 4px; margin-bottom: 24px; position: relative; }
.tab-indicator { position: absolute; top: 4px; bottom: 4px; background-color: var(--color-primary); border-radius: 8px; z-index: 0; pointer-events: none; transition: left 0.3s ease-out, width 0.3s ease-out; }
.tab-indicator.animated { transition: left 0.3s ease-out, width 0.3s ease-out; }
.tab-item { position: relative; z-index: 1; padding: 8px 24px; border-radius: 8px; font-size: 13px; cursor: pointer; color: var(--color-text-secondary); transition: color 0.2s; }
.tab-item.active { color: white; font-weight: 600; }

.rule-section { border: 0.7px solid var(--color-border); border-radius: 16px; padding: 24px; margin-bottom: 24px; background-color: white; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.section-title { display: flex; align-items: center; gap: 12px; }
.section-icon { width: 36px; height: 36px; background-color: var(--color-bg-card); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.section-icon .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 18px; color: var(--color-text-secondary); }
.section-title h3 { font-size: 16px; font-weight: 600; color: var(--color-text-primary); margin: 0 0 4px 0; }
.section-title p { font-size: 12px; color: var(--color-text-muted); margin: 0; }
.btn-add-rule { height: 32px; padding: 0 16px; background-color: var(--color-primary); color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.btn-add-rule .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 14px; }

.rule-table-wrapper { border: 0.7px solid var(--color-bg-card); border-radius: 12px; overflow: hidden; }
.rule-table { width: 100%; border-collapse: collapse; }
.rule-table th { background-color: #F5EFE3; padding: 12px 16px; height: 42px; font-size: 13px; font-weight: 600; text-align: left; color: var(--color-text-primary); }
.rule-table td { padding: 12px 16px; height: 53px; font-size: 13px; border-top: 1px solid var(--color-bg-card); vertical-align: middle; }
.rule-table th:first-child, .rule-table td:first-child { width: 140px; }
.rule-table th:nth-child(2), .rule-table td:nth-child(2) { width: 80px; }
.rule-table th:nth-child(3), .rule-table td:nth-child(3) { width: auto; }
.rule-table th:nth-child(4), .rule-table td:nth-child(4) { width: 100px; text-align: center; }
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
</style>
