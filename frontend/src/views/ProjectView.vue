<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import TopNav from '@/components/layout/TopNav.vue';
import PreviewModal from '@/components/preview/PreviewModal.vue';
import { getProject } from '@/api/projects';

const route = useRoute();

const showPreview = ref(false);

const sidebarItems = [
  { key: 'info', label: '项目信息', sublabel: '招标文件提取', icon: 'ri-file-list-3-line', active: true },
  { key: 'business', label: '商务条款', sublabel: '标书生成', icon: 'ri-file-paper-2-line', active: false },
  { key: 'tech', label: '技术条款', sublabel: '标书检查', icon: 'ri-search-eye-line', active: false },
  { key: 'score', label: '评分标准', sublabel: '标书排版', icon: 'ri-layout-line', active: false }
];

const tableData = ref([
  { field: '项目名称', value: 'XX市智慧城市建设项目（一期）基础设施及平台建设', page: 'P.3' },
  { field: '项目编号', value: 'SC-ZC-2024-0815', page: 'P.1' },
  { field: '投标截止时间', value: '2024年10月15日 14:30（北京时间）', page: 'P.5' },
  { field: '投标地点', value: 'XX市公共资源交易中心 3楼 301 开标室', page: 'P.5' },
  { field: '交付时间', value: '合同签订后 180 个日历日内完成交付', page: 'P.12' },
  { field: '交付地点', value: 'XX市大数据中心机房（XX路188号）', page: 'P.12' },
  { field: '投标保证金', value: '人民币 伍拾万元整（¥500,000.00）', page: 'P.8' }
]);

const currentPage = ref(1);
const totalPages = ref(3);

const projectName = ref('');

onMounted(async () => {
  const id = route.params.id as string;
  if (id) {
    try {
      const project = await getProject(id);
      projectName.value = project.name;
    } catch {
      projectName.value = 'XX市智慧城市建设项目招标文件.pdf';
    }
  }
});

function handleCopy(field: string) {
  navigator.clipboard.writeText(tableData.value.find(d => d.field === field)?.value || '');
}

function handleEdit(field: string) {
  const val = tableData.value.find(d => d.field === field)?.value;
  const newVal = prompt(`编辑 ${field}:`, val);
  if (newVal) {
    const row = tableData.value.find(d => d.field === field);
    if (row) row.value = newVal;
  }
}

function goPage(p: number) {
  if (p >= 1 && p <= totalPages.value) currentPage.value = p;
}
</script>

<template>
  <div class="extract-view">
    <TopNav />
    <div class="extract-body">
      <div class="extract-sidebar">
        <div
          v-for="item in sidebarItems"
          :key="item.key"
          class="extract-nav-item"
          :class="{ active: item.active }"
        >
          <div class="nav-icon-wrap">
            <span class="icon" :class="item.icon"></span>
          </div>
          <div class="nav-text">
            <div class="nav-label">{{ item.label }}</div>
            <div class="nav-sublabel">{{ item.sublabel }}</div>
          </div>
        </div>
      </div>

      <div class="extract-content">
        <div class="file-info-bar">
          <span class="icon ri-file-pdf-line file-icon"></span>
          <span class="file-name">{{ projectName || 'XX市智慧城市建设项目招标文件.pdf' }}</span>
          <span class="file-meta">12.8 MB · 共 86 页</span>
          <div class="status-tag">
            <span class="icon ri-checkbox-circle-fill"></span>
            <span>提取完成</span>
          </div>
        </div>

        <div class="content-action-bar">
          <div class="action-group">
            <button class="btn-outline" @click="showPreview = true">
              <span class="icon ri-eye-line"></span>
              <span>预览</span>
            </button>
            <button class="btn-primary">
              <span class="icon ri-download-2-line"></span>
              <span>导出</span>
            </button>
          </div>
        </div>

        <div class="table-container">
          <table class="extract-table">
            <thead>
              <tr>
                <th class="col-field">提取字段</th>
                <th class="col-value">提取内容</th>
                <th class="col-page">所在页码</th>
                <th class="col-action">操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(row, idx) in tableData" :key="row.field">
                <tr v-if="idx > 0" class="row-spacer"><td colspan="4"></td></tr>
                <tr class="data-row">
                  <td class="col-field">{{ row.field }}</td>
                  <td class="col-value">{{ row.value }}</td>
                  <td class="col-page"><span class="page-link">{{ row.page }}</span></td>
                  <td class="col-action">
                    <div class="action-btns">
                      <button class="icon-btn" title="复制" @click="handleCopy(row.field)">
                        <span class="icon ri-file-copy-line"></span>
                      </button>
                      <button class="icon-btn" title="编辑" @click="handleEdit(row.field)">
                        <span class="icon ri-pencil-line"></span>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div class="bottom-bar">
          <div class="pagination">
            <button class="page-btn" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">
              <span class="icon ri-arrow-left-s-line"></span>
            </button>
            <button
              v-for="p in totalPages"
              :key="p"
              class="page-num"
              :class="{ active: currentPage === p }"
              @click="goPage(p)"
            >{{ p }}</button>
            <button class="page-btn" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">
              <span class="icon ri-arrow-right-s-line"></span>
            </button>
          </div>
          <button class="btn-extract">
            <span class="icon ri-magic-line"></span>
            <span>一键提取</span>
          </button>
        </div>
      </div>
    </div>
    <PreviewModal
      v-model:visible="showPreview"
      :filename="projectName || '招标文件.docx'"
      @close="showPreview = false"
    />
  </div>
