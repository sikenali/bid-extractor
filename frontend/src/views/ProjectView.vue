<script setup lang="ts">
// @ts-nocheck
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TopNav from '@/components/layout/TopNav.vue';
import PageFooter from '@/components/layout/PageFooter.vue';
import PreviewModal from '@/components/preview/PreviewModal.vue';
import CreditQualificationModal from '@/components/layout/CreditQualificationModal.vue';
import BiddingSitesModal from '@/components/layout/BiddingSitesModal.vue';
import { UiModal, UiInput } from '@/components/ui';
import { getParseStatus } from '@/api/upload';
import { getExportSettings } from '@/api/settings';
import apiClient from '@/api/client';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import JSZipUtils from 'jszip-utils';

const exporting = ref(false);
const exportProgress = ref(0);
const exportStage = ref('');

function paint() {
  return new Promise<void>(r => setTimeout(r, 30));
}

function loadTemplateBytes(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    JSZipUtils.getBinaryContent(url, (err: Error | null, data: ArrayBuffer) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

const route = useRoute();
const router = useRouter();

const previewVisible = ref(false);
const previewPage = ref<number | null>(null);
const fileId = ref('');
const showEditDialog = ref(false);
const editingField = ref('');
const editValue = ref('');
const showCreditModal = ref(false);
const showBiddingModal = ref(false);

function handleReupload() {
  router.replace({ path: '/' });
}

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
const docTables = ref<{ rows: { cells: string[] }[]; page?: string; chapter?: string; group?: string }[]>([]);
const markedItems = ref<{ symbol: string; text: string; page: number }[]>([]);

const fileInfo = ref({ name: '', size: 0, pageCount: 0 });
const extractStatus = ref({ status: 'pending', progress: 0, filename: '' });
const loading = ref(false);

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

/** 技术 / 评分：优先展示文档原文表格（后端已按关键词归组），无表格时仍显示关键字提取行 */
const sectionTables = computed(() => {
  if (activeSection.value !== 'tech' && activeSection.value !== 'score') return [];
  return docTables.value.filter(t => t.group === activeSection.value);
});

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
      // 实际命中数：该分组下有非空值的字段数，而非固定字段总数
      counts[key] = tableData.value.filter(d => d.groupName === key && String(d.value ?? '').trim() !== '').length;
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
  const stateResult = (window as any).history?.state?.uploadResult as any;

  if (stateResult && stateResult.result) {
    processResult(stateResult);
    return;
  }

  const jobId = (route.query.jobId as string)
    || (window as any).history?.state?.jobId as string
    || (() => { try { return sessionStorage.getItem('bidextractor.lastJobId') || ''; } catch { return ''; } })();
  if (!jobId) {
    ElMessage.warning('暂无解析任务，请先上传招标文件');
    handleReupload();
    return;
  }
  loading.value = true;
  try {
    const statusData = await getParseStatus(jobId);
    fileId.value = statusData.id || jobId;
    extractStatus.value = {
      status: statusData.status,
      progress: statusData.progress,
      filename: statusData.filename || ''
    };

    if (statusData.result) {
      processResult(statusData);
    } else {
      ElMessage.error('解析结果异常，请重新上传');
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '加载失败，请检查网络后重试');
    fileInfo.value.name = jobId;
  } finally {
    loading.value = false;
  }
});

