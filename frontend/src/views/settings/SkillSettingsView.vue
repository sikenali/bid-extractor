<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import apiClient from '@/api/client';

interface RuleItem {
  id: string;
  fieldName: string;
  pattern: string;
  enabled: boolean;
  category: string;
  groupName: string;
}

interface SkillItem {
  name: string;
  description: string;
  group: string;
  fields: string[];
  importedAt: string;
  rules: RuleItem[];
}

const skills = ref<SkillItem[]>([]);
const loading = ref(false);
const importLoading = ref(false);
const activeCategory = ref('all');
const expandedSkill = ref<string | null>(null);

const categories = computed(() => {
  const groups = new Set(skills.value.map(s => s.group));
  return [
    { key: 'all', label: '全部' },
    ...[...groups].map(g => ({ key: g, label: g }))
  ];
});

const groupColors: Record<string, string> = {
  info: '#4f6ef7',
  business: '#22c55e',
  tech: '#e68a2e',
  score: '#ef4444',
};

const groupLabels: Record<string, string> = {
  info: '项目信息',
  business: '商务条款',
  tech: '技术条款',
  score: '评分标准',
};

const filteredSkills = computed(() => {
  if (activeCategory.value === 'all') return skills.value;
  return skills.value.filter(s => s.group === activeCategory.value);
});

async function loadSkills() {
  loading.value = true;
  try {
    const res = await apiClient.get<SkillItem[]>('/rules/skills');
    skills.value = res.data;
  } catch {
    skills.value = [];
  } finally {
    loading.value = false;
  }
}

function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.yaml,.yml';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    importLoading.value = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post('/rules/import-skill', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const result = res.data;
      ElMessage.success(`导入技能「${result.name}」成功：${result.count} 条规则`);
      await loadSkills();
    } catch (err: any) {
      ElMessage.error(err?.response?.data?.error || '导入失败');
    } finally {
      importLoading.value = false;
    }
  };
  input.click();
}

async function handleDelete(skill: SkillItem) {
  try {
    await ElMessageBox.confirm(`确定删除技能「${skill.name}」及其 ${skill.rules.length} 条规则？`, '确认删除');
    await apiClient.delete(`/rules/skills/${encodeURIComponent(skill.name)}`);
    ElMessage.success('已删除');
    if (expandedSkill.value === skill.name) expandedSkill.value = null;
    await loadSkills();
  } catch {
    // cancelled
  }
}

function toggleExpand(name: string) {
  expandedSkill.value = expandedSkill.value === name ? null : name;
}

onMounted(loadSkills);
</script>

<template>
  <div class="settings-view">
    <div class="settings-content">
      <div class="page-header">
        <div>
          <h2 class="page-title">技能管理</h2>
          <p class="page-desc">通过 skill.md 导入和管理提取技能包</p>
        </div>
        <button class="btn-import" :disabled="importLoading" @click="triggerImport">
          <span class="icon ri-file-upload-line"></span>
          <span>{{ importLoading ? '导入中...' : '导入 Skill' }}</span>
        </button>
      </div>

      <div class="category-tabs">
        <button
          v-for="cat in categories"
          :key="cat.key"
          class="category-tab"
          :class="{ active: activeCategory === cat.key }"
          @click="activeCategory = cat.key"
        >{{ cat.label }}</button>
      </div>

      <div v-if="loading" class="loading-state">加载中...</div>

      <div v-else-if="skills.length === 0" class="empty-state">
        <span class="icon ri-git-branch-line empty-icon"></span>
        <p>暂无技能，点击上方"导入 Skill"按钮上传 skill.md 文件</p>
        <p class="empty-hint">技能包是一组提取规则的集合，可从 skill.md 文件导入</p>
      </div>

      <div v-else class="skill-grid">
        <div
          v-for="skill in filteredSkills"
          :key="skill.name"
          class="skill-card-wrapper"
        >
          <div
            class="skill-card"
            :class="{ expanded: expandedSkill === skill.name }"
            :style="{ '--card-accent': groupColors[skill.group] || '#4f6ef7' }"
            @click="toggleExpand(skill.name)"
          >
            <div class="card-accent-bar"></div>
            <div class="card-body" @click.stop>
              <div class="card-top">
                <div class="card-info">
                  <span class="card-icon ri-git-branch-line"></span>
                  <div>
                    <h3 class="card-name">{{ skill.name }}</h3>
                    <p v-if="skill.description" class="card-desc">{{ skill.description }}</p>
                  </div>
                </div>
                <div class="card-meta">
                  <span class="card-group-tag" :style="{ backgroundColor: groupColors[skill.group] + '20', color: groupColors[skill.group] }">
                    {{ groupLabels[skill.group] || skill.group }}
                  </span>
                  <span class="card-count">{{ skill.rules.length }} 条规则</span>
                  <button class="card-delete" @click="handleDelete(skill)">删除</button>
                </div>
              </div>

              <div v-if="expandedSkill === skill.name" class="card-rules">
                <div class="rules-divider"></div>
                <table class="rule-table">
                  <thead>
                    <tr>
                      <th>字段名称</th>
                      <th>类型</th>
                      <th>规则内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="rule in skill.rules" :key="rule.id">
                      <td class="rule-field">{{ rule.fieldName }}</td>
                      <td>
                        <span class="type-tag" :class="rule.category">
                          {{ rule.category === 'keyword' ? '关键字' : '正则' }}
                        </span>
                      </td>
                      <td class="rule-pattern-cell">
                        <code v-if="rule.pattern" class="rule-pattern">{{ rule.pattern }}</code>
                        <span v-else class="empty-pattern">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
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
.settings-content { flex: 1; padding: 32px; }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; gap: 16px; }
.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 4px 0; }
.page-desc { font-size: 14px; color: var(--color-text-muted); margin: 0; }

