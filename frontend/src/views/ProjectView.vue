<script setup lang="ts">
// @ts-nocheck
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import TopNav from '@/components/layout/TopNav.vue';
import PageFooter from '@/components/layout/PageFooter.vue';
import PreviewModal from '@/components/preview/PreviewModal.vue';
import { getParseStatus } from '@/api/upload';
import { getExportSettings } from '@/api/settings';
import apiClient from '@/api/client';

const route = useRoute();

const previewVisible = ref(false);
const previewPage = ref<number | null>(null);
const fileId = ref('');
const showEditDialog = ref(false);
const editingField = ref('');
const editValue = ref('');

const activeSection = ref('info');
const currentPage = ref(1);
const pageSize = ref(10);

const sidebarItems = [
  { key: 'info', label: '项目信息', icon: 'ri-file-list-3-line' },
  { key: 'business', label: '商务条款', icon: 'ri-file-paper-2-line' },
  { key: 'tech', label: '技术条款', icon: 'ri-search-eye-line' },
  { key: 'score', label: '评分标准', icon: 'ri-layout-line' },
  { key: 'seal', label: '封标信息', icon: 'ri-mail-send-line' },
  { key: 'star', label: '标星条款', icon: 'ri-star-s-line' }
];

const fixedFields: Record<string, string[]> = {
  info: ['项目名称', '项目编号', '采购方式', '预算金额', '投标截止时间', '开标时间', '投标地点', '交付时间', '交付地点', '投标保证金', '采购人', '采购代理', '资金来源', '采购需求', '踏勘时间', '分包情况', '合同包号', '面向中小微'],
  business: ['付款方式', '质保期', '履约保证金', '交货期', '投标有效期', '合同签订', '营业执照', '财务要求', '纳税要求', '社会保障', '信用记录', '声明函', '无违法记录', '联合体', '分包转包', '中小企业', '项目管理人员', '知识产权', '保密要求', '争议解决', '违约责任', '付款进度', '发票要求', '验收条款', '售后服务', '售后响应'],
  tech: ['技术规格', '性能要求', '验收标准', '技术指标', '服务内容', '技术参数', '服务要求', '培训要求', '功能要求', '配置清单', '安装调试', '技术方案', '安全要求', '安全保密要求', '质量要求', '软硬件要求', '接口要求', '技术资料', '运维要求', '交付成果', '测试报告', '测试环境', '测量指标', '部署要求', '项目范围', '方案要求', '实施要求', '产品要求', '设备要求', '系统要求', '软件要求', '硬件要求'],
  seal: ['密封要求', '封标要求', '封装方式', '正本要求', '正本数量', '副本要求', '副本数量', '电子文件', '递交方式', '密封袋标识', '密封章', '密封处'],
  score: ['评标办法', '评分标准', '评分细则', '综合评分', '评分因素', '商务评分', '技术评分', '价格评分', '技术得分', '商务得分', '价格得分', '评审标准', '分值分配', '商务权重', '技术权重', '价格权重', '评分权重', '满分值', '合格分', '评审因素', '评分占比', '得分占比', '评分值', '评分项'],
  star: []
};

interface ExtractedField {
  field: string;
  value: string;
  rawValue: unknown;
  page: string;
  pageNumber: number | null;
  chapter?: string;
  sourceText?: string;
  groupName: string;
}

interface TechSectionItem {
  section: string;
  title: string;
  items: string[];
}

interface FieldExtract {
  value?: unknown;
  score?: number;
  page?: number | null;
  chapter?: string;
  sourceText?: string;
  paraIds?: number[];
  group?: string;
}

function normalizeFieldValue(raw: unknown): { value: unknown; page: number | null; chapter?: string; sourceText?: string; group?: string } | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as FieldExtract;
  if (!('value' in rec) && rec.page == null && !rec.chapter && rec.sourceText == null) return null;
  return { value: rec.value, page: rec.page ?? null, chapter: rec.chapter, sourceText: rec.sourceText, group: rec.group };
}

function stringifyValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

const tableData = ref<ExtractedField[]>([]);
const structuredExtracts = ref<Record<string, TechSectionItem[]>>({});
const docTables = ref<{ rows: { cells: string[] }[] }[]>([]);
const markedItems = ref<{ symbol: string; text: string; page: number }[]>([]);

