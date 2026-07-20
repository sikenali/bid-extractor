<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import TopNav from '@/components/layout/TopNav.vue';
import PreviewModal from '@/components/preview/PreviewModal.vue';
import { getParseStatus } from '@/api/upload';
import { getExportSettings } from '@/api/settings';
import apiClient from '@/api/client';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType } from 'docx';

const route = useRoute();

const previewVisible = ref(false);
const fileId = ref('');
const showEditDialog = ref(false);
const editingField = ref('');
const editValue = ref('');

const activeSection = ref('info');
const currentPage = ref(1);
const pageSize = ref(10);

const sidebarItems = [
  { key: 'info', label: '项目信息', sublabel: '招标文件基本信息', icon: 'ri-file-list-3-line' },
  { key: 'business', label: '商务条款', sublabel: '招标文件商务偏离表', icon: 'ri-file-paper-2-line' },
  { key: 'tech', label: '技术条款', sublabel: '招标文件技术偏离表', icon: 'ri-search-eye-line' },
  { key: 'score', label: '评分标准', sublabel: '专家评分标准表', icon: 'ri-layout-line' },
  { key: 'seal', label: '封标标准', sublabel: '封装密封及递交要求', icon: 'ri-mail-send-line' },
  { key: 'star', label: '标星信息', sublabel: '★▲等重要标识条款', icon: 'ri-star-s-line' }
];

const sectionFields: Record<string, { field: string; page: string }[]> = {
  info: [
    { field: '项目名称', page: '' },
    { field: '项目编号', page: '' },
    { field: '采购人', page: '' },
    { field: '采购代理', page: '' },
    { field: '采购方式', page: '' },
    { field: '资金来源', page: '' },
    { field: '预算金额', page: '' },
    { field: '投标截止时间', page: '' },
    { field: '开标时间', page: '' },
    { field: '投标地点', page: '' },
    { field: '踏勘时间', page: '' },
    { field: '交付时间', page: '' },
    { field: '交付地点', page: '' },
    { field: '投标保证金', page: '' },
    { field: '合同包号', page: '' },
    { field: '分包情况', page: '' },
    { field: '采购需求', page: '' },
  ],
  business: [
    { field: '付款方式', page: '' },
    { field: '付款进度', page: '' },
    { field: '质保期', page: '' },
    { field: '履约保证金', page: '' },
    { field: '交货期', page: '' },
    { field: '投标有效期', page: '' },
    { field: '合同签订', page: '' },
    { field: '营业执照', page: '' },
    { field: '民事责任', page: '' },
    { field: '财务要求', page: '' },
    { field: '纳税要求', page: '' },
    { field: '社会保障', page: '' },
    { field: '信用记录', page: '' },
    { field: '声明函', page: '' },
    { field: '无违法记录', page: '' },
    { field: '关联关系', page: '' },
    { field: '联合体', page: '' },
    { field: '分包转包', page: '' },
    { field: '中小企业', page: '' },
    { field: '项目管理人员', page: '' },
    { field: '知识产权', page: '' },
    { field: '保密要求', page: '' },
    { field: '争议解决', page: '' },
    { field: '不可抗力', page: '' },
    { field: '违约责任', page: '' },
    { field: '发票要求', page: '' },
    { field: '验收条款', page: '' },
    { field: '售后服务', page: '' },
    { field: '备品备件', page: '' },
    { field: '供货周期', page: '' },
    { field: '售后响应', page: '' },
  ],
  tech: [
    { field: '技术规格', page: '' },
    { field: '技术参数', page: '' },
    { field: '技术指标', page: '' },
    { field: '技术方案', page: '' },
    { field: '性能要求', page: '' },
    { field: '功能要求', page: '' },
    { field: '配置清单', page: '' },
    { field: '安装调试', page: '' },
    { field: '软硬件要求', page: '' },
    { field: '接口要求', page: '' },
    { field: '安全要求', page: '' },
    { field: '质量要求', page: '' },
    { field: '验收标准', page: '' },
    { field: '服务要求', page: '' },
    { field: '服务内容', page: '' },
    { field: '培训要求', page: '' },
    { field: '技术资料', page: '' },
    { field: '运维要求', page: '' },
  ],
  score: [
    { field: '评标办法', page: '' },
    { field: '评分标准细则', page: '' },
    { field: '评分表', page: '' },
    { field: '评分项', page: '' },
    { field: '分值', page: '' },
    { field: '满分', page: '' },
    { field: '合格分数线', page: '' },
    { field: '价格评分', page: '' },
    { field: '技术评分', page: '' },
    { field: '商务评分', page: '' },
    { field: '客观分', page: '' },
    { field: '主观分', page: '' },
    { field: '价格扣除', page: '' },
    { field: '优先采购', page: '' },
    { field: '评审因素', page: '' },
    { field: '评分说明', page: '' },
  ],
  seal: [
    { field: '封标要求', page: '' },
    { field: '密封要求', page: '' },
    { field: '封装方式', page: '' },
    { field: '正本数量', page: '' },
    { field: '副本数量', page: '' },
    { field: '电子文件', page: '' },
    { field: '密封袋标识', page: '' },
    { field: '外层信封', page: '' },
    { field: '内层信封', page: '' },
    { field: '密封处盖章', page: '' },
    { field: '密封条', page: '' },
    { field: '封装格式', page: '' },
    { field: '纸质文件', page: '' },
    { field: '密封截止时间', page: '' },
    { field: '递交方式', page: '' },
    { field: '邮寄要求', page: '' },
    { field: '现场递交', page: '' },
  ],
};