function processResult(statusData: any) {
  const result = statusData.result;
  if (result?.extracts) {
    const extracts = result.extracts as Record<string, unknown>;
    const groups = (result.groups || {}) as Record<string, string>;
    const fieldGroups = (result.fieldGroups || {}) as Record<string, string>;
    const paraToPageRef = result.paraToPage || [];
    const fieldParaMap = (result.fieldParaMap || {}) as Record<string, number>;
    const fieldPages = buildFieldPageMap(extracts, groups, paraToPageRef, result.chapters, fieldParaMap);

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

  if (result?.tables) {
    docTables.value = (result.tables as any[]).map((t: any) => ({
      rows: (t.rows || []).map((r: any) => ({
        cells: Array.isArray(r) ? r.map((c: any) => String(c ?? '')) : [],
      })),
      page: typeof t.page === 'number' ? `P${t.page}` : (t.page || ''),
      chapter: t.chapter || '',
      group: t.group || '',
    }));
  }
  if (result?.markedItems) {
    markedItems.value = result.markedItems as { symbol: string; text: string; page: number }[];
  }
  fileInfo.value.name = statusData.filename || '招标文件';
  fileInfo.value.size = statusData.fileSize || 0;
  fileInfo.value.pageCount = result?.pageCount || 0;
}

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
      paragraphText: row.sourceText || '',
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
  else if (format === 'pdf') exportPdf(grouped, baseName);
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

async function exportDocx(grouped: Record<string, ExtractedField[]>, baseName: string) {
  if (exporting.value) return;
  exporting.value = true;
  exportProgress.value = 5;
  exportStage.value = '正在加载模板…';
  try {
    await paint();
    const tplUrl = `${import.meta.env.BASE_URL}template/extract-template.docx`;
    const bytes = await loadTemplateBytes(tplUrl);
    exportProgress.value = 25;
    exportStage.value = '正在填充数据…';
    await paint();
    const zip = new PizZip(bytes);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    const groups = ['info', 'business', 'tech', 'score', 'seal', 'star']
      .map(g => ({
        name: sectionLabels[g] || g,
        rows: (grouped[g] || []).map(r => ({
          field: String(r.field || ''),
          value: String(r.value || '—'),
          page: String(r.page || ''),
        })),
      }))
      .filter(g => g.rows.length > 0);
    doc.render({ title: `${baseName} — 提取结果`, groups });
    exportProgress.value = 60;
    exportStage.value = '正在生成文档…';
    await paint();
    const blob = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    exportProgress.value = 90;
    exportStage.value = '正在保存文件…';
    await paint();
    saveAs(blob, `${baseName}.docx`);
    exportProgress.value = 100;
    exportStage.value = '';
    ElMessage.success('Docx 已导出');
  } catch (err: any) {
    ElMessage.error('Docx 导出失败：' + (err?.message || '模板加载异常'));
  } finally {
    setTimeout(() => {
      exporting.value = false;
      exportProgress.value = 0;
      exportStage.value = '';
    }, 600);
  }
}

async function exportPdf(grouped: Record<string, ExtractedField[]>, baseName: string) {
  try {
    const [{ PDFDocument, rgb }, fontkit] = await Promise.all([
      import('pdf-lib'),
      import('@pdf-lib/fontkit').then(m => m.default),
    ]);
    const [regBytes, boldBytes] = await Promise.all([
      fetch('/fonts/NotoSansSC-Regular.otf').then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); }),
      fetch('/fonts/NotoSansSC-Bold.otf').then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); }),
    ]);
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit as any);
    const fontReg = await pdf.embedFont(regBytes);
    const fontBold = await pdf.embedFont(boldBytes);

    const PW = 595.28, PH = 841.89, M = 48;
    const CW = PW - M * 2;
    const fieldW = 110, pageW = 60, valueW = CW - fieldW - pageW;
    const titleSize = 20, h2Size = 15, bodySize = 11, lineGap = 5, cellPad = 6;
    const lineH = (s: number) => s + lineGap;

    const wrap = (text: string, font: any, size: number, maxW: number): string[] => {
      const out: string[] = [];
      let line = '';
      const push = () => { out.push(line); line = ''; };
      for (const ch of String(text ?? '')) {
        if (ch === '\n') { push(); continue; }
        if (font.widthOfTextAtSize(line + ch, size) > maxW && line) push();
        line += ch;
      }
      push();
      return out.length ? out : [''];
    };

    let page = pdf.addPage([PW, PH]);
    let y = PH - M;
    const newPage = () => { page = pdf.addPage([PW, PH]); y = PH - M; };
    const need = (h: number) => { if (y - h < M) newPage(); };

    page.drawText(`${baseName} — 提取结果`, { x: M, y: y - titleSize, size: titleSize, font: fontBold });
    y -= titleSize + 18;

    const drawHeader = () => {
      const h = lineH(bodySize) + cellPad * 2;
      need(h);
      const cols = [
        { t: '字段', w: fieldW }, { t: '内容', w: valueW }, { t: '所在页面', w: pageW },
      ];
      let x = M;
      for (const c of cols) {
        page.drawRectangle({ x, y: y - h, width: c.w, height: h, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.7 });
        page.drawText(c.t, { x: x + cellPad, y: y - cellPad - bodySize, size: bodySize, font: fontBold });
        x += c.w;
      }
      y -= h;
    };

    const drawRow = (valueLines: string[][]) => {
      // valueLines: already-wrapped lines per column [fieldLines, valueLines, pageLines]
      let li = 0;
      const total = Math.max(valueLines[0].length, valueLines[1].length, valueLines[2].length);
      let firstChunk = true;
      while (li < total) {
        const availH = y - M;
        const perLine = lineH(bodySize);
        const fitLines = Math.max(1, Math.floor((availH - cellPad * 2) / perLine));
        const chunk = [0, 1, 2].map(ci => valueLines[ci].slice(li, li + fitLines));
        const used = Math.max(chunk[0].length, chunk[1].length, chunk[2].length);
        const h = used * perLine + cellPad * 2;
        if (!firstChunk || h > availH) { newPage(); drawHeader(); }
        const colX = [M, M + fieldW, M + fieldW + valueW];
        const colW = [fieldW, valueW, pageW];
        const fonts = [fontReg, fontReg, fontReg];
        for (let ci = 0; ci < 3; ci++) {
          page.drawRectangle({ x: colX[ci], y: y - h, width: colW[ci], height: h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.7 });
          chunk[ci].forEach((ln, k) => {
            page.drawText(ln || ' ', { x: colX[ci] + cellPad, y: y - cellPad - bodySize - k * perLine, size: bodySize, font: fonts[ci] });
          });
        }
        y -= h;
        li += fitLines;
        firstChunk = false;
      }
    };

    for (const g of ['info', 'business', 'tech', 'score', 'seal', 'star']) {
      const rows = grouped[g];
      if (!rows || rows.length === 0) continue;
      need(lineH(h2Size) + 14);
      page.drawText(sectionLabels[g] || g, { x: M, y: y - h2Size, size: h2Size, font: fontBold });
      y -= h2Size + 10;
      drawHeader();
      for (const row of rows) {
        drawRow(
          [
            wrap(row.field, fontReg, bodySize, fieldW - cellPad * 2),
            wrap(row.value || '—', fontReg, bodySize, valueW - cellPad * 2),
            wrap(row.page || '', fontReg, bodySize, pageW - cellPad * 2),
          ],
        );
      }
      y -= 10;
    }

    const bytes = await pdf.save();
    saveAs(new Blob([bytes as any], { type: 'application/pdf' }), `${baseName}.pdf`);
    ElMessage.success('PDF 已导出');
  } catch {
    ElMessage.error('PDF 导出失败');
  }
}

