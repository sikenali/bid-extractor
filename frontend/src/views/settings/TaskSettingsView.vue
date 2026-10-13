<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import apiClient from '@/api/client';
import { UiInput } from '@/components/ui';

interface TaskRecord {
  id: string;
  filename: string;
  file_size: number;
  skill_id: string;
  skill_name: string;
  status: string;
  extract_mode: string;
  result_json: string;
  created_at: string;
  completed_at: string;
}

const tasks = ref<TaskRecord[]>([]);
const loading = ref(false);
const searchTerm = ref('');
const statusFilter = ref('');

const STATUS_LABELS: Record<string, string> = {
  running: '执行中',
  completed: '已完成',
  failed: '失败',
};

const MODE_LABELS: Record<string, string> = {
  rule_only: '纯规则',
  llm_enhanced: 'LLM增强',
};

async function loadTasks() {
  loading.value = true;
  try {
    const res = await apiClient.get<{ items: TaskRecord[]; total: number }>('/tasks');
    tasks.value = res.data.items;
  } catch {
    ElMessage.error('加载任务列表失败');
  } finally {
    loading.value = false;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '-';
  const date = new Date(timeStr);
  return date.toLocaleString('zh-CN', { hour12: false });
}

onMounted(loadTasks);
</script>

<template>
  <div class="task-view">
    <!-- 页面头部卡片 -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="header-info">
          <div class="breadcrumb">
            <span>首页</span>
            <span class="sep">/</span>
            <span>设置中心</span>
            <span class="sep">/</span>
            <span class="current">抽取任务管理</span>
          </div>
          <div class="header-title">
            <h1>抽取任务管理</h1>
            <p>查看所有文档抽取任务的历史记录，支持状态筛选和详情查看</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <select v-model="statusFilter" class="status-filter">
          <option value="">全部状态</option>
          <option value="running">执行中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
        </select>
      </div>
      <div class="toolbar-right">
        <UiInput
          v-model="searchTerm"
          type="search"
          class="toolbar-search"
          placeholder="搜索文件名或技能名称"
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
      <div v-else-if="tasks.length === 0" class="empty-state">
        <span class="icon ri-file-list-3-line"></span>
        <span>暂无任务记录，上传文档后将自动生成任务</span>
      </div>
      <div v-else class="task-table">
        <div class="table-header">
          <div class="col-filename">文件名</div>
          <div class="col-skill">技能</div>
          <div class="col-mode">抽取模式</div>
          <div class="col-status">状态</div>
          <div class="col-size">大小</div>
          <div class="col-time">创建时间</div>
        </div>
        <div
          v-for="task in tasks.filter(t =>
            (!statusFilter || t.status === statusFilter) &&
            (!searchTerm ||
              t.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (t.skill_name && t.skill_name.toLowerCase().includes(searchTerm.toLowerCase())))
          )"
          :key="task.id"
          class="table-row"
        >
          <div class="col-filename">
            <span class="filename-text">{{ task.filename }}</span>
          </div>
          <div class="col-skill">
            <span class="skill-name">{{ task.skill_name || '默认技能' }}</span>
          </div>
          <div class="col-mode">
            <span class="mode-tag" :class="task.extract_mode">
              {{ MODE_LABELS[task.extract_mode] || task.extract_mode }}
            </span>
          </div>
          <div class="col-status">
            <span class="status-dot" :class="task.status"></span>
            <span class="status-text">{{ STATUS_LABELS[task.status] || task.status }}</span>
          </div>
          <div class="col-size">{{ formatSize(task.file_size) }}</div>
          <div class="col-time">{{ formatTime(task.created_at) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-view {
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

.status-filter {
  height: 46px;
  padding: 0 16px;
  border: 0.7px solid var(--color-border, #E5DFD3);
  border-radius: 10px;
  background: var(--color-bg-white, #fff);
  font-size: 15px;
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  cursor: pointer;
  outline: none;
}

.status-filter:focus {
  border-color: var(--color-primary, #C0392B);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-search {
  width: 300px;
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

.task-table {
  background: var(--color-bg-white, #fff);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 16px;
  overflow: hidden;
}

.table-header {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1.5fr;
  align-items: center;
  height: 52px;
  padding: 0 24px;
  background: var(--color-bg-secondary, #F7F3EA);
  font-size: 14px;
  color: var(--color-text-secondary, #6E6A60);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.table-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1.5fr;
  align-items: center;
  height: 64px;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border-soft, #EDE9E0);
  transition: background 0.15s;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:hover {
  background: var(--color-bg-card, #FCFBF8);
}

.col-filename .filename-text {
  font-size: 15px;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.col-skill .skill-name {
  font-size: 14px;
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.mode-tag {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.mode-tag.rule_only {
  background: var(--color-bg-secondary, #F7F3EA);
  color: var(--color-text-muted, #8A8578);
}

.mode-tag.llm_enhanced {
  background: #E8F0F8;
  color: var(--color-info, #4A72A8);
}

.col-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.running {
  background: #F39C12;
  animation: pulse 1.5s infinite;
}

.status-dot.completed {
  background: #27AE60;
}

.status-dot.failed {
  background: #E74C3C;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-text {
  font-size: 14px;
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.col-size, .col-time {
  font-size: 14px;
  color: var(--color-text-secondary, #6E6A60);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
</style>