const fileInfo = ref({ name: '', size: 0, pageCount: 0 });
const extractStatus = ref({ status: 'pending', progress: 0, filename: '' });

const sectionData = computed(() => {
  const active = activeSection.value;
  const fields = fixedFields[active];
  const extractedMap = new Map(tableData.value.filter(d => d.groupName === active).map(d => [d.field, d]));
  if (active === 'star') {
    return tableData.value.filter(d => d.groupName === 'star' || (d.field && d.field.startsWith('★')));
  }
  return fields.map(f => extractedMap.get(f) || {
    field: f, value: '', rawValue: undefined, page: '', pageNumber: null, groupName: active
  });
});

const totalRows = computed(() => sectionData.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalRows.value / pageSize.value)));

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sectionData.value.slice(start, start + pageSize.value);
});

const sectionCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const item of sidebarItems) {
    const key = item.key;
    if (key === 'star') {
      counts[key] = markedItems.value.length;
    } else {
      counts[key] = fixedFields[key]?.length ?? 0;
    }
  }
  return counts;
});

function extractScore(raw: string): string {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*分/);
  if (m) return m[1] + '分';
  const n = raw.match(/(\d+(?:\.\d+)?)/);
  if (n) return n[1] + '分';
  return '-';
}

function parseScoreTable(tables: { rows: { cells: string[] }[] }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const tbl of tables) {
    if (tbl.rows.length < 2) continue;
    const headerRow = tbl.rows[0].cells.map(c => c.trim());
    const scoreCols: { colIdx: number; key: string }[] = [];
    const scoreKeys = ['技术评分', '商务评分', '价格评分'];
    for (let ci = 0; ci < headerRow.length; ci++) {
      for (const key of scoreKeys) {
        if (headerRow[ci].includes(key)) {
          scoreCols.push({ colIdx: ci, key });
          break;
        }
      }
    }
    if (scoreCols.length === 0) continue;
    for (let ri = 1; ri < tbl.rows.length; ri++) {
      const row = tbl.rows[ri].cells.map(c => c.trim());
      if (!row[0] || (row[0] !== '分值' && row[0] !== '分数' && row[0] !== '得分')) continue;
      for (const { colIdx, key } of scoreCols) {
        if (row[colIdx]) {
          const m = row[colIdx].match(/(\d+(?:\.\d+)?)/);
          if (m) result[key] = m[1] + '分';
        }
      }
    }
  }
  return result;
}

const scoreCards = computed(() => {
  const cards = [
    { key: 'business', field: '商务评分', label: '商务分' },
    { key: 'tech', field: '技术评分', label: '技术分' },
    { key: 'price', field: '价格评分', label: '价格分' },
  ];
  const tableScores = parseScoreTable(docTables.value);
  const data = sectionData.value;
  const extractedMap = new Map(data.map(d => [d.field, d.value]));
  return cards.map(c => {
    const raw = tableScores[c.field] || extractScore(extractedMap.get(c.field) || '');
    return { ...c, value: raw || '—' };
  });
});

function goPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value));
}