interface ExtractedField {
  field: string;
  value: string;
  page: string;
  groupName: string;
}

const tableData = ref<ExtractedField[]>([]);
const docTables = ref<{ rows: { cells: string[] }[] }[]>([]);
const activeScoreTab = ref(0);
const paraToPageRef = ref<number[]>([]);
const markedItems = ref<{ symbol: string; text: string; page: number }[]>([]);

const scoreKeywords = ['评分', '得分', '分值', '分数', '评审', '明细', '权重', '价格'];
const scoreTables = computed(() => {
  return docTables.value.filter(tbl => {
    if (tbl.rows.length < 2) return false;
    const headers = tbl.rows[0].cells.map(c => c.trim());
    return headers.some(h => scoreKeywords.some(kw => h.includes(kw)));
  });
});

const fileInfo = ref({
  name: '',
  size: 0,
  pageCount: 0
});

const extractStatus = ref({
  status: 'pending',
  progress: 0,
  filename: ''
});

const sectionData = computed(() => {
  const fields = sectionFields[activeSection.value] || [];
  const extractedMap = new Map(
    tableData.value.filter(d => d.groupName === activeSection.value).map(d => [d.field, d])
  );
  return fields.map(f => {
    const extracted = extractedMap.get(f.field);
    return {
      field: f.field,
      value: extracted?.value || '-',
      page: extracted?.page || f.page || '-',
      groupName: activeSection.value
    };
  });
});

const totalRows = computed(() => sectionData.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalRows.value / pageSize.value)));

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sectionData.value.slice(start, start + pageSize.value);
});

function extractScore(raw: string): string {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*分/);
  if (m) return m[1] + '分';
  const n = raw.match(/(\d+(?:\.\d+)?)/);
  if (n) return n[1] + '分';
  return '-';
}