.btn-import { height: 36px; padding: 0 20px; background-color: #8B5CF6; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap; flex-shrink: 0; }
.btn-import:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-import .icon { font-family: "remixicon", sans-serif; font-style: normal; font-size: 16px; }

.category-tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.category-tab { padding: 8px 20px; border-radius: 20px; font-size: 13px; border: 0.7px solid var(--color-border); background-color: white; color: var(--color-text-secondary); cursor: pointer; transition: all 0.2s; }
.category-tab.active { background-color: var(--color-primary); color: white; border-color: var(--color-primary); font-weight: 600; }

.loading-state { padding: 80px 0; text-align: center; color: var(--color-text-muted); font-size: 14px; }
.empty-state { padding: 80px 0; text-align: center; color: var(--color-text-muted); }
.empty-icon { font-size: 48px; color: var(--color-border); font-family: "remixicon", sans-serif; font-style: normal; }
.empty-state p { font-size: 14px; margin: 16px 0 4px; }
.empty-hint { font-size: 12px; color: var(--color-text-muted); }

.skill-grid { display: flex; gap: 20px; flex-wrap: wrap; }
.skill-card-wrapper { width: 220px; }
.skill-card { border: 0.7px solid var(--color-border); border-radius: 12px; overflow: hidden; background-color: white; cursor: pointer; transition: all 0.2s; }
.skill-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.skill-card.expanded { width: calc(220px * 3 + 40px); position: relative; z-index: 1; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.card-accent-bar { height: 6px; background-color: var(--card-accent, #4f6ef7); }
.card-body { padding: 20px 16px; }
.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.card-info { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.card-icon { font-size: 28px; color: var(--card-accent, #4f6ef7); font-family: "remixicon", sans-serif; font-style: normal; flex-shrink: 0; margin-top: 2px; }
.card-name { font-size: 15px; font-weight: 600; color: var(--color-text-primary); margin: 0; }
.card-desc { font-size: 12px; color: var(--color-text-secondary); margin: 4px 0 0; line-height: 1.5; }
.card-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
.card-group-tag { font-size: 11px; padding: 3px 10px; border-radius: 9999px; font-weight: 500; }
.card-count { font-size: 11px; color: var(--color-text-muted); white-space: nowrap; }
.card-delete { font-size: 11px; color: var(--color-text-muted); background: none; border: 0.7px solid var(--color-border); border-radius: 6px; padding: 3px 10px; cursor: pointer; opacity: 0; transition: all 0.2s; }
.skill-card:hover .card-delete { opacity: 1; }
.card-delete:hover { border-color: var(--color-primary); color: var(--color-primary); }

.card-rules { margin-top: 16px; animation: fadeIn 0.2s ease; }
.rules-divider { height: 1px; background-color: var(--color-border); margin-bottom: 16px; }
.rule-table { width: 100%; border-collapse: collapse; }
.rule-table th { padding: 10px 12px; font-size: 12px; font-weight: 600; text-align: left; color: var(--color-text-muted); background-color: var(--color-bg-card); border-radius: 8px 8px 0 0; }
.rule-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--color-bg-card); }
.rule-table th:first-child, .rule-table td:first-child { width: 25%; }
.rule-table th:nth-child(2), .rule-table td:nth-child(2) { width: 10%; }
.rule-table th:nth-child(3), .rule-table td:nth-child(3) { width: 65%; }

.rule-field { font-weight: 500; color: var(--color-text-primary); }
.type-tag { font-size: 11px; padding: 2px 8px; border-radius: 9999px; }
.type-tag.regex { background-color: #E8F0F8; color: #2D6A9F; }
.type-tag.keyword { background-color: #F0E8D8; color: #8B7355; }
.rule-pattern { font-family: monospace; font-size: 11px; color: #2D6A9F; background-color: var(--color-bg-secondary); padding: 2px 6px; border-radius: 4px; word-break: break-all; }
.empty-pattern { color: var(--color-text-muted); }

@keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
</style>