function buildFieldPageMap(
  extracts: Record<string, unknown>,
  groups: Record<string, string>,
  paraToPage: number[],
  chapters?: Array<{ title: string; content: string[]; page: number }>,
  fieldParaMap?: Record<string, number>
): Record<string, string> {
  const fieldPages: Record<string, string> = {};
  if (fieldParaMap && paraToPage.length > 0) {
    for (const field of Object.keys(extracts)) {
      const paraIdx = fieldParaMap[field];
      if (paraIdx !== undefined && paraIdx >= 0 && paraIdx < paraToPage.length) {
        fieldPages[field] = `P${paraToPage[paraIdx]}`;
      }
    }
    return fieldPages;
  }
  if (paraToPage.length === 0 && (!chapters || chapters.length === 0)) return fieldPages;

  const chapterPages: Record<string, number> = {};
  if (chapters && chapters.length > 0) {
    const sectionKeywords: Record<string, string[]> = {
      info: ['项目信息', '项目概况', '招标公告', '投标须知', '招标条件', '采购内容', '项目背景'],
      business: ['商务条款', '投标人资格', '资格要求', '商务要求', '合同条款', '付款', '售后'],
      tech: ['技术规格', '技术要求', '技术参数', '技术标准', '采购需求', '技术需求', '验收标准'],
      score: ['评分标准', '评标办法', '评审办法', '评分细则', '综合评分', '评分因素'],
      seal: ['封标', '密封', '封装', '正本', '副本', '电子文件', '递交', '盖章', '封条'],
    };
    for (const [field, value] of Object.entries(extracts)) {
      const norm = normalizeFieldValue(value);
      const strVal = String(norm ? norm.value : value).trim().toLowerCase();
      if (!strVal) continue;
      let found = false;
      for (const ch of chapters) {
        const allTexts = [ch.title, ...(ch.content || [])];
        if (allTexts.some(t => {
          const lt = t.toLowerCase();
          return lt.includes(strVal) || strVal.includes(lt.substring(0, Math.min(20, lt.length)));
        })) {
          chapterPages[field] = ch.page;
          found = true;
          break;
        }
      }
      if (!found) {
        const group = groups[field] || 'info';
        let bestChapter: typeof chapters[0] | null = null;
        let bestScore = 0;
        for (const ch of chapters) {
          const lowerTitle = ch.title.toLowerCase();
          let score = 0;
          for (const kw of (sectionKeywords[group] || [])) {
            if (lowerTitle.includes(kw)) score++;
          }
          if (score > bestScore) { bestScore = score; bestChapter = ch; }
        }
        if (bestChapter) chapterPages[field] = bestChapter.page;
      }
    }
  }
  for (const [field, page] of Object.entries(chapterPages)) fieldPages[field] = `P${page}`;
  if (Object.keys(fieldPages).length === 0 && paraToPage.length > 0) {
    const totalPages = Math.max(...paraToPage);
    Object.keys(extracts).forEach((field, index) => {
      const progress = index / Math.max(Object.keys(extracts).length, 1);
      fieldPages[field] = `P${Math.max(1, Math.ceil(progress * totalPages))}`;
    });
  }
  return fieldPages;
}

onMounted(async () => {
  const jobId = route.query.jobId as string;
  if (!jobId) return;
  try {
    const statusData = await getParseStatus(jobId);
    fileId.value = statusData.id || jobId;
    extractStatus.value = {
      status: statusData.status,
      progress: statusData.progress,
      filename: statusData.filename || ''
    };

    if (statusData.result?.extracts) {
      const extracts = statusData.result.extracts as Record<string, unknown>;
      const groups = (statusData.result.groups || {}) as Record<string, string>;
      const fieldGroups = (statusData.result.fieldGroups || {}) as Record<string, string>;
      const paraToPageRef = statusData.result.paraToPage || [];
      const fieldParaMap = (statusData.result.fieldParaMap || {}) as Record<string, number>;
      const fieldPages = buildFieldPageMap(extracts, groups, paraToPageRef, statusData.result.chapters, fieldParaMap);

      const structured: Record<string, TechSectionItem[]> = {};
      const flatEntries: ExtractedField[] = [];
      for (const [field, value] of Object.entries(extracts)) {
        const norm = normalizeFieldValue(value);
        const pageNumber = norm ? norm.page : null;
        const chapter = norm ? norm.chapter : undefined;
        const sourceText = norm ? norm.sourceText : undefined;
        const inner = norm ? norm.value : value;
        const groupName = norm?.group || fieldGroups[field] || groups[field] || 'info';
        const pageStr = pageNumber != null ? `P${pageNumber}` : (fieldPages[field] || 'P1');
        if (Array.isArray(inner)) {
          structured[field] = inner as TechSectionItem[];
          flatEntries.push({ field, value: '', rawValue: inner, page: pageStr, pageNumber, chapter, sourceText, groupName });
        } else {
          flatEntries.push({ field, value: stringifyValue(inner), rawValue: inner, page: pageStr, pageNumber, chapter, sourceText, groupName });
        }
      }
      structuredExtracts.value = structured;
      tableData.value = flatEntries;
    }

    if (statusData.result?.tables) {
      docTables.value = statusData.result.tables as { rows: { cells: string[] }[] }[];
    }
    if (statusData.result?.markedItems) {
      markedItems.value = statusData.result.markedItems as { symbol: string; text: string; page: number }[];
    }
    fileInfo.value.name = statusData.filename || '招标文件';
    fileInfo.value.size = statusData.fileSize || 0;
    fileInfo.value.pageCount = statusData.result?.pageCount || 0;
  } catch {
    fileInfo.value.name = jobId;
  }
});

