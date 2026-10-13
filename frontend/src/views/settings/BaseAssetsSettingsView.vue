<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import apiClient from '@/api/client';
import { getRules, addRule, updateRule, deleteRule } from '@/api/rules';
import { getLlmPrompts, createLlmSkill as _unused, updateLlmSkill as _u2 } from '@/api/llm';
import { UiInput, UiSwitch, UiModal } from '@/components/ui';

// ── Sub-tab state ────────────────────────────────────────────────
const subTab = ref<'rules' | 'prompts'>('rules');

// ── Common ───────────────────────────────────────────────────────
const GROUP_META = [
  { key: 'info', label: '项目信息', icon: 'ri-file-list-3-line' },
  { key: 'business', label: '商务条款', icon: 'ri-file-paper-2-line' },
  { key: 'tech', label: '技术条款', icon: 'ri-search-eye-line' },
  { key: 'score', label: '评分标准', icon: 'ri-layout-line' },
  { key: 'seal', label: '封标信息', icon: 'ri-mail-send-line' },
  { key: 'star', label: '标星条款', icon: 'ri-star-s-line' },
];
const groupLabel = (k: string) => GROUP_META.find(g => g.key === k)?.label || k;
const GROUP_LABELS = Object.fromEntries(GROUP_META.map(g => [g.key, g.label])) as Record<string, string>;

// ════════════════════════════════════════════════════════════════
// Tab 1: 抽取规则
// ════════════════════════════════════════════════════════════════
interface RuleItem { id: string; name: string; description: string; groupName: string; aliasFor?: string; }

const rules = ref<RuleItem[]>([]);
const rLoading = ref(false);
const rSearch = ref('');
const rGroup = ref('info');
const showRuleDialog = ref(false);
const rDialogMode = ref<'regex' | 'keyword'>('regex');
const editingRule = ref<{ id: string; fieldName: string; pattern: string; groupName: string; aliasFor: string } | null>(null);

function toItem(r: any): RuleItem { return { id: r.id, name: r.field_name, description: r.pattern, groupName: r.group_name || 'info', aliasFor: r.alias_for || '' }; }

async function loadRules() {
  rLoading.value = true;
  try { rules.value = (await getRules()).map(toItem); } catch { ElMessage.error('加载规则失败'); }
  finally { rLoading.value = false; }
}

