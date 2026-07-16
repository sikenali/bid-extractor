<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getRules, addRule, updateRule, deleteRule } from '@/api/rules';
import RuleDialog from '@/components/settings/RuleDialog.vue';

interface RegexRule {
  id: string;
  fieldName: string;
  pattern: string;
  enabled: boolean;
  category: string;
}

const regexRules = ref<RegexRule[]>([]);
const keywords = ref<string[]>([]);
const showRuleDialog = ref(false);
const dialogMode = ref<'regex' | 'keyword'>('regex');
const editingRule = ref<{ id: string; fieldName: string; pattern: string } | null>(null);

async function loadRules() {
  try {
    const all = await getRules();
    regexRules.value = all.filter(r => r.category === 'regex');
    keywords.value = all.filter(r => r.category === 'keyword').map(r => r.fieldName);
  } catch {
    regexRules.value = [];
    keywords.value = [];
  }
}

onMounted(loadRules);

async function handleAddRule() {
  dialogMode.value = 'regex';
  editingRule.value = null;
  showRuleDialog.value = true;
}

async function handleEditRule(rule: RegexRule) {
  dialogMode.value = 'regex';
  editingRule.value = { id: rule.id, fieldName: rule.fieldName, pattern: rule.pattern };
  showRuleDialog.value = true;
}

async function handleAddKeyword() {
  dialogMode.value = 'keyword';
  editingRule.value = null;
  showRuleDialog.value = true;
}

async function handleRuleSubmit(data: { fieldName: string; pattern: string; category: string }) {
  try {
    if (editingRule.value && data.category === 'regex') {
      await updateRule(editingRule.value.id, { fieldName: data.fieldName, pattern: data.pattern });
      ElMessage.success('规则已更新');
    } else if (data.category === 'keyword') {
      if (keywords.value.includes(data.fieldName)) {
        ElMessage.warning('关键字已存在');
        return;
      }
      await addRule({ fieldName: data.fieldName, pattern: '', enabled: true, category: 'keyword' });
      ElMessage.success('关键字已添加');
    } else {
      await addRule({ fieldName: data.fieldName, pattern: data.pattern, enabled: true, category: 'regex' });
      ElMessage.success('规则已添加');
    }
    await loadRules();
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
    await loadRules();
  } catch {
    // cancelled
  }
}

async function removeKeyword(index: number) {
  const kw = keywords.value[index];
  try {
    await ElMessageBox.confirm(`确定要删除关键字 "${kw}" 吗？`, '确认删除');
    const rule = regexRules.value.find(r => r.fieldName === kw);
    if (rule && rule.id) {
      await deleteRule(rule.id);
    }
    ElMessage.success('关键字已删除');
    await loadRules();
  } catch {
    // cancelled
  }
}
</script>

<template>
  <div class="settings-content">
    <h2 class="page-title">规则设置</h2>
    <p class="page-desc">配置提取规则、正则表达式及关键字匹配</p>
    <div class="rule-section">
      <div class="section-header">
        <div class="section-title">
          <div class="section-icon"><span class="icon ri-code-line"></span></div>
          <div>
            <h3>正则表达式规则</h3>
            <p>用于匹配和提取招标文件中的结构化字段</p>
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
              <th>正则表达式</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rule in regexRules" :key="rule.id">
              <td>{{ rule.fieldName }}</td>
              <td><code class="pattern">{{ rule.pattern }}</code></td>
              <td>
                <div class="action-buttons">
                  <button class="btn-action" title="编辑" @click="handleEditRule(rule)"><span class="icon ri-pencil-line"></span></button>
                  <button class="btn-action btn-delete" title="删除" @click="handleDeleteRule(rule.id)"><span class="icon ri-delete-bin-line"></span></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="rule-section">
      <div class="section-header">
        <div class="section-title">
          <div class="section-icon icon-blue">
            <span class="icon ri-key-2-line"></span>
          </div>
          <div>
            <h3>关键字匹配规则</h3>
            <p>通过关键字定位招标文件中的关键段落</p>
          </div>
        </div>
        <button class="btn-add-rule" @click="handleAddKeyword">
          <span class="icon ri-add-line"></span>
          <span>添加关键字</span>
        </button>
      </div>
      <div class="keyword-tags">
        <span v-for="(kw, index) in keywords" :key="kw" class="keyword-tag">
          {{ kw }}
          <span class="icon ri-close-line close-icon" @click="removeKeyword(index)"></span>
        </span>
        <span v-if="keywords.length === 0" class="empty-hint">暂无关键字，点击上方按钮添加</span>
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
.rule-section { border: 0.7px solid var(--color-border); border-radius: 16px; padding: 24px; margin-bottom: 24px; background-color: white; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.section-title { display: flex; align-items: center; gap: 12px; }
.section-icon { width: 36px; height: 36px; background-color: var(--color-bg-card); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.section-icon .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 18px; color: var(--color-text-secondary); }
.section-icon.icon-blue { background-color: #E8F0F8; }
.section-icon.icon-blue .icon { color: #2D6A9F; }
.section-title h3 { font-size: 16px; font-weight: 600; color: var(--color-text-primary); margin: 0 0 4px 0; }
.section-title p { font-size: 12px; color: var(--color-text-muted); margin: 0; }
.btn-add-rule { height: 32px; padding: 0 16px; background-color: var(--color-primary); color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.btn-add-rule .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 14px; }
.rule-table-wrapper { border: 0.7px solid var(--color-bg-card); border-radius: 12px; overflow: hidden; }
.rule-table { width: 100%; border-collapse: collapse; }
.rule-table th { background-color: #F5EFE3; padding: 12px 16px; height: 42px; font-size: 13px; font-weight: 600; text-align: left; color: var(--color-text-primary); }
.rule-table td { padding: 12px 16px; height: 53px; font-size: 13px; border-top: 1px solid var(--color-bg-card); vertical-align: middle; }
.rule-table th:first-child, .rule-table td:first-child { width: 160px; }
.rule-table th:nth-child(2), .rule-table td:nth-child(2) { width: auto; }
.rule-table th:nth-child(3), .rule-table td:nth-child(3) { width: 120px; text-align: center; }
.rule-table tr td:first-child { font-weight: 500; color: var(--color-text-primary); }
.pattern { font-family: monospace; font-size: 12px; color: #2D6A9F; background-color: var(--color-bg-secondary); padding: 2px 6px; border-radius: 4px; }
.action-buttons { display: flex; align-items: center; justify-content: center; gap: 8px; }
.btn-action { width: 28px; height: 28px; background-color: #F0E8D8; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #8B7355; font-size: 14px; }
.btn-action .icon { font-family: "remixicon", sans-serif; font-style: normal; }
.btn-action.btn-delete { background-color: #FFEBEE; color: var(--color-primary); }
.keyword-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.keyword-tag { background-color: #F0E8D8; border-radius: 9999px; padding: 8px 16px; font-size: 13px; color: #5C4A3A; display: flex; align-items: center; gap: 8px; }
.keyword-tag .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 14px; cursor: pointer; color: #8B7355; }
.keyword-tag .close-icon:hover { color: var(--color-primary); }
.empty-hint { font-size: 13px; color: var(--color-text-muted); padding: 8px 0; }
</style>