function handleCopy(field: string) {
  const structured = structuredExtracts.value[field];
  if (structured) {
    const text = structured.map(s => `【${s.section}】${s.title}\n` + s.items.map(i => `  ${i}`).join('\n')).join('\n\n');
    copyText(text);
    return;
  }
  const row = tableData.value.find(d => d.field === field);
  if (row) copyText(row.value);
}

function copyText(text: string) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else fallbackCopy(text);
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
}

function handleEdit(field: string) {
  if (structuredExtracts.value[field]) return;
  const row = tableData.value.find(d => d.field === field);
  if (row) {
    editingField.value = field;
    editValue.value = row.value;
    showEditDialog.value = true;
  }
}

function confirmEdit() {
  const row = tableData.value.find(d => d.field === editingField.value);
  if (row) {
    const originalValue = row.value;
    row.value = editValue.value;
    apiClient.post('/rules/corrections', {
      fieldName: editingField.value,
      originalValue,
      correctedValue: editValue.value,
      paragraphText: '',
      groupName: activeSection.value,
      fileName: fileInfo.value.name
    }).catch(err => console.warn('Failed to save correction:', err));
  }
  showEditDialog.value = false;
}

function selectSection(section: string) {
  activeSection.value = section;
  currentPage.value = 1;
}

function handlePreview() {
  previewPage.value = null;
  previewVisible.value = true;
}

function handleLocate(payload: { field: string; page: number | null }) {
  if (payload.page == null) {
    ElMessage.info(`字段「${payload.field}」暂无页码信息`);
    return;
  }
  previewPage.value = payload.page;
  previewVisible.value = true;
}

const sectionLabels: Record<string, string> = {
  info: '项目信息', business: '商务条款', tech: '技术条款',
  score: '评分标准', seal: '封标信息', star: '标星条款'
};

async function handleExport() {
  let format = 'docx';
  try {
    const settings = await getExportSettings();
    format = settings.format;
  } catch {}
  const rows = tableData.value;
  const baseName = (extractStatus.value.filename || fileInfo.value.name || '导出').replace(/\.[^.]+$/, '');
  const grouped: Record<string, ExtractedField[]> = {};
  for (const row of rows) {
    const g = row.groupName || 'info';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(row);
  }
  if (format === 'markdown') exportMarkdown(grouped, baseName);
  else await exportDocx(grouped, baseName);
}