function getStarColor(symbol: string): string {
  const red = ['★', '◆', '●', '⚠', '❗', '🔴'];
  const orange = ['▲', '♦', '⭐'];
  const green = ['☆', '△', '○', '◇'];
  if (red.includes(symbol)) return '#ef4444';
  if (orange.includes(symbol)) return '#e68a2e';
  if (green.includes(symbol)) return '#22c55e';
  return '#ef4444';
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
    { key: 'tech', field: '技术评分', label: '技术评分', color: '#4f6ef7', bg: '#eef1fe', icon: 'ri-flask-line' },
    { key: 'business', field: '商务评分', label: '商务评分', color: '#22c55e', bg: '#e8faf0', icon: 'ri-briefcase-line' },
    { key: 'price', field: '价格评分', label: '价格评分', color: '#ef4444', bg: '#fef0ef', icon: 'ri-price-tag-3-line' },
  ];

  const tableScores = parseScoreTable(docTables.value);
  const data = sectionData.value;
  const extractedMap = new Map(data.map(d => [d.field, d.value]));

  return cards.map(c => {
    const raw = tableScores[c.field] || extractScore(extractedMap.get(c.field) || '');
    const num = parseFloat(raw);
    const percent = isNaN(num) ? 0 : Math.min(num, 100);
    return { ...c, value: raw || '-', percent };
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

  // Use fieldParaMap from Go backend for precise page numbers
  if (fieldParaMap && paraToPage.length > 0) {
    for (const field of Object.keys(extracts)) {
      const paraIdx = fieldParaMap[field];
      if (paraIdx !== undefined && paraIdx >= 0 && paraIdx < paraToPage.length) {
        fieldPages[field] = `P.${paraToPage[paraIdx]}`;
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
    };

    for (const [field, value] of Object.entries(extracts)) {
      const strVal = String(value).trim().toLowerCase();
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
          const keywords = sectionKeywords[group] || [];
          for (const kw of keywords) {
            if (lowerTitle.includes(kw)) {
              score++;
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestChapter = ch;
          }
        }
        if (bestChapter) {
          chapterPages[field] = bestChapter.page;
        }
      }
    }
  }

  for (const [field, page] of Object.entries(chapterPages)) {
    fieldPages[field] = `P.${page}`;
  }

  if (Object.keys(fieldPages).length === 0 && paraToPage.length > 0) {
    const totalPages = Math.max(...paraToPage);
    const entries = Object.keys(extracts);
    entries.forEach((field, index) => {
      const progress = index / Math.max(entries.length, 1);
      const page = Math.max(1, Math.ceil(progress * totalPages));
      fieldPages[field] = `P.${page}`;
    });
  }

  return fieldPages;
}

onMounted(async () => {
  const jobId = route.query.jobId as string;

  if (jobId) {
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
        paraToPageRef.value = statusData.result.paraToPage || [];
        const fieldParaMap = (statusData.result.fieldParaMap || {}) as Record<string, number>;
        const fieldPages = buildFieldPageMap(extracts, groups, paraToPageRef.value, statusData.result.chapters, fieldParaMap);
        tableData.value = Object.entries(extracts).map(([field, value]) => ({
          field,
          value: String(value),
          page: fieldPages[field] || 'P.1',
          groupName: fieldGroups[field] || groups[field] || 'info'
        }));
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
    } catch (err: any) {
      fileInfo.value.name = jobId;
    }
  }
});

function handleCopy(field: string) {
  const row = tableData.value.find(d => d.field === field);
  if (row) {
    const text = row.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    // final fallback: silently fail
  }
  document.body.removeChild(ta);
}

function handleEdit(field: string) {
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
    // Send correction to backend for auto-learning
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
}

function handlePreview() {
  previewVisible.value = true;
}

const sectionLabels: Record<string, string> = {
  info: '项目信息',
  business: '商务条款',
  tech: '技术条款',
  score: '评分标准',
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

  if (format === 'markdown') {
    exportMarkdown(grouped, baseName);
  } else {
    await exportDocx(grouped, baseName);
  }
}

function exportMarkdown(grouped: Record<string, ExtractedField[]>, baseName: string) {
  let md = `# ${baseName} — 提取结果\n\n`;
  const groupOrder = ['info', 'business', 'tech', 'score'];
  for (const g of groupOrder) {
    const rows = grouped[g];
    if (!rows || rows.length === 0) continue;
    md += `## ${sectionLabels[g] || g}\n\n`;
    md += '| 字段 | 内容 |\n';
    md += '|------|------|\n';
    for (const row of rows) {
      md += `| ${row.field} | ${row.value.replace(/\n/g, ' ')} |\n`;
    }
    md += '\n';
  }
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, `${baseName}.md`);
}