</template>

<style scoped>
.extract-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}
.extract-body {
  display: flex;
  min-height: calc(100vh - 64px);
}
.extract-sidebar {
  width: 200px;
  background-color: #F5EFE3;
  padding: 24px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.extract-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  cursor: pointer;
}
.extract-nav-item.active {
  background-color: var(--color-primary);
}
.extract-nav-item:not(.active):hover {
  background-color: rgba(0,0,0,0.03);
}
.nav-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgba(232,220,200,1);
}
.extract-nav-item.active .nav-icon-wrap {
  background-color: rgba(255,255,255,0.2);
}
.nav-icon-wrap .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
  color: #8B7355;
}
.extract-nav-item.active .nav-icon-wrap .icon {
  color: white;
}
.nav-text {
  flex: 1;
  min-width: 0;
}
.nav-label {
  font-size: 15px;
  font-weight: 500;
  color: #5C4A3A;
  line-height: 1.3;
}
.nav-sublabel {
  font-size: 11px;
  color: #9B8C7C;
  line-height: 1.2;
}
.extract-nav-item.active .nav-label {
  color: white;
  font-weight: 600;
}
.extract-nav-item.active .nav-sublabel {
  color: rgba(255,255,255,0.7);
}

.extract-content {
  flex: 1;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
}

.file-info-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background-color: #F0E8D8;
  border-radius: 12px;
}
.file-icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 20px;
  color: var(--color-primary);
}
.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}
.file-meta {
  font-size: 12px;
  color: var(--color-text-muted);
}
.status-tag {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background-color: #D4EDDA;
  border-radius: 9999px;
}
.status-tag .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 14px;
  color: #2D8A4E;
}
.status-tag span:last-child {
  font-size: 12px;
  font-weight: 500;
  color: #2D8A4E;
}

.content-action-bar {
  display: flex;
  justify-content: flex-end;
}
.action-group {
  display: flex;
  gap: 12px;
}
.btn-outline {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #F0E8D8;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #5C4A3A;
  cursor: pointer;
}
.btn-outline .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 16px;
  color: #8B7355;
}
.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: var(--color-primary);
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: white;
  cursor: pointer;
}
.btn-primary .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 16px;
}

.table-container {
  border: 0.7px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
  background-color: white;
}
.extract-table {
  width: 100%;
  border-collapse: collapse;
}
.extract-table th {
  padding: 16px 24px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  background-color: #F5EFE3;
  text-align: left;
}
.col-field { width: 180px; }
.col-value { width: auto; }
.col-page { width: 100px; }
.col-action { width: 124px; text-align: center; }
.row-spacer td {
  padding: 0;
  height: 1px;
  background-color: var(--color-border);
}
.data-row td {
  padding: 16px 24px;
  font-size: 14px;
  vertical-align: middle;
}
.data-row .col-field {
  font-weight: 500;
  color: var(--color-text-primary);
}
.data-row .col-value {
  color: #5C4A3A;
}
.page-link {
  font-size: 13px;
  color: #2D6A9F;
  cursor: pointer;
}
.page-link:hover {
  text-decoration: underline;
}
.action-btns {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.icon-btn {
  width: 32px;
  height: 32px;
  background-color: #F0E8D8;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 16px;
  color: #8B7355;
}
.icon-btn:hover {
  background-color: #E8DCC8;
}

.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pagination {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background-color: #F0E8D8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.page-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 16px;
  color: #8B7355;
}
.page-num {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #5C4A3A;
  background: none;
  cursor: pointer;
}
.page-num.active {
  background-color: var(--color-primary);
  color: white;
  font-weight: 600;
}
.btn-extract {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 32px;
  background: linear-gradient(90deg, #C43D3D, #A83232);
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  color: white;
  cursor: pointer;
}
.btn-extract .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
}
</style>