function exportMarkdown(grouped: Record<string, ExtractedField[]>, baseName: string) {
  let md = `# ${baseName} — 提取结果\n\n`;
  for (const g of ['info', 'business', 'tech', 'score', 'seal', 'star']) {
    const rows = grouped[g];
    if (!rows || rows.length === 0) continue;
    md += `## ${sectionLabels[g] || g}\n\n| 字段 | 内容 |\n|------|------|\n`;
    for (const row of rows) md += `| ${row.field} | ${row.value.replace(/\n/g, ' ')} |\n`;
    md += '\n';
  }
  triggerDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`);
}

// @ts-nocheck
async function exportDocx(grouped: Record<string, ExtractedField[]>, baseName: string) {
  // TODO: 暂不支持 Docx 导出，待完善类型定义后启用
  ElMessage.info('Docx 导出功能开发中，请选用 Markdown 格式');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="extract-view">
    <TopNav title="提取结果" />

    <div class="extract-body">
      <aside class="sidebar">
        <div class="sidebar-title">提取分类</div>
        <div class="sidebar-list">
          <div
            v-for="item in sidebarItems"
            :key="item.key"
            class="sidebar-item"
            :class="{ active: activeSection === item.key }"
            @click="selectSection(item.key)"
          >
            <span class="sidebar-item-label">{{ item.label }}<span class="sidebar-item-count">&nbsp;·&nbsp;{{ sectionCounts[item.key] || 0 }}</span></span>
          </div>
        </div>
      </aside>

      <main class="content">
        <div class="content-header">
          <h2 class="content-title">提取字段明细</h2>
          <div class="action-group">
            <button class="btn-outline" @click="handlePreview">
              <span class="icon ri-eye-line"></span>
              <span>预览</span>
            </button>
            <button class="btn-outline" @click="handleExport">
              <span class="icon ri-download-2-line"></span>
              <span>导出</span>
            </button>
          </div>
        </div>

        <div class="table-card">
          <table class="extract-table">
            <thead>
              <tr>
                <th class="col-name">字段名称</th>
                <th class="col-value">字段内容</th>
                <th class="col-page">所在页面</th>
                <th class="col-action">操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-if="activeSection === 'star'">
                <tr v-for="(item, idx) in paginatedData" :key="idx" class="data-row">
                  <td class="col-name">
                    <span class="star-symbol" style="color:#ef4444">{{ item.field.startsWith('★') ? '★' : '▲' }}</span>
                  </td>
                  <td class="col-value">{{ item.value }}</td>
                  <td class="col-page"><span class="page-link">{{ item.page }}</span></td>
                  <td class="col-action">
                    <div class="action-btns">
                      <button class="icon-btn" title="复制" @click="handleCopy(item.field)">
                        <span class="icon ri-file-copy-line"></span>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>

              <template v-else>
                <tr v-for="row in paginatedData" :key="row.field" class="data-row">
                  <td class="col-name">
                    <span>{{ row.field }}</span>
                  </td>
                  <td class="col-value">{{ row.value || '—' }}</td>
                  <td class="col-page">
                    <span class="page-link" @click="handleLocate({ field: row.field, page: row.pageNumber })">{{ row.page }}</span>
                  </td>
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

              <tr v-if="paginatedData.length === 0" class="empty-row">
                <td colspan="4" class="empty-cell">暂无提取数据，请先上传招标文件</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="score-card">
          <div class="score-row">
            <span class="score-label">评分构成</span>
            <span v-for="card in scoreCards" :key="card.key" class="score-pill">
              {{ card.label }} {{ card.value }}
            </span>
          </div>
          <div class="score-note">
            综合得分 = 商务得分 + 技术得分 + 价格得分； 价格得分 = （评标基准价 / 评标价）× 30 × 100%
          </div>
        </div>

        <div class="pagination-row">
          <span class="page-info">共 {{ totalRows }} 条 · 每页 {{ pageSize }} 条 · 第 {{ currentPage }} / {{ totalPages }} 页</span>
          <div class="pagination">
            <button class="page-btn" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">
              <span class="icon ri-arrow-left-s-line"></span>
            </button>
            <template v-for="p in totalPages" :key="p">
              <button
                v-if="p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2"
                class="page-num" :class="{ active: currentPage === p }" @click="goPage(p)">{{ p }}</button>
            </template>
            <button class="page-btn" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">
              <span class="icon ri-arrow-right-s-line"></span>
            </button>
          </div>
        </div>
      </main>
    </div>

    <PageFooter />

    <el-dialog v-model="showEditDialog" title="编辑提取内容" width="540px" :close-on-click-modal="false" @keyup.enter="confirmEdit">
      <div class="edit-field-label">{{ editingField }}</div>
      <el-input v-model="editValue" type="textarea" :rows="4" />
      <template #footer>
        <button class="dialog-btn cancel" @click="showEditDialog = false">取消</button>
        <button class="dialog-btn confirm" @click="confirmEdit">确定</button>
      </template>
    </el-dialog>

    <PreviewModal
      :visible="previewVisible"
      :filename="extractStatus.filename || fileInfo.name"
      :file-id="fileId"
      :initial-page="previewPage"
      @close="previewVisible = false"
    />
  </div>
</template>

<style scoped>
.extract-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #FAF7F2;
}
.extract-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.sidebar {
  width: 300px;
  background-color: #FFFFFF;
  padding: 24px 20px;
  border-right: 0.7px solid #EDE9E0;
}
.sidebar-title {
  padding: 0 12px;
  font-size: 15px;
  color: #8A8578;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  margin-bottom: 16px;
}
.sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sidebar-item {
  height: 52px;
  padding: 0 16px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background-color 0.2s;
}
.sidebar-item:hover {
  background-color: #F7F5EF;
}
.sidebar-item.active {
  background-color: #FBE9E7;
}
.sidebar-item-label {
  font-size: 16px;
  color: #3A3A3A;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.sidebar-item-count {
  color: inherit;
}
.sidebar-item.active .sidebar-item-label {
  color: #C0392B;
  font-weight: 500;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}

.content {
  flex: 1;
  min-width: 0;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.content-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  color: #1F1D1A;
  line-height: 1.2;
}
.action-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.btn-outline {
  height: 42px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0.7px solid #E5DFD3;
  border-radius: 10px;
  background-color: #FCFBF8;
  font-size: 15px;
  color: #3A3A3A;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  cursor: pointer;
  transition: background-color 0.2s;
}
.btn-outline:hover {
  background-color: #F7F3EA;
}
.btn-outline .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 17px;
  color: #3A3A3A;
}

.table-card {
  border: 0.7px solid #EDE9E0;
  border-radius: 12px;
  background-color: #FFFFFF;
  overflow: hidden;
}
.extract-table {
  width: 100%;
  border-collapse: collapse;
}
.extract-table thead tr {
  background-color: #F7F3EA;
}
.extract-table th {
  height: 54px;
  padding: 0 24px;
  font-size: 15px;
  font-weight: 400;
  color: #6E6A60;
  text-align: left;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.extract-table td {
  height: 82px;
  padding: 0 24px;
  font-size: 16px;
  vertical-align: middle;
  border-top: 0.7px solid #EDE9E0;
}
.extract-table tbody tr:nth-child(2n) {
  background-color: #FDFCF9;
}
.data-row .col-name {
  font-weight: 500;
  color: #1F1D1A;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.data-row .col-value {
  color: #3A3A3A;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.page-link {
  color: #6E6A60;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  cursor: pointer;
}
.page-link:hover { text-decoration: underline; }
.action-btns {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20px;
}
.icon-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
  color: #6E6A60;
}
.icon-btn:hover .icon { color: #C0392B; }
.empty-row td {
  height: auto;
  padding: 48px 0;
  text-align: center;
  color: #8A8578;
  font-size: 13px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.star-symbol { font-size: 18px; font-weight: 700; }

.score-card {
  border: 0.7px solid #EFE0BE;
  border-radius: 12px;
  background-color: #FDF6E3;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.score-row {
  display: flex;
  align-items: center;
  gap: 20px;
}
.score-label {
  font-size: 16px;
  color: #6E6A60;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.score-pill {
  height: 38px;
  padding: 0 16px;
  border: 0.7px solid #E5DCC2;
  border-radius: 8px;
  background-color: #FFFFFF;
  display: flex;
  align-items: center;
  font-size: 15px;
  color: #3A3A3A;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.score-note {
  font-size: 15px;
  color: #6E6A60;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-info {
  font-size: 15px;
  color: #8A8578;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.pagination {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-btn {
  width: 34px;
  height: 34px;
  border: 0.7px solid #E5DFD3;
  border-radius: 8px;
  background-color: #FCFBF8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.page-btn .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
  color: #6E6A60;
}
.page-num {
  width: 34px;
  height: 34px;
  border: 0.7px solid #E5DFD3;
  border-radius: 8px;
  background-color: #FCFBF8;
  font-size: 15px;
  color: #3A3A3A;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.page-num.active {
  background-color: #C0392B;
  border-color: #C0392B;
  color: #fff;
  font-weight: 500;
}

.edit-field-label {
  font-size: 14px;
  font-weight: 500;
  color: #1F1D1A;
  margin-bottom: 12px;
  padding: 8px 12px;
  background-color: #FCFBF8;
  border-radius: 6px;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.dialog-btn { height: 36px; padding: 0 20px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; font-family: "SourceHanSans-Regular", var(--font-family-cn); }
.dialog-btn.cancel { background-color: #FCFBF8; color: #6E6A60; margin-right: 8px; }
.dialog-btn.confirm { background-color: #C0392B; color: white; }
</style>