function triggerDownload(blob: Blob, filename: string) {
  saveAs(blob, filename);
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
            <button class="btn-outline" @click="handleExport" :disabled="exporting">
              <span v-if="exporting" class="icon ri-loader-4-line spinning"></span>
              <span v-else class="icon ri-download-2-line"></span>
              <span>{{ exporting ? (exportStage || '导出中…') : '导出' }}</span>
            </button>
            <div v-if="exporting" class="export-progress">
              <div class="export-progress-bar" :style="{ width: exportProgress + '%' }"></div>
            </div>
          </div>
        </div>

        <div class="table-card" :class="{ 'is-loading': loading }">
          <div v-if="loading" class="loading-overlay">
            <div class="loading-spinner"></div>
            <span class="loading-text">正在解析文档…</span>
          </div>
          <template v-if="!loading">
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
              <tr v-for="row in paginatedData" :key="row.field" class="data-row">
                <td class="col-name">
                  <span>{{ row.field }}</span>
                </td>
                <td class="col-value">
                  <span>{{ row.value || '—' }}</span>
                  <span v-if="row.chapter" class="row-chapter" :title="row.sourceText || ''">{{ row.chapter }}</span>
                </td>
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

              <tr v-if="paginatedData.length === 0" class="empty-row">
                <td colspan="4" class="empty-cell">暂无提取数据，请先上传招标文件</td>
              </tr>
            </tbody>
            </table>
          </template>
        </div>

        <div v-if="activeSection === 'score'" class="score-card">
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

        <div v-if="sectionTables.length > 0" class="doc-tables-card">
          <div class="doc-tables-title">
            原文表格（{{ sectionTables.length }}）
            <span class="doc-tables-tip">直接取自文档中的表格</span>
          </div>
          <div v-for="(t, ti) in sectionTables" :key="ti" class="doc-table-wrap">
            <div class="doc-table-meta">表格 {{ ti + 1 }} · {{ t.page }} · {{ t.chapter || '正文' }}</div>
            <table class="doc-table">
              <tr v-for="(row, ri) in t.rows" :key="ri" :class="{ 'is-header': ri === 0 }">
                <td v-for="(cell, ci) in row.cells" :key="ci">{{ cell || '—' }}</td>
              </tr>
            </table>
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

    <PageFooter @credit-query="showCreditModal = true" @bidding-sites="showBiddingModal = true" />

    <UiModal
      v-model="showEditDialog"
      title="编辑提取内容"
      :subtitle="editingField"
      icon="ri-edit-line"
      :width="540"
      @confirm="confirmEdit"
    >
      <UiInput v-model="editValue" multiline :rows="4" placeholder="请输入修正后的内容" />
    </UiModal>

    <PreviewModal
      :visible="previewVisible"
      :filename="extractStatus.filename || fileInfo.name"
      :file-id="fileId"
      :initial-page="previewPage"
      @close="previewVisible = false"
    />

    <CreditQualificationModal v-model:visible="showCreditModal" />
    <BiddingSitesModal v-model:visible="showBiddingModal" />
  </div>
</template>

<style scoped>
.extract-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-main);
}
.extract-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.sidebar {
  width: 300px;
  background-color: var(--color-bg-white, #FFFFFF);
  padding: 24px 20px;
  border-right: 0.7px solid var(--color-border-soft, #EDE9E0);
}
.sidebar-title {
  padding: 0 12px;
  font-size: 15px;
  color: var(--color-text-muted, #8A8578);
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
  background-color: var(--color-bg-secondary, #F7F3EA);
}
.sidebar-item.active {
  background-color: var(--color-primary-soft, #FBE9E7);
}
.sidebar-item-label {
  font-size: 16px;
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.sidebar-item-count {
  color: inherit;
}
.sidebar-item.active .sidebar-item-label {
  color: var(--color-primary, #C0392B);
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
  color: var(--color-text-primary, #1F1D1A);
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
  border: 0.7px solid var(--color-border, #E5DFD3);
  border-radius: 10px;
  background-color: var(--color-bg-card, #FCFBF8);
  font-size: 15px;
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  cursor: pointer;
  transition: background-color 0.2s;
}
.btn-outline:hover {
  background-color: var(--color-bg-secondary, #F7F3EA);
}
.btn-outline:disabled { opacity: 0.7; cursor: wait; }
.btn-outline .spinning { animation: spin 1s linear infinite; display: inline-flex; }
.export-progress {
  width: 140px;
  height: 5px;
  border-radius: 9999px;
  background-color: var(--color-bg-secondary, #F7F3EA);
  overflow: hidden;
  align-self: center;
}
.export-progress-bar {
  height: 100%;
  border-radius: 9999px;
  background-color: var(--color-primary, #C0392B);
  transition: width 0.25s ease;
}
.btn-outline .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 17px;
  color: var(--color-text-body, #3A3A3A);
}

.table-card {
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 12px;
  background-color: var(--color-bg-white, #FFFFFF);
  overflow: hidden;
}
.extract-table {
  width: 100%;
  border-collapse: collapse;
}
.extract-table thead tr {
  background-color: var(--color-bg-secondary, #F7F3EA);
}
.extract-table th {
  height: 54px;
  padding: 0 24px;
  font-size: 15px;
  font-weight: 400;
  color: var(--color-text-secondary, #6E6A60);
  text-align: left;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.extract-table th.col-name,
.extract-table td.col-name {
  width: 220px;
  min-width: 220px;
}
.extract-table th.col-value,
.extract-table td.col-value {
  width: auto;
}
.extract-table th.col-page,
.extract-table td.col-page {
  width: 110px;
  min-width: 110px;
}
.extract-table th.col-action,
.extract-table td.col-action {
  width: 130px;
  min-width: 130px;
}
.extract-table td {
  height: 82px;
  padding: 0 24px;
  font-size: 16px;
  vertical-align: middle;
  border-top: 0.7px solid var(--color-border-soft, #EDE9E0);
  box-sizing: border-box;
}
.extract-table tbody tr:nth-child(2n) {
  background-color: var(--color-bg-card, #FCFBF8);
}
.data-row .col-name {
  font-weight: 500;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
}
.data-row .col-value {
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.data-row .col-value span:first-child {
  display: block;
}
.row-chapter {
  display: block;
  font-size: 12px;
  color: var(--color-text-faint, #A7A296);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 520px;
}
.page-link {
  color: var(--color-text-secondary, #6E6A60);
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
  color: var(--color-text-secondary, #6E6A60);
}
.icon-btn:hover .icon { color: var(--color-primary, #C0392B); }
.empty-row td {
  height: auto;
  padding: 48px 0;
  text-align: center;
  vertical-align: middle;
  color: var(--color-text-muted, #8A8578);
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
  color: var(--color-text-secondary, #6E6A60);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.score-pill {
  height: 38px;
  padding: 0 16px;
  border: 0.7px solid #E5DCC2;
  border-radius: 8px;
  background-color: var(--color-bg-white, #FFFFFF);
  display: flex;
  align-items: center;
  font-size: 15px;
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.score-note {
  font-size: 15px;
  color: var(--color-text-secondary, #6E6A60);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.doc-tables-card {
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 12px;
  background-color: var(--color-bg-white, #FFFFFF);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.doc-tables-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.doc-tables-tip {
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-muted, #8A8578);
}
.doc-table-wrap { overflow-x: auto; }
.doc-table-meta {
  font-size: 13px;
  color: var(--color-text-secondary, #6E6A60);
  margin-bottom: 8px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.doc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.doc-table td {
  border: 0.7px solid var(--color-border, #E5DFD3);
  padding: 10px 14px;
  color: var(--color-text-body, #3A3A3A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  vertical-align: top;
}
.doc-table tr.is-header td {
  background-color: var(--color-bg-secondary, #F7F3EA);
  font-weight: 500;
  color: var(--color-text-primary, #1F1D1A);
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-info {
  font-size: 15px;
  color: var(--color-text-muted, #8A8578);
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
  border: 0.7px solid var(--color-border, #E5DFD3);
  border-radius: 8px;
  background-color: var(--color-bg-card, #FCFBF8);
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
  color: var(--color-text-secondary, #6E6A60);
}
.page-num {
  width: 34px;
  height: 34px;
  border: 0.7px solid var(--color-border, #E5DFD3);
  border-radius: 8px;
  background-color: var(--color-bg-card, #FCFBF8);
  font-size: 15px;
  color: var(--color-text-body, #3A3A3A);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.page-num.active {
  background-color: var(--color-primary, #C0392B);
  border-color: var(--color-primary, #C0392B);
  color: #fff;
  font-weight: 500;
}

/* Loading & Error */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 253, 248, 0.92);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  z-index: 10;
  border-radius: 10px;
}
.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border-soft, #EDE9E0);
  border-top-color: var(--color-primary, #C0392B);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text {
  font-size: 14px;
  color: var(--color-text-muted, #8A8578);
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}
.table-card.is-loading { position: relative; }
</style>