const filteredRules = computed(() => {
  const q = rSearch.value.trim().toLowerCase();
  return rules.value.filter(r =>
    (!rGroup.value || r.groupName === rGroup.value) &&
    (!q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
  );
});

function openAdd(mode: 'regex' | 'keyword') {
  rDialogMode.value = mode; editingRule.value = null; showRuleDialog.value = true;
}
function openEdit(r: RuleItem) {
  rDialogMode.value = 'regex';
  editingRule.value = { id: r.id, fieldName: r.name, pattern: r.description, groupName: r.groupName, aliasFor: r.aliasFor || '' };
  showRuleDialog.value = true;
}
async function saveRule() {
  if (!editingRule.value || !editingRule.value.fieldName.trim()) { ElMessage.warning('请填写字段名称'); return; }
  try {
    if (editingRule.value.id) {
      await updateRule(editingRule.value.id, { fieldName: editingRule.value.fieldName, pattern: editingRule.value.pattern, groupName: editingRule.value.groupName });
    } else {
      await addRule({ fieldName: editingRule.value.fieldName, pattern: editingRule.value.pattern, category: rDialogMode.value, groupName: editingRule.value.groupName, enabled: true });
    }
    ElMessage.success('已保存'); showRuleDialog.value = false; await loadRules();
  } catch { ElMessage.error('保存失败'); }
}
async function handleResetRules() {
  await ElMessageBox.confirm('确定补齐默认规则？已有规则不受影响。', '补齐默认规则');
  await apiClient.post('/rules/reset'); await loadRules();
  ElMessage.success('默认规则已补齐');
}
async function handleDelete(id: string) {
  await ElMessageBox.confirm('确定删除此规则？', '确认删除');
  await deleteRule(id); await loadRules();
}

// ════════════════════════════════════════════════════════════════
// Tab 2: 提示词模板
// ════════════════════════════════════════════════════════════════
interface PromptTpl { id: string; name: string; description: string; biz_type: string; template_text: string; enable: number; version: number; }

const templates = ref<PromptTpl[]>([]);
const tLoading = ref(false);
const tSearch = ref('');
const showTplDialog = ref(false);
const editingTpl = ref<PromptTpl | null>(null);
const tName = ref(''), tDesc = ref(''), tBiz = ref('info'), tText = ref('');

async function loadTemplates() {
  tLoading.value = true;
  try { templates.value = await getLlmPrompts(); } catch { ElMessage.error('加载模板失败'); }
  finally { tLoading.value = false; }
}
function openTplCreate() { editingTpl.value = null; tName.value = ''; tDesc.value = ''; tBiz.value = 'info'; tText.value = ''; showTplDialog.value = true; }
function openTplEdit(t: PromptTpl) { editingTpl.value = t; tName.value = t.name; tDesc.value = t.description; tBiz.value = t.biz_type; tText.value = t.template_text; showTplDialog.value = true; }
async function saveTpl() {
  if (!tName.value.trim() || !tText.value.trim()) { ElMessage.warning('请填写名称和内容'); return; }
  try {
    if (editingTpl.value) { await apiClient.put(`/llm-prompts/${editingTpl.value.id}`, { name: tName.value.trim(), description: tDesc.value.trim(), template_text: tText.value, biz_type: tBiz.value }); }
    else { await apiClient.post('/llm-prompts', { name: tName.value.trim(), description: tDesc.value.trim(), template_text: tText.value, biz_type: tBiz.value }); }
    ElMessage.success('已保存'); showTplDialog.value = false; await loadTemplates();
  } catch { ElMessage.error('保存失败'); }
}
async function toggleTpl(t: PromptTpl) { t.enable = t.enable === 1 ? 0 : 1; await apiClient.put(`/llm-prompts/${t.id}`, { enable: t.enable }); }
async function delTpl(t: PromptTpl) { await ElMessageBox.confirm(`删除模板「${t.name}」？已绑定的技能不受影响。`, '确认删除'); await apiClient.delete(`/llm-prompts/${t.id}`); ElMessage.success('已删除'); await loadTemplates(); }
async function handleReset() { await ElMessageBox.confirm('确定恢复默认提示词模板？现有模板将被清除。', '确认恢复默认'); await apiClient.post('/llm-prompts/reset'); await loadTemplates(); ElMessage.success('已恢复默认'); }

onMounted(() => { loadRules(); loadTemplates(); });
</script>

<template>
  <div class="assets-view">
    <!-- Header -->
    <div class="page-header-card">
      <div class="header-info">
        <div class="breadcrumb"><span>首页</span><span class="sep">/</span><span>设置中心</span><span class="sep">/</span><span class="current">基础资产</span></div>
        <div class="header-title">
          <h1>基础资产</h1>
          <p>抽取规则与提示词模板的统一管理，支撑规则引擎与 LLM 抽取能力</p>
        </div>
      </div>
    </div>

    <!-- Sub-tab navigation -->
    <div class="sub-nav">
      <button class="sub-btn" :class="{ active: subTab === 'rules' }" @click="subTab = 'rules'">
        <span class="icon ri-list-settings-line"></span>
        <span>抽取规则</span>
        <span class="count">{{ rules.length }}</span>
      </button>
      <button class="sub-btn" :class="{ active: subTab === 'prompts' }" @click="subTab = 'prompts'">
        <span class="icon ri-chat-3-line"></span>
        <span>提示词模板</span>
        <span class="count">{{ templates.length }}</span>
      </button>
    </div>

    <!-- ══ 抽取规则 ══ -->
    <template v-if="subTab === 'rules'">
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn-add" @click="openAdd('regex')"><span class="icon ri-add-line"></span>新增规则</button>
          <button class="btn-secondary" @click="handleResetRules"><span class="icon ri-restart-line"></span>补齐默认</button>
        </div>
        <div class="toolbar-right">
          <div class="group-pills">
            <button v-for="g in GROUP_META" :key="g.key" class="pill" :class="{ active: rGroup === g.key }" @click="rGroup = g.key">{{ g.label }}</button>
          </div>
          <UiInput v-model="rSearch" type="search" class="search-input" placeholder="搜索字段名或正则" clearable />
        </div>
      </div>

      <div class="content-area">
        <div v-if="rLoading" class="loading">加载中…</div>
        <div v-else-if="filteredRules.length === 0" class="empty">暂无规则</div>
        <div v-else class="rule-table">
          <div class="tbl-head">
            <span class="c-name">字段名称</span>
            <span class="c-group">分类</span>
            <span class="c-pattern">正则 / 描述</span>
            <span class="c-alias">别名</span>
            <span class="c-act">操作</span>
          </div>
          <div v-for="r in filteredRules" :key="r.id" class="tbl-row">
            <div class="c-name">
              <span class="r-field">{{ r.name }}</span>
              <span class="r-type" :class="r.description ? 'regex' : 'keyword'">{{ r.description ? '正则' : '关键字' }}</span>
            </div>
            <div class="c-group">{{ groupLabel(r.groupName) }}</div>
            <div class="c-pattern"><code v-if="r.description" class="pattern-text">{{ r.description.slice(0, 80) }}{{ r.description.length > 80 ? '…' : '' }}</code><span v-else class="empty-pattern">—</span></div>
            <div class="c-alias"><span v-if="r.aliasFor" class="alias-tag">→ {{ r.aliasFor }}</span><span v-else class="empty-pattern">—</span></div>
            <div class="c-act">
              <button class="act-btn edit" @click="openEdit(r)">编辑</button>
              <button class="act-btn del" @click="handleDelete(r.id)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ══ 提示词模板 ══ -->
    <template v-else>
      <div class="toolbar">
        <button class="btn-add" @click="openTplCreate"><span class="icon ri-add-line"></span>新建模板</button>
        <button class="btn-secondary" @click="handleReset"><span class="icon ri-restart-line"></span>恢复默认</button>
        <UiInput v-model="tSearch" type="search" class="search-input" placeholder="搜索模板名称" clearable />
      </div>

      <div class="content-area">
        <div v-if="tLoading" class="loading">加载中…</div>
        <div v-else-if="templates.length === 0" class="empty">暂无提示词模板</div>
        <div v-else class="tpl-grid">
          <div v-for="t in templates.filter(tp => !tSearch || tp.name.toLowerCase().includes(tSearch.toLowerCase()) || tp.description?.toLowerCase().includes(tSearch.toLowerCase()))" :key="t.id" class="tpl-card" :class="{ disabled: t.enable === 0 }">
            <div class="tpl-top">
              <div>
                <div class="tpl-name">{{ t.name }}</div>
                <div class="tpl-biz">{{ GROUP_LABELS[t.biz_type] || t.biz_type }} · v{{ t.version }}</div>
              </div>
              <UiSwitch :model-value="t.enable === 1" size="sm" @update:model-value="toggleTpl(t)" />
            </div>
            <div class="tpl-desc">{{ t.description }}</div>
            <div class="tpl-preview"><pre>{{ t.template_text.slice(0, 100) }}{{ t.template_text.length > 100 ? '…' : '' }}</pre></div>
            <div class="tpl-actions">
              <button class="act-btn edit" @click="openTplEdit(t)">编辑</button>
              <button class="act-btn del" @click="delTpl(t)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Dialog: 规则新增/编辑 ── -->
    <UiModal v-model="showRuleDialog"
      :title="editingRule ? '编辑规则' : '新增规则'"
      subtitle="配置正则或关键字匹配规则"
      icon="ri-list-settings-line" :width="620" @confirm="saveRule">
      <div class="fg"><label class="fl">字段名称 <span class="req">*</span></label><UiInput v-model="editingRule!.fieldName" placeholder="如：项目名称" /></div>
      <div class="fg"><label class="fl">规则类型</label>
        <div class="radio-group">
          <label class="radio-label"><input type="radio" value="regex" v-model="rDialogMode" /> 正则表达式</label>
          <label class="radio-label"><input type="radio" value="keyword" v-model="rDialogMode" /> 关键字匹配</label>
        </div>
      </div>
      <div class="fg"><label class="fl">匹配模式 <span class="req" v-if="rDialogMode==='keyword'">*</span></label><UiInput v-model="editingRule!.pattern" :placeholder="rDialogMode==='regex' ? '输入正则表达式' : '输入关键字'" /></div>
      <div class="fg"><label class="fl">关联分类</label>
        <select v-model="editingRule!.groupName" class="fselect">
          <option v-for="g in GROUP_META" :key="g.key" :value="g.key">{{ g.label }}</option>
        </select>
      </div>
      <div class="fg"><label class="fl">别名归并</label><UiInput v-model="editingRule!.aliasFor" placeholder="指向主字段名，留空表示是主规则" /></div>
    </UiModal>

    <!-- ── Dialog: 提示词模板新增/编辑 ── -->
    <UiModal v-model="showTplDialog" :title="editingTpl ? '编辑提示词模板' : '新建提示词模板'" subtitle="配置可复用的大模型抽取提示词" icon="ri-chat-3-line" :width="640" @confirm="saveTpl">
      <div class="fg"><label class="fl">模板名称 <span class="req">*</span></label><UiInput v-model="tName" placeholder="如：项目信息抽取提示词" /></div>
      <div class="fg"><label class="fl">关联分类</label>
        <select v-model="tBiz" class="fselect">
          <option v-for="g in GROUP_META" :key="g.key" :value="g.key">{{ g.label }}</option>
        </select>
      </div>
      <div class="fg"><label class="fl">描述</label><UiInput v-model="tDesc" multiline :rows="2" /></div>
      <div class="fg"><label class="fl">提示词内容 <span class="req">*</span></label>
        <textarea v-model="tText" class="fta" rows="8" placeholder="输入提示词，可使用 {{chunkText}}、{{preExtract}} 占位符"></textarea>
      </div>
    </UiModal>
  </div>
</template>

<style scoped>
.assets-view { display:flex; flex-direction:column; gap:20px; max-width:1620px; }

.page-header-card { background:var(--color-bg-white,#fff); border:0.7px solid var(--color-border-soft,#EDE9E0); border-radius:16px; padding:20px 24px; }
.breadcrumb { display:flex; align-items:center; gap:8px; font-size:14px; color:var(--color-text-faint,#A7A296); font-family:"SourceHanSans-Regular",var(--font-family-cn); }
.breadcrumb span.sep { color:var(--color-text-faint,#A7A296); }
.breadcrumb span.current { color:var(--color-text-body,#3A3A3A); font-weight:500; }
.header-title h1 { font-size:28px; font-weight:700; color:var(--color-text-primary,#1F1D1A); margin:10px 0 0; font-family:"SourceHanSans-Bold",var(--font-family-cn); }
.header-title p { font-size:14px; color:var(--color-text-secondary,#6E6A60); margin:6px 0 0; font-family:"SourceHanSans-Regular",var(--font-family-cn); }

/* Sub-tab nav */
.sub-nav { display:flex; gap:12px; background:var(--color-bg-white,#fff); border:0.7px solid var(--color-border-soft,#EDE9E0); border-radius:12px; padding:6px; width:fit-content; }
.sub-btn { display:inline-flex; align-items:center; gap:8px; padding:10px 22px; border:none; border-radius:8px; background:transparent; font-size:15px; font-weight:500; color:var(--color-text-secondary,#6E6A60); cursor:pointer; font-family:"SourceHanSans-Regular",var(--font-family-cn); transition:all .2s; position:relative; }
.sub-btn:hover { background:var(--color-bg-secondary,#F7F3EA); }
.sub-btn.active { background:var(--color-primary-soft,#FBE9E7); color:var(--color-primary,#C0392B); }
.sub-btn .icon { font-family:"remixicon",sans-serif; font-style:normal; font-size:18px; }
.sub-btn .count { background:var(--color-bg-secondary,#F7F3EA); color:var(--color-text-muted,#8A8578); font-size:12px; padding:1px 7px; border-radius:9999px; }
.sub-btn.active .count { background:rgba(192,57,43,.15); color:var(--color-primary,#C0392B); }

/* Toolbar */
.toolbar { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
.toolbar-left, .toolbar-right { display:flex; gap:10px; align-items:center; }
.btn-add { display:inline-flex; align-items:center; gap:6px; padding:0 16px; height:40px; border:none; border-radius:9px; background:var(--color-primary,#C0392B); color:#fff; font-size:14px; font-weight:500; cursor:pointer; font-family:"SourceHanSans-Medium",var(--font-family-cn); transition:all .2s; }
.btn-add:hover { background:color-mix(in srgb,var(--color-primary,#C0392B) 88%,black); }
.btn-secondary { display:inline-flex; align-items:center; gap:6px; padding:0 16px; height:40px; border:0.7px solid var(--color-border,#E5DFD3); border-radius:9px; background:var(--color-bg-white,#fff); color:var(--color-text-body,#3A3A3A); font-size:14px; font-weight:500; cursor:pointer; font-family:"SourceHanSans-Medium",var(--font-family-cn); transition:all .2s; }
.btn-secondary:hover { background:var(--color-bg-secondary,#F7F3EA); }
.search-input { width:260px; }
.group-pills { display:flex; gap:6px; }
.pill { padding:5px 14px; border:0.7px solid var(--color-border,#E5DFD3); border-radius:20px; background:var(--color-bg-white,#fff); font-size:13px; color:var(--color-text-secondary,#6E6A60); cursor:pointer; font-family:"SourceHanSans-Regular",var(--font-family-cn); transition:all .15s; }
.pill:hover { background:var(--color-bg-secondary,#F7F3EA); }
.pill.active { background:var(--color-primary-soft,#FBE9E7); color:var(--color-primary,#C0392B); border-color:var(--color-primary,#C0392B); }

.content-area { flex:1; }
.loading, .empty { display:flex; align-items:center; justify-content:center; padding:48px; color:var(--color-text-muted,#8A8578); font-size:14px; font-family:"SourceHanSans-Regular",var(--font-family-cn); }

/* ── 规则表格 ── */
.rule-table { background:var(--color-bg-white,#fff); border:0.7px solid var(--color-border-soft,#EDE9E0); border-radius:16px; overflow:hidden; }
.tbl-head { display:grid; grid-template-columns:2fr .8fr 2.5fr 1fr 1fr; align-items:center; height:48px; padding:0 20px; background:var(--color-bg-secondary,#F7F3EA); font-size:13px; color:var(--color-text-secondary,#6E6A60); font-family:"SourceHanSans-Regular",var(--font-family-cn); }
.tbl-row { display:grid; grid-template-columns:2fr .8fr 2.5fr 1fr 1fr; align-items:center; height:56px; padding:0 20px; border-bottom:1px solid var(--color-border-soft,#EDE9E0); transition:background .15s; }
.tbl-row:last-child { border-bottom:none; }
.tbl-row:hover { background:var(--color-bg-card,#FCFBF8); }
.c-name { display:flex; flex-direction:column; gap:4px; }
.r-field { font-size:15px; font-weight:500; color:var(--color-text-primary,#1F1D1A); font-family:"SourceHanSans-Medium",var(--font-family-cn); }
.r-type { font-size:11px; padding:1px 7px; border-radius:9999px; width:fit-content; }
.r-type.regex { background:#E8F0F8; color:var(--color-info,#4A72A8); }
.r-type.keyword { background:#F0E8D8; color:var(--color-text-muted,#8A8578); }
.c-group { font-size:13px; color:var(--color-text-secondary,#6E6A60); font-family:"SourceHanSans-Regular",var(--font-family-cn); }
.c-pattern .pattern-text { font-family:monospace; font-size:12px; color:var(--color-info,#4A72A8); word-break:break-all; }
.c-pattern .empty-pattern, .c-alias .empty-pattern { font-size:12px; color:var(--color-text-muted,#8A8578); }
.alias-tag { font-size:12px; padding:2px 8px; border-radius:6px; background:#F0E8D8; color:var(--color-text-muted,#8A8578); }
.c-act { display:flex; gap:8px; justify-content:flex-end; }

/* ── 提示词网格 ── */
.tpl-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:16px; }
.tpl-card { background:var(--color-bg-white,#fff); border:0.7px solid var(--color-border-soft,#EDE9E0); border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:10px; transition:box-shadow .2s; }
.tpl-card:hover { box-shadow:0 4px 12px rgba(0,0,0,.08); }
.tpl-card.disabled { opacity:.55; }
.tpl-top { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.tpl-name { font-size:16px; font-weight:600; color:var(--color-text-primary,#1F1D1A); font-family:"SourceHanSans-Medium",var(--font-family-cn); }
.tpl-biz { font-size:12px; color:var(--color-text-muted,#8A8578); font-family:"SourceHanSans-Regular",var(--font-family-cn); }
.tpl-desc { font-size:13px; color:var(--color-text-secondary,#6E6A60); font-family:"SourceHanSans-Regular",var(--font-family-cn); line-height:1.5; }
.tpl-preview { background:var(--color-bg-secondary,#F7F3EA); border-radius:8px; padding:10px; }
.tpl-preview pre { font-family:monospace; font-size:11px; line-height:1.5; color:var(--color-text-body,#3A3A3A); white-space:pre-wrap; word-break:break-all; margin:0; }
.tpl-actions { display:flex; justify-content:flex-end; gap:8px; padding-top:6px; border-top:1px solid var(--color-border-soft,#EDE9E0); }

/* ── 通用操作按钮 ── */
.act-btn { font-size:13px; font-family:"SourceHanSans-Regular",var(--font-family-cn); background:none; border:none; cursor:pointer; padding:3px 8px; border-radius:6px; transition:background .15s; }
.act-btn.edit { color:var(--color-info,#4A72A8); }
.act-btn.edit:hover { background:rgba(74,114,168,.08); }
.act-btn.del { color:var(--color-error,#E74C3C); }
.act-btn.del:hover { background:rgba(201,80,60,.08); }

/* ── Form controls ── */
.fg { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
.fl { font-size:13px; color:var(--color-text-body,#3A3A3A); font-weight:500; font-family:"SourceHanSans-Regular",var(--font-family-cn); }
.fl .req { color:var(--color-primary,#C0392B); }
.fselect { height:38px; padding:0 10px; border:1px solid var(--color-border,#E5DFD3); border-radius:8px; background:var(--color-bg-white,#fff); font-size:14px; color:var(--color-text-body,#3A3A3A); font-family:"SourceHanSans-Regular",var(--font-family-cn); outline:none; cursor:pointer; }
.fselect:focus { border-color:var(--color-primary,#C0392B); }
.fta { width:100%; padding:10px; border:1px solid var(--color-border,#E5DFD3); border-radius:8px; background:var(--color-bg-white,#fff); font-size:13px; color:var(--color-text-body,#3A3A3A); font-family:monospace; resize:vertical; outline:none; line-height:1.6; }
.fta:focus { border-color:var(--color-primary,#C0392B); }
.radio-group { display:flex; gap:16px; }
.radio-label { display:inline-flex; align-items:center; gap:6px; font-size:14px; color:var(--color-text-body,#3A3A3A); cursor:pointer; font-family:"SourceHanSans-Regular",var(--font-family-cn); }
</style>