async function exportDocx(grouped: Record<string, ExtractedField[]>, baseName: string) {
  const groupOrder = ['info', 'business', 'tech', 'score'];
  const children: (import('docx').Paragraph | import('docx').Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: baseName + ' — 提取结果', bold: true, size: 32 })],
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] }),
  ];

  for (const g of groupOrder) {
    const rows = grouped[g];
    if (!rows || rows.length === 0) continue;
    children.push(
      new Paragraph({
        spacing: { before: 400, after: 200 },
        children: [new TextRun({ text: sectionLabels[g] || g, bold: true, size: 28 })],
      })
    );
    const tableRows = rows.map(row => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.field, bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun(row.value) ] })] }),
      ],
    }));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '字段', bold: true })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '内容', bold: true })] })] }),
            ],
          }),
          ...tableRows,
        ],
      })
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${baseName}.docx`);
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
    <TopNav />
    <div class="extract-body">
      <div class="extract-sidebar">
        <div
          v-for="item in sidebarItems"
          :key="item.key"
          class="extract-nav-item"
          :class="{ active: activeSection === item.key }"
          @click="selectSection(item.key)"
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
        <div class="extract-top-row">
          <div v-if="activeSection === 'score'" class="score-cards">
            <div
              v-for="card in scoreCards"
              :key="card.key"
              class="score-card"
              :style="{ '--card-accent': card.color, '--card-bg': card.bg }"
            >
              <div class="score-card-icon">
                <span class="icon" :class="card.icon"></span>
              </div>
              <div class="score-card-body">
                <div class="score-card-label">{{ card.label }}</div>
                <div class="score-card-value">{{ card.value }}</div>
              </div>
              <div class="score-card-bar">
                <div class="score-card-fill" :style="{ width: card.percent + '%' }"></div>
              </div>
            </div>
          </div>
          <div class="content-action-bar">
            <div class="action-group">
              <button class="btn-outline" @click="handlePreview">
                <span class="icon ri-eye-line"></span>
                <span>预览</span>
              </button>
              <button class="btn-primary" @click="handleExport">
                <span class="icon ri-download-2-line"></span>
                <span>导出</span>
              </button>
            </div>
          </div>
        </div>

        <template v-if="activeSection === 'star'">
        <div class="table-container">
          <table class="extract-table">
            <thead>
              <tr>
                <th class="col-field" style="width:80px">符号</th>
                <th class="col-value">条款内容</th>
                <th class="col-page" style="width:100px">所在页码</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in markedItems" :key="idx" class="data-row">
                <td class="col-field" style="width:80px">
                  <span class="star-symbol" :style="{ color: getStarColor(item.symbol) }">{{ item.symbol }}</span>
                </td>
                <td class="col-value">{{ item.text }}</td>
                <td class="col-page"><span class="page-link">P.{{ item.page }}</span></td>
              </tr>
              <tr v-if="markedItems.length === 0" class="empty-row">
                <td colspan="3" class="empty-cell">未检测到标星条款</td>
              </tr>
            </tbody>
          </table>
        </div>
        </template>

        <template v-else-if="activeSection !== 'score'">
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
              <template v-for="(row, idx) in paginatedData" :key="row.field">
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
              <tr v-if="paginatedData.length === 0" class="empty-row">
                <td colspan="4" class="empty-cell">暂无提取数据，请先上传招标文件</td>
              </tr>
            </tbody>
          </table>
        </div>
        </template>

        <template v-else-if="activeSection === 'score'">
        <div class="table-container" style="margin-bottom: 16px;">
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
              <template v-for="(row, idx) in paginatedData" :key="row.field">
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

        <div v-if="scoreTables.length === 0" class="empty-state">未检测到评分表格</div>
        <template v-else-if="scoreTables.length === 1">
          <div class="doc-table-wrap">
            <div class="table-container doc-table">
              <table class="extract-table">
                <thead>
                  <tr><th v-for="(cell, ci) in scoreTables[0].rows[0].cells" :key="ci" class="doc-th">{{ cell }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(row, ri) in scoreTables[0].rows.slice(1)" :key="ri" class="data-row">
                    <td v-for="(cell, ci) in row.cells" :key="ci" class="doc-td">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="score-tab-bar">
            <button
              v-for="(_tbl, ti) in scoreTables"
              :key="ti"
              class="score-tab"
              :class="{ active: activeScoreTab === ti }"
              @click="activeScoreTab = ti"
            >
              评分表 {{ ti + 1 }}
            </button>
          </div>
          <div class="doc-table-wrap">
            <div class="table-container doc-table">
              <table class="extract-table">
                <thead>
                  <tr><th v-for="(cell, ci) in scoreTables[activeScoreTab].rows[0].cells" :key="ci" class="doc-th">{{ cell }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(row, ri) in scoreTables[activeScoreTab].rows.slice(1)" :key="ri" class="data-row">
                    <td v-for="(cell, ci) in row.cells" :key="ci" class="doc-td">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
        </template>

        <div v-if="activeSection !== 'score' && activeSection !== 'star'" class="bottom-bar">
          <div class="pagination">
            <span class="page-info">共 {{ totalRows }} 条</span>
            <select class="page-size-select" :value="pageSize" @change="pageSize = Number(($event.target as HTMLSelectElement).value); currentPage = 1">
              <option :value="5">5条/页</option>
              <option :value="10">10条/页</option>
              <option :value="20">20条/页</option>
              <option :value="50">50条/页</option>
            </select>
            <button class="page-btn" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">
              <span class="icon ri-arrow-left-s-line"></span>
            </button>
            <template v-for="p in totalPages" :key="p">
              <button v-if="p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2"
                class="page-num" :class="{ active: currentPage === p }" @click="goPage(p)">{{ p }}</button>
              <span v-else-if="p === currentPage - 3 || p === currentPage + 3" class="page-ellipsis">...</span>
            </template>
            <button class="page-btn" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">
              <span class="icon ri-arrow-right-s-line"></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

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
    @close="previewVisible = false"
  />
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
  background-color: var(--color-bg-secondary);
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
  transition: all 0.2s;
}
.extract-nav-item:hover {
  background-color: rgba(0,0,0,0.03);
}
.extract-nav-item.active {
  background-color: var(--color-primary);
}
.nav-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--color-bg-card);
}
.extract-nav-item.active .nav-icon-wrap {
  background-color: rgba(255,255,255,0.2);
}
.nav-icon-wrap .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 18px;
  color: var(--color-text-secondary);
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
  color: var(--color-text-primary);
  line-height: 1.3;
}
.nav-sublabel {
  font-size: 11px;
  color: var(--color-text-muted);
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
  background-color: var(--color-bg-card);
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  cursor: pointer;
}
.btn-outline .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 16px;
  color: var(--color-text-secondary);
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
  background-color: var(--color-bg-white);
}
.extract-table {
  width: 100%;
  border-collapse: collapse;
}
.extract-table th {
  padding: 12px 16px;
  height: 42px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
  text-align: left;
}
.col-field { width: 160px; }
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
  color: var(--color-text-primary);
}
.page-link {
  font-size: 13px;
  color: var(--color-primary);
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
  width: 28px;
  height: 28px;
  background-color: var(--color-bg-card);
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
  font-size: 14px;
  color: var(--color-text-secondary);
}
.icon-btn:hover {
  background-color: var(--color-bg-secondary);
}
.empty-row td {
  padding: 48px 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
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
  background-color: var(--color-bg-card);
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
  color: var(--color-text-secondary);
}
.page-num {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  background: none;
  cursor: pointer;
}
.page-num.active {
  background-color: var(--color-primary);
  color: white;
  font-weight: 600;
}
.page-info {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-right: 4px;
}
.page-size-select {
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  cursor: pointer;
}
.page-ellipsis {
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 0 4px;
}

.extract-top-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.extract-top-row .content-action-bar {
  margin-left: auto;
}
.score-cards {
  display: flex;
  gap: 10px;
}
.score-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--card-accent, #e5e7eb);
  background-color: var(--card-bg, #f9fafb);
}
.score-card-icon {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--card-accent, #4f6ef7);
}
.score-card-icon .icon {
  color: #fff;
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 12px;
}
.score-card-body {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.score-card-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.score-card-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--card-accent, #111827);
  white-space: nowrap;
}
.score-card-bar {
  width: 40px;
  height: 3px;
  border-radius: 2px;
  background-color: var(--color-bg-secondary);
  overflow: hidden;
  flex-shrink: 0;
}
.score-card-fill {
  height: 100%;
  border-radius: 2px;
  background-color: var(--card-accent, #4f6ef7);
  transition: width 0.3s ease;
}

.star-symbol {
  font-size: 20px;
  font-weight: bold;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
}

.empty-state {
  text-align: center;
  padding: 48px 0;
  color: var(--color-text-muted);
  font-size: 14px;
}
.doc-table-wrap {
  margin-bottom: 24px;
}
.doc-table-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}
.doc-table th,
.doc-th,
.doc-td {
  padding: 10px 14px;
  font-size: 13px;
  vertical-align: middle;
  border: 1px solid var(--color-border, #e5e7eb);
  text-align: left;
}
.doc-th {
  font-weight: 600;
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
}
.doc-td {
  color: var(--color-text-primary);
}

.score-tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}
.score-tab {
  padding: 6px 16px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: var(--color-bg-card, #fff);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  transition: all 0.2s;
}
.score-tab:hover {
  border-color: var(--color-primary, #4f6ef7);
  color: var(--color-primary, #4f6ef7);
}
.score-tab.active {
  border-color: var(--color-primary, #4f6ef7);
  background-color: var(--color-primary, #4f6ef7);
  color: #fff;
}

.edit-field-label { font-size: 14px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 12px; padding: 8px 12px; background-color: var(--color-bg-card); border-radius: 8px; }
.dialog-btn { height: 36px; padding: 0 20px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
.dialog-btn.cancel { background-color: var(--color-bg-card); color: var(--color-text-secondary); margin-right: 8px; }
.dialog-btn.confirm { background-color: var(--color-primary); color: white; }
</style>