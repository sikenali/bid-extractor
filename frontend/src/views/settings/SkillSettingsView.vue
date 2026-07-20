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
  type: 'rules' | 'prompt';
  fields: string[];
  content?: string;
  importedAt: string;
  rules: RuleItem[];
}

const skills = ref<SkillItem[]>([]);
const loading = ref(false);
const importLoading = ref(false);
const expandedSkill = ref<string | null>(null);
const selectedFileName = ref('');

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

const templateIcons: Record<string, string> = {
  info: '',
  business: '',
  tech: '',
  score: '',
};

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

async function doImport(file: File) {
  importLoading.value = true;
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/rules/import-skill', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    const result = res.data;
    ElMessage.success(`导入技能「${result.name}」成功：${result.count} 条规则`);
    selectedFileName.value = '';
    await loadSkills();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '导入失败');
  } finally {
    importLoading.value = false;
  }
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  selectedFileName.value = file.name;
  doImport(file);
  input.value = '';
}

function triggerFileInput() {
  document.getElementById('skillFileInput')?.click();
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
        <h2 class="page-title">添加技能</h2>
        <p class="page-desc">通过 skill.md 导入和管理提取技能包</p>
      </div>

      <div class="bookshelf">
        <div class="bookshelf-inner">
          <div
            v-for="skill in skills"
            :key="skill.name"
            class="skill-card"
            :class="{ expanded: expandedSkill === skill.name }"
            :style="{ '--card-accent': groupColors[skill.group] || '#4f6ef7' }"
            @click="toggleExpand(skill.name)"
          >
            <div class="card-cover">
              <span class="card-icon">{{ templateIcons[skill.group] || '' }}</span>
              <span class="card-name">{{ skill.name }}</span>
              <span class="card-desc">{{ groupLabels[skill.group] || skill.group }}</span>
            </div>
            <div class="card-info">
              <div class="card-info-row">
                <span class="card-info-name">{{ skill.description || skill.name }}</span>
              </div>
              <div class="card-info-row card-info-meta">
                <span class="card-count">{{ skill.rules.length }} 条规则</span>
                <button class="card-delete" @click.stop="handleDelete(skill)">删除</button>
              </div>
            </div>

            <div v-if="expandedSkill === skill.name" class="card-rules" @click.stop>
              <div v-if="skill.type === 'prompt' && skill.content" class="prompt-content">
                <pre class="prompt-text">{{ skill.content }}</pre>
              </div>
              <template v-else>
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
              </template>
            </div>
          </div>

          <div class="add-card" @click="triggerFileInput">
            <div class="add-icon-wrap">
              <span class="add-icon ri-add-line"></span>
            </div>
            <span class="add-text">添加技能</span>
            <input
              id="skillFileInput"
              type="file"
              class="file-input"
              accept=".md,.yaml,.yml"
              @change="handleFileSelect"
            />
          </div>
        </div>
      </div>

      <div v-if="importLoading" class="loading-overlay">
        <span class="icon ri-loader-4-line spinning"></span>
        <span>正在导入: {{ selectedFileName }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}
.settings-content {
  flex: 1;
  padding: 32px;
}

.page-header {
  margin-bottom: 24px;
}
.page-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}
.page-desc {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0;
}

.bookshelf {
  overflow-x: auto;
  padding-bottom: 8px;
}
.bookshelf-inner {
  display: flex;
  gap: 20px;
  min-width: min-content;
}

.skill-card {
  width: 200px;
  height: 340px;
  border: 0.7px solid rgba(212,197,169,1);
  border-radius: 12px;
  background-color: rgba(255,255,255,1);
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  transition: all 0.2s;
  position: relative;
}
.skill-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.skill-card.expanded {
  width: 600px;
  height: auto;
  min-height: 340px;
  position: relative;
  z-index: 1;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}

.card-cover {
  height: 240px;
  background: linear-gradient(180deg, rgba(245,239,227,1) 0%, rgba(251,247,240,1) 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
}
.card-icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 40px;
  color: var(--card-accent, #c43d3d);
}
.card-name {
  font-size: 14px;
  font-weight: 600;
  color: rgba(61,43,31,1);
  font-family: "SourceHanSans-SemiBold", sans-serif;
  text-align: center;
  line-height: 1.2;
  max-width: 168px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-desc {
  font-size: 12px;
  color: rgba(155,140,124,1);
  font-family: "SourceHanSans-Regular", sans-serif;
  text-align: center;
  line-height: 1.2;
}

.card-info {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-height: 0;
}
.card-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-info-name {
  font-size: 14px;
  font-weight: 500;
  color: rgba(61,43,31,1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 168px;
}
.card-info-meta {
  gap: 8px;
}
.card-count {
  font-size: 11px;
  color: rgba(155,140,124,1);
}
.card-delete {
  font-size: 11px;
  color: rgba(155,140,124,1);
  background: none;
  border: 0.7px solid rgba(212,197,169,1);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
}
.skill-card:hover .card-delete {
  opacity: 1;
}
.card-delete:hover {
  border-color: var(--card-accent, #c43d3d);
  color: var(--card-accent, #c43d3d);
}

.add-card {
  width: 200px;
  height: 340px;
  border: 2px dashed rgba(212,197,169,1);
  border-radius: 12px;
  background-color: rgba(245,239,227,1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
  position: relative;
}
.add-card:hover {
  border-color: var(--color-primary, #4f6ef7);
  background-color: rgba(79, 110, 247, 0.03);
}
.add-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: rgba(240,232,216,1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.add-icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 22px;
  color: rgba(139,115,85,1);
}
.add-text {
  font-size: 14px;
  font-weight: 500;
  color: rgba(139,115,85,1);
  font-family: "SourceHanSans-Medium", sans-serif;
}
.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.card-rules {
  padding: 0 16px 16px;
  animation: fadeIn 0.2s ease;
}
.rules-divider {
  height: 1px;
  background-color: rgba(212,197,169,0.4);
  margin-bottom: 12px;
}
.rule-table {
  width: 100%;
  border-collapse: collapse;
}
.rule-table th {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  color: rgba(155,140,124,1);
  background-color: rgba(245,239,227,0.5);
  border-radius: 8px 8px 0 0;
}
.rule-table td {
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid rgba(245,239,227,0.8);
}
.rule-table th:first-child,
.rule-table td:first-child { width: 25%; }
.rule-table th:nth-child(2),
.rule-table td:nth-child(2) { width: 10%; }
.rule-table th:nth-child(3),
.rule-table td:nth-child(3) { width: 65%; }
.rule-field { font-weight: 500; color: rgba(61,43,31,1); }
.type-tag { font-size: 11px; padding: 2px 8px; border-radius: 9999px; }
.type-tag.regex { background-color: #E8F0F8; color: #2D6A9F; }
.type-tag.keyword { background-color: #F0E8D8; color: #8B7355; }
.rule-pattern { font-family: monospace; font-size: 11px; color: #2D6A9F; background-color: rgba(245,239,227,0.4); padding: 2px 6px; border-radius: 4px; word-break: break-all; }

.loading-overlay {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--color-text-muted);
  font-size: 14px;
}
.prompt-content {
  max-height: 400px;
  overflow-y: auto;
  padding: 4px 0;
}
.prompt-text {
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(61,43,31,1);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>