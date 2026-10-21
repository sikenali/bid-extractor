import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { OfficeParser } from 'officeparser';
import { db, decrypt } from '../database.js';

// ═══════════════════════════════════════════════════════════
// Types (aligned with V1.3 design doc §5 JSON Schema)
// ═══════════════════════════════════════════════════════════

export interface MarkedItem {
  symbol: string;
  text: string;
  page: number;
}

export interface Chapter {
  title: string;
  content: string[];
  page: number;
  path?: string[];
}

export interface ParagraphMeta {
  text: string;
  paraId: number;
  chapter: string;
  chapterPath: string[];
  level: number;
  page: number;
}

export interface TableMeta {
  tableId: string;
  markdown: string;
  page: number;
  chapter: string;
  rows: string[][];
  group: string;
}

/** 虚拟表格：由文字段落解析得到的类表格结构 */
export interface VirtualTableMeta {
  tableId: string;
  page: number;
  chapter: string;
  rows: string[][];
  group: string;
  source: 'text_description';
}

export interface FieldExtract {
  value: string | null;
  page: number | null;
  chapter: string;
  group: string;
  sourceText?: string;
  paraIds: number[];
  score?: number;
  confidence?: number;
  source?: 'regex' | 'keyword' | 'llm' | 'title_fallback' | 'table' | 'context';
}

/** V1.3 最终输出结构 */
export interface ExtractOutput {
  fileMeta: {
    fileName: string;
    fileMd5: string;
    parseTime: string;
    parser: string;
    warningList: string[];
  };
  documentStructure: Chapter[];
  extractResult: {
    [field: string]: FieldExtract;
  };
  validateResult: {
    isPass: boolean;
    validateMsg: string;
    checkItems: Array<{ checkName: string; status: 'ok' | 'warn' | 'error'; msg: string }>;
  };
  extractMode: 'rule_only' | 'llm_enhanced';
  markedItems: MarkedItem[];
  tables: TableMeta[];
  virtualTables: VirtualTableMeta[];
  paragraphsMeta: ParagraphMeta[];
  pageCount: number;
  // 兼容前端结果契约（顶层扁平字段）
  extracts?: Record<string, FieldExtract>;
  groups?: Record<string, string>;
  fieldParaMap?: Record<string, number>;
  fieldGroups?: Record<string, string>;
  chapters?: Chapter[];
  paraToPage?: number[];
}

// ═══════════════════════════════════════════════════════════
// Constants & Helpers
// ═══════════════════════════════════════════════════════════

const SUPPORTED_EXT = ['.docx', '.pdf', '.md', '.txt', '.xlsx', '.wps', '.doc', '.csv', '.html', '.odt', '.rtf', '.pptx'];

const STAR_SYMBOLS = ['★', '▲', '●', '◆', '※', '✦', '✧', '⬤', '🔴', '⭐', '❗', '○', '*'];

const SECTION_STARTERS = [
  '一、', '二、', '三、', '四、', '五、', '六、', '七、', '八、',
  '（一）', '（二）', '（三）', '（四）', '（五）',
  '第一章', '第二章', '第三章', '第四章', '第五章',
];

function isSectionStart(text: string): boolean {
  for (const s of SECTION_STARTERS) {
    if (text.startsWith(s)) return true;
  }
  return false;
}

function cellToMarkdown(s: string): string {
  return s.replace(/\n/g, '<br>').replace(/\|/g, '\\|');
}

function buildTableMarkdown(rows: string[][]): string {
  if (rows.length === 0) return '';
  const lines: string[] = [];
  lines.push('| ' + rows[0].map(cellToMarkdown).join(' | ') + ' |');
  lines.push('| ' + rows[0].map(() => '---').join(' | ') + ' |');
  for (const row of rows.slice(1)) {
    lines.push('| ' + row.map(cellToMarkdown).join(' | ') + ' |');
  }
  return lines.join('\n');
}

/**
 * 将文字描述段落解析为类表格行。
 * 识别模式：
 *   1. 编号条目：(1) xxx / 1. xxx / ①xxx 后跟"："分隔的值 → 两列（项目, 值）
 *   2. 纯"键：值"行（每行一个） → 两列
 *   3. 分号分隔的多字段行 → 多列（按出现次数推断列数）
 * 仅对 tech / score 分组文本生效，避免误解析无关段落。
 */
function parseTextToTable(text: string, group: string, page: number): string[][] | null {
  if (!['tech', 'score'].includes(group)) return null;
  const lines = text
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  if (lines.length < 2) return null;

  // 模式A：编号条目 "(n) xxx：yyy" / "n. xxx：yyy" / "①xxx：yyy"
  const kvRe = /^(.+?)[：:]\s*(.+)$/;
  const numLabelRe = /^(?:[(（]?\d+[)）．.\s、]|[①-⑩])[：:\s]?(.+?)[：:]\s*(.*)$/;

  // 模式B：▲/★/○ 符号引导的条目 "▲（1）xxx" / "★ xxx" / "○ xxx"
  const symbolItemRe = /^(?:[▲★○●◆※✦\*✧]|第\d+条|第\d+款)\s*[（\(]?\d+[)）]?\s*(.+?)\s*[；;，,。:]?\s*$/;
  const symbolKeyValueRe = /^(?:[▲★○●◆※✦\*✧]|第\d+条|第\d+款)\s*[（\(]?\d+[)）]?\s*(.+?)[：:]\s*(.+)$/;

  // 模式C：章节标题 + 内容 "3.1总体要求" → 下一行内容作为值
  const sectionRe = /^(\d+[\.、]\s*)?([^\n]{2,30})$/;

  const asNumRows: string[][] = [];
  const asKvRows: string[][] = [];
  const asSymbolRows: string[][] = [];
  const asSectionRows: string[][] = [];

  let pendingSection: string = '';
  let pendingContent: string = '';

  for (const line of lines) {
    // 优先匹配符号条目
    const sm = line.match(symbolKeyValueRe);
    if (sm) {
      asSymbolRows.push([sm[1].trim(), sm[2].trim()]);
      continue;
    }
    const sn = line.match(symbolItemRe);
    if (sn) {
      asSymbolRows.push([sn[1].trim(), '']);
      continue;
    }
    // 章节标题
    const sec = line.match(sectionRe);
    if (sec && !line.match(numLabelRe) && !line.match(kvRe)) {
      if (pendingSection && pendingContent) {
        asSectionRows.push([pendingSection, pendingContent]);
      }
      pendingSection = sec[2].trim();
      pendingContent = '';
      continue;
    }
    // 普通 kv
    const km = line.match(kvRe);
    if (km && km[1].trim().length < 40 && km[2].trim().length > 0) {
      asKvRows.push([km[1].trim(), km[2].trim()]);
    }
    // 编号条目
    const nm = line.match(numLabelRe);
    if (nm) {
      asNumRows.push([nm[1].trim(), nm[2].trim()]);
    }
    // 累积章节内容
    if (pendingSection && line.length > 5) {
      pendingContent += (pendingContent ? ' ' : '') + line;
    }
  }
  if (pendingSection) {
    asSectionRows.push([pendingSection, pendingContent]);
  }

  // 选出最优解析结果
  const candidates: { rows: string[][]; weight: number }[] = [
    { rows: asSymbolRows, weight: asSymbolRows.length * 2 },
    { rows: asSectionRows, weight: asSectionRows.length * 2 },
    { rows: asNumRows, weight: asNumRows.length },
    { rows: asKvRows, weight: asKvRows.length },
  ];
  candidates.sort((a, b) => b.weight - a.weight);
  for (const c of candidates) {
    if (c.rows.length >= 3) return c.rows.map(r => {
      while (r.length < 2) r.push('');
      return r.slice(0, 2);
    });
  }
  return null;
}

function extractVirtualTables(
  paras: FlatParagraph[],
  paraToPage: number[],
  tablesMeta: TableMeta[],
  fieldGroups: Record<string, string>,
  extracts: Record<string, FieldExtract>,
): VirtualTableMeta[] {
  const results: VirtualTableMeta[] = [];
  let vid = 0;

  // 策略1：对每个 extracts 中值较长的字段，尝试将其值解析为表格
  for (const [field, extract] of Object.entries(extracts)) {
    if (!extract?.value) continue;
    const group = fieldGroups[field] || extract.group || '';
    if (!['tech', 'score'].includes(group)) continue;
    const value = String(extract.value);
    if (value.split(/\n/).length < 3) continue;
      const rows = parseTextToTable(value, group, extract.page ?? 1);
    if (rows && rows.length >= 3) {
      results.push({
        tableId: `vt${vid++}`,
        page: extract.page ?? 1,
        chapter: extract.chapter || '',
        rows,
        group,
        source: 'text_description',
      });
    }
  }

  // 策略2：扫描段落中与 tech/score 关键词相关的长段落，尝试解析为表格
  const sectionKeywordPatterns: Record<string, RegExp> = {
    tech: /技术|参数|规格|配置|性能|验收|指标|服务|软件|硬件|系统|方案|质保|接口|安全|质量|资料|运维|交付|测试|部署|范围|实施|产品|设备|功能|安装|培训/i,
    score: /评分|分值|得分|权重|评标|商务分|技术分|价格分|满分|合格|评审|细则|因素/i,
  };
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.level !== 0) continue; // 跳过标题行
    const text = p.text.trim();
    if (!text || text.length < 30) continue;
    for (const [group, re] of Object.entries(sectionKeywordPatterns)) {
      if (!re.test(text)) continue;
      // 检查该段落是否含有多个编号或冒号条目
      const lineCount = text.split(/\n/).filter(l => l.trim().length > 0).length;
      if (lineCount < 3) continue;
       const rows = parseTextToTable(text, group, i < paraToPage.length ? paraToPage[i] : 1);
      if (rows && rows.length >= 3) {
        // 去重：相同页码+分组+首行内容完全一致则跳过
        const firstRowStr = rows[0].join('');
        const dup = results.some(vt =>
          vt.page === (i < paraToPage.length ? paraToPage[i] : 1) &&
          vt.group === group &&
          vt.rows[0].join('') === firstRowStr
        );
        if (!dup) {
          results.push({
            tableId: `vt${vid++}`,
            page: i < paraToPage.length ? paraToPage[i] : 1,
            chapter: p.chapter,
            rows,
            group,
            source: 'text_description',
          });
        }
      }
      break;
    }
  }

  return results;
}

interface FlatParagraph {
  text: string;
  chapter: string;
  level: number;
  /** 完整章节路径（从根到当前） */
  chapterPath: string[];
  /** 表格占位符序号（与 collectTables 顺序一致），用于表格锚定到最近上文段落 */
  tableIndex?: number;
}

/** 正则编译缓存：同一 pattern 全文只编译一次（规则数×段落数级调用，省去重复编译） */
const regexCache = new Map<string, RegExp | null>();
function cachedRegExp(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern)!;
  try {
    const re = new RegExp(pattern);
    regexCache.set(pattern, re);
    return re;
  } catch {
    regexCache.set(pattern, null);
    return null;
  }
}

/** officeparser 节点文本可能在 n.text，也可能嵌在 children 里 */
function nodeText(n: any): string {
  if (!n) return '';
  if (typeof n.text === 'string' && n.text.trim()) return n.text;
  const parts: string[] = [];
  for (const c of n.children || []) {
    const t = nodeText(c);
    if (t) parts.push(t);
  }
  return parts.join('');
}

function flattenContent(nodes: any[]): FlatParagraph[] {
  const out: FlatParagraph[] = [];
  let chapterStack: string[] = [];
  let tableCount = 0;
  const walk = (list: any[]) => {
    for (const n of list) {
      if (!n) continue;
      if (n.type === 'heading') {
        const level = n.metadata?.level ?? 1;
        const title = nodeText(n).trim();
        if (title) {
          // 根据层级截断栈：level 2 的标题会截断 level 3+ 的子章节
          chapterStack = chapterStack.slice(0, level - 1);
          chapterStack.push(title);
        }
        out.push({
          text: title,
          chapter: title,
          chapterPath: [...chapterStack],
          level,
        });
      } else if (n.type === 'paragraph') {
        const t = nodeText(n).trim();
        if (t) out.push({
          text: t,
          chapter: chapterStack[chapterStack.length - 1] || '',
          chapterPath: [...chapterStack],
          level: 0,
        });
      } else if (n.type === 'table') {
        // 表格占位：保留位置信息供表格锚定，文本为空不参与检索
        out.push({
          text: '',
          chapter: chapterStack[chapterStack.length - 1] || '',
          chapterPath: [...chapterStack],
          level: -1,
          tableIndex: tableCount++,
        });
      } else if (n.children && n.children.length) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

function collectTables(nodes: any[]): string[][][] {
  const tables: string[][][] = [];
  const walk = (list: any[]) => {
    for (const n of list) {
      if (!n) continue;
      if (n.type === 'table') {
        const rows: string[][] = [];
        for (const row of n.children || []) {
          if (row.type !== 'row') continue;
          const cells: string[] = [];
          for (const cell of row.children || []) {
            if (cell.type !== 'cell') continue;
            cells.push(nodeText(cell).trim());
          }
          rows.push(cells);
        }
        tables.push(rows);
      } else if (n.children && n.children.length) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return tables;
}

function buildParagraphsMeta(paras: FlatParagraph[], paraToPage: number[]): ParagraphMeta[] {
  return paras.map((p, i) => ({
    text: p.text,
    paraId: i,
    chapter: p.chapter,
    chapterPath: p.chapterPath,
    level: p.level,
    page: i < paraToPage.length ? paraToPage[i] : 1,
  }));
}

function buildChapters(paras: FlatParagraph[], paraToPage: number[]): Chapter[] {
  const chapters: Chapter[] = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.level === -1) continue; // 表格占位符不参与章节划分
    if (p.level > 0 || isSectionStart(p.text)) {
      chapters.push({
        title: p.text,
        content: [],
        page: i < paraToPage.length ? paraToPage[i] : 1,
        path: p.chapterPath,
      });
    } else if (chapters.length > 0) {
      chapters[chapters.length - 1].content.push(p.text);
    }
  }
  return chapters;
}

function buildParaToPage(paras: FlatParagraph[]): { paraToPage: number[]; pageCount: number } {
  const totalChars = paras.reduce((sum, p) => sum + [...p.text].length, 0);
  // 自适应每页字符数：文档越长单页容量越大，但上限 2000、下限 600
  let estimatedPages = totalChars > 0 ? Math.max(1, Math.round(totalChars / 1400)) : 1;
  if (estimatedPages > 200) estimatedPages = 200;
  const charsPerPage = Math.min(2000, Math.max(600, totalChars / estimatedPages));
  const paraToPage: number[] = new Array(paras.length).fill(1);
  let accumulated = 0;
  let currentPage = 1;
  for (let i = 0; i < paras.length; i++) {
    accumulated += [...paras[i].text].length;
    paraToPage[i] = currentPage;
    if (accumulated >= charsPerPage * currentPage) currentPage++;
  }
  // 章节锚点修正：同一 chapterPath 内的段落尽量落在同一页区间
  const pathGroups: Record<string, number[]> = {};
  for (let i = 0; i < paras.length; i++) {
    const path = (paras[i].chapterPath || []).join('||');
    if (!pathGroups[path]) pathGroups[path] = [];
    pathGroups[path].push(i);
  }
  for (const indices of Object.values(pathGroups)) {
    if (indices.length <= 1) continue;
    const firstPage = paraToPage[indices[0]];
    const lastPage  = paraToPage[indices[indices.length - 1]];
    if (firstPage === lastPage) continue;
    // 将该章节所有段落统一分配到其 span 中最多的页
    const pageFreq: Record<number, number> = {};
    for (const idx of indices) {
      const p = paraToPage[idx];
      pageFreq[p] = (pageFreq[p] || 0) + 1;
    }
    let modalPage = indices[0];
    for (const [p, cnt] of Object.entries(pageFreq)) {
      if (cnt > (pageFreq[modalPage] || 0)) modalPage = Number(p);
    }
    for (const idx of indices) {
      paraToPage[idx] = modalPage;
    }
  }
  return { paraToPage, pageCount: Math.max(1, currentPage - 1) };
}

const SCORE_TABLE_KEYWORDS = ['评分', '分值', '得分', '权重', '评标', '商务分', '技术分', '价格分', '评分项', '分项'];
const SCORE_CORE_KEYWORDS = ['评分', '分值', '得分', '权重', '评标'];
const TECH_TABLE_KEYWORDS = ['技术', '参数', '规格', '配置', '设备', '性能', '服务', '验收', '指标', '系统', '软件', '硬件', '方案', '质保'];
// 评分表特有的表头特征词（技术条款表一般不含）
const SCORE_HEADER_EXCLUSIVES = ['评分', '分值', '得分', '权重', '评标', '分项', '因素'];

function detectTableGroup(rows: string[][]): string {
  const text = rows.flat().join(' ');
  const count = (kws: string[]) => kws.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
  const scoreHits = count(SCORE_TABLE_KEYWORDS);
  const scoreCoreHits = count(SCORE_CORE_KEYWORDS);
  const techHits = count(TECH_TABLE_KEYWORDS);
  // 评分表优先判断：只要核心评分词 ≥1 且比技术词多（或技术词也不多的情况下）
  // 评分表的行通常包含"评分/分值/得分/权重"，技术表主要含"技术参数/规格"
  if (scoreCoreHits >= 1 && scoreCoreHits > techHits) return 'score';
  // 如果行中存在明显的评分表头特征（如"评分项""分值分配"）且不含太多技术词
  const headerOnly = rows.slice(0, 1).flat().join(' ');
  const headerScoreHits = SCORE_HEADER_EXCLUSIVES.filter(k => headerOnly.includes(k)).length;
  if (headerScoreHits >= 1 && techHits < 2) return 'score';
  if (scoreHits >= 2 && scoreHits >= techHits) return 'score';
  if (techHits >= 2) return 'tech';
  // 纯数字列辅助判断：表头 ≥2 列全为纯数字 → 高概率为评分列
  if (rows.length >= 2) {
    const headerRow = rows[0].map(c => c.trim());
    let numColCount = 0;
    for (const cell of headerRow) {
      if (/^\d+$/.test(cell)) numColCount++;
    }
    if (numColCount >= 2 && scoreHits === 0 && techHits < 2) return 'score';
  }
  return '';
}

/** 从评分表格中提取技术/商务/价格评分值 */
function parseScoreTable(tables: { rows: string[][] }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const tbl of tables) {
    if (tbl.rows.length < 2) continue;
    const headerRow = tbl.rows[0].map(c => c.trim());
    // 找分值行（首列为"分值"/"分数"/"得分"或纯数字）
    let scoreRowIdx = -1;
    for (let ri = 0; ri < tbl.rows.length; ri++) {
      const row = tbl.rows[ri].map(c => c.trim());
      if (row[0] === '分值' || row[0] === '分数' || row[0] === '得分' || /^\d+$/.test(row[0])) {
        scoreRowIdx = ri;
        break;
      }
    }
    if (scoreRowIdx < 0) scoreRowIdx = 1;
    const scoreRow = tbl.rows[scoreRowIdx]?.map(c => c.trim()) || [];
    // 从首行识别评分列
    const scoreCols: { colIdx: number; key: string }[] = [];
    const scoreKeys = ['技术评分', '商务评分', '价格评分'];
    for (let ci = 0; ci < headerRow.length; ci++) {
      for (const key of scoreKeys) {
        if (headerRow[ci].includes(key)) { scoreCols.push({ colIdx: ci, key }); break; }
      }
    }
    if (scoreCols.length > 0) {
      for (const { colIdx, key } of scoreCols) {
        const m = (scoreRow[colIdx] || '').match(/(\d+(?:\.\d+)?)/);
        if (m) result[key] = m[1] + '分';
      }
      continue;
    }
    // 兜底：在分值行中按顺序匹配数值
    if (scoreRow.length >= 2) {
      const nums = scoreRow.filter(c => /^\d+(?:\.\d+)?$/.test(c));
      if (nums.length >= 1 && !result['技术评分']) result['技术评分'] = nums[0] + '分';
      if (nums.length >= 2 && !result['商务评分']) result['商务评分'] = nums[1] + '分';
      if (nums.length >= 3 && !result['价格评分']) result['价格评分'] = nums[2] + '分';
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// Extraction Engine
// ═══════════════════════════════════════════════════════════

interface FieldRule {
  id: string;
  fieldName: string;
  group: string;
  bizType: string;
  pattern: string;
  category: string;
  aliasFor: string;
}

function loadFieldRules(): FieldRule[] {
  const rows = db.prepare(
    'SELECT id, field_name, group_name, biz_type, pattern, category, alias_for FROM extraction_rules WHERE enabled = 1'
  ).all() as Array<{
    id: string;
    field_name: string;
    group_name: string;
    biz_type: string;
    pattern: string;
    category: string;
    alias_for: string;
  }>;
  return rows.map(r => ({
    id: r.id,
    fieldName: r.field_name,
    group: r.group_name || 'info',
    bizType: (r.biz_type || '').trim() || r.group_name || 'info',
    pattern: r.pattern || '',
    category: r.category || 'keyword',
    aliasFor: (r.alias_for || '').trim(),
  }));
}

/** 段落 + 表格单元格统一检索单元 */
export interface SearchUnit {
  text: string;
  page: number;
  chapter: string;
  level: number;
  paraId: number;
  tableId?: string;
  row?: number;
  col?: number;
}

/** 清洗候选取值：去引导符号、截断句长、遇到其他字段名截断 */
function cleanValue(raw: string, nameRe: RegExp | null, self: string): string | null {
  if (nameRe) nameRe.lastIndex = 0;
  let v = (raw || '').trim().replace(/^[：:、,，；;\s]+/, '').trim();
  if (!v) return null;
  // 编号条目开头（(2)/5.2/3、…）是目录/条款序号，不是取值
  if (/^[(（]?\d+[、．.·)）]/.test(v)) return null;
  // 拒绝网址/URL（投标地点等字段不应匹配到网址）
  if (/^(?:https?:\/\/|www\.)/.test(v)) return null;
  // 拒绝网页操作提示（项目名称等字段不应匹配到"查询"、"点击"等）
  if (/^(查询|点击|我要参与|登录|注册|搜索)/.test(v)) return null;
  // 拒绝以"名称："开头的值（采购人等字段应只取名称部分）
  v = v.replace(/^名称[：:]\s*/, '').trim();
  // 拒绝以"人民币"开头的金额（预算金额等字段应只取数字）
  v = v.replace(/^人民币\s*/, '').trim();
  // 字段名前缀截断：遇到下一个字段名（如 "项目编号：ABC  采购方式：XYZ"）时立即截断
  if (nameRe) {
    nameRe.lastIndex = 0;
    let m2: RegExpExecArray | null;
    while ((m2 = nameRe.exec(v)) !== null) {
      if (m2[0] === '' || m2[0] === self || [...m2[0]].length < 2) continue;
      const before = v.slice(0, m2.index);
      const hasSep = m2.index === 0 || /[：:\s,，；;\n(（]/.test(before.slice(-1));
      if (hasSep) {
        v = before.replace(/[：:、,，；;\s]+$/, '').trim();
        if (!v) return null;
        break;
      }
    }
  }
  const end = v.match(/[。；;\n]/);
  if (end && end.index !== undefined && end.index < 200) v = v.slice(0, end.index);
  else if (v.length > 200) v = v.slice(0, 200);
  v = truncateAtOtherFields(v, nameRe, self);
  v = v.replace(/(\s*的\s*)+$/, '').trim();
  return v.trim() || null;
}

const HAS_LABEL = /[：:]/;

/** 标签后缀列表：以这些结尾的短文本大概率是标签而非值 */
const LABEL_SUFFIXES = [
  '地址', '电话', '传真', '邮箱', '方式', '要求', '标准', '数量', '期限',
  '须知', '说明', '概述', '概况', '内容', '范围', '条件', '资格', '地点',
  '时间', '日期', '单位', '联系人', '明细', '清单', '规范', '细则', '办法',
  '指南', '承诺', '声明', '证书', '执照', '文件', '资料', '材料', '证明',
  '报告', '方案', '图纸', '表格', '附件',
];

function isBareLabelLike(v: string): boolean {
  const t = v.trim();
  if (/[0-9]/.test(t)) return false;
  return LABEL_SUFFIXES.some(s => t.endsWith(s));
}

/**
 * 全角冒号标签剥离：中文文档表格/段落常用"标签：取值"写法，
 * 全角"："后基本是取值；半角":"多为时间/比例（如 9:00），予以保留不拦截。
 */
function stripFullwidthLabel(s: string): string {
  const t = (s || '').trim();
  const ci = t.indexOf('：');
  if (ci >= 0) return t.slice(ci + 1).trim();
  return t;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 把全部字段名预编译为单个正则（最长优先），一次扫描替代逐字段 indexOf。
 * 在 applyRuleExtraction 内构建一次，逐候选复用。
 */
function buildFieldNamePattern(names: string[]): RegExp | null {
  const uniq = [...new Set(names.filter(n => n && [...n].length >= 2))]
    .sort((a, b) => [...b].length - [...a].length);
  if (uniq.length === 0) return null;
  return new RegExp(uniq.map(escapeRegExp).join('|'), 'g');
}

// ── 通配符字段名（如 *编号 / 编号* / *编号*）──────────────────────
// 仅当名称含 * 且还有其它字符才视为通配符；纯 "*"（标星符号）保持字面匹配
function isWildcardName(name: string): boolean {
  return name.includes('*') && name.replace(/\*/g, '').length > 0;
}

/** 取通配符名中最长的字面子串作为锚点（如 *编号 → 编号） */
function wildcardLiteralCore(name: string): string {
  let best = '';
  for (const seg of name.split('*')) {
    if (seg.length > best.length) best = seg;
  }
  return best;
}

const LABEL_CHAR = /[\u4e00-\u9fff0-9A-Za-z_]/;
const LABEL_STOP = new Set('的了之在与和及或是为于本次此该各所有其他以及或者例如比如其这那');

/**
 * 在 text 中定位通配符标签：以字面锚点（如"编号"）为核心，
 * 向两侧按标签字符扩展（上限 前6/后3，遇标点/连接词即停），
 * 返回长度最短的一次命中——保证 *编号 得"标识编号"而非"求分配唯一的标识编号"。
 */
function locateWildcardLabel(text: string, name: string): { ns: number; ne: number; name: string } | null {
  const core = wildcardLiteralCore(name);
  if (!core) return null;
  let best: { ns: number; ne: number; name: string } | null = null;
  let searchFrom = 0;
  for (;;) {
    const at = text.indexOf(core, searchFrom);
    if (at < 0) break;
    const ce = at + core.length;
    let s = at;
    let left = 0;
    while (s > 0 && left < 6 && LABEL_CHAR.test(text[s - 1]) && !LABEL_STOP.has(text[s - 1])) {
      s--;
      left++;
    }
    let e = ce;
    let right = 0;
    while (e < text.length && right < 3 && LABEL_CHAR.test(text[e]) && !LABEL_STOP.has(text[e])) {
      e++;
      right++;
    }
    const matchedName = text.slice(s, e).trim();
    if (matchedName && (!best || [...matchedName].length < [...best.name].length)) {
      best = { ns: s, ne: e, name: matchedName };
      if ([...matchedName].length <= 2) break;
    }
    searchFrom = at + core.length;
  }
  return best;
}

function calculateConfidence(
  matchType: 'regex' | 'keyword',
  atStart: boolean,
  followedColon: boolean,
  textLength: number,
): number {
  let confidence = 5;
  if (matchType === 'regex') {
    confidence = 7;
    if (atStart) confidence += 2;
    if (followedColon) confidence += 1;
  } else {
    if (followedColon) confidence += 1;
  }
  if (textLength > 200) confidence -= 1;
  return Math.min(10, Math.max(1, confidence));
}

function truncateAtOtherFields(value: string, nameRe: RegExp | null, self: string): string {
  if (!nameRe) return value;
  nameRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  // 只截断第一个非self的字段名，且该字段名前有明确分隔符（标点/换行/行首），避免误切
  while ((m = nameRe.exec(value)) !== null) {
    if (m[0] === '') { nameRe.lastIndex++; continue; }
    if (m[0] === self || [...m[0]].length < 2) continue;
    // 只有当匹配位置前有标点或处于字符串开头时才截断，避免切到值中间的字段名字符串
    const before = value.slice(0, m.index);
    const hasSeparator = m.index === 0 || /[：:\s,，；;\n]/.test(before.slice(-1));
    if (!hasSeparator) continue;
    return before.replace(/[：:、,，；;\s]+$/, '').trim();
  }
  return value;
}

/**
 * 五方向取值：后 → 右/下（表格相邻格）→ 下（下一段）→ 上（上一段）→ 前（同行之前）
 */
function extractFromUnit(
  unit: SearchUnit,
  units: SearchUnit[],
  idx: number,
  grids: Map<string, string[][]>,
  rule: FieldRule,
  nameRe: RegExp | null,
): { value: string; paraId: number; sourceText: string; score: number; confidence: number; source: 'regex' | 'keyword' } | null {
  const text = unit.text;
  const trimmedStart = text.length - text.trimStart().length;
  const textLength = [...text].length;

  // 0. 正则优先（精度最高）
  //    DOCX 文本常被拆分成多段，仅在当段以冒号/引导符结尾时才与下一段合并
  //    捕获值统一走 cleanValue：截断其他字段名/超长/句末，保证与关键字路径一致的干净取值
  if (rule.category === 'regex' && rule.pattern) {
    const re = cachedRegExp(rule.pattern);
    if (re) {
      const m = text.match(re);
      if (m) {
        const v = cleanValue((m[1] || m[0]) || '', nameRe, rule.fieldName);
        if (v) {
          const regexAtStart = m.index !== undefined && m.index <= trimmedStart;
          const afterRe = m.index !== undefined ? text[m.index + m[0].length] : '';
          const regexFollowedColon = afterRe === '：' || afterRe === ':';
          let score = 2;
          if (regexAtStart) score += 3;
          if (regexFollowedColon) score += 2;
          if ([...text].length < 60) score += 1;
          if (/[目录章节篇表格式一览]$/.test(v.trim())) score -= 5;
          return {
            value: v,
            paraId: unit.paraId,
            sourceText: text,
            score,
            confidence: calculateConfidence('regex', regexAtStart, regexFollowedColon, textLength),
            source: 'regex',
          };
        }
      }
       // 仅当当前段以冒号/引导符结尾时才尝试合并下一段（避免跨段误匹配）
       const lastChar = text.trimEnd().slice(-1);
       if (lastChar === '：' || lastChar === ':') {
         for (let k = 1; k <= 2; k++) {
           const nu = units[idx + k];
           if (!nu || nu.tableId != null || !nu.text.trim()) continue;
           if (nu.level > 0) break;
           const merged = text + nu.text;
           const mm = merged.match(re);
           if (mm) {
             const v = cleanValue((mm[1] || mm[0]) || '', nameRe, rule.fieldName);
             if (v) {
               let score = 2;
               if (/[目录章节篇表格式一览]$/.test(v.trim())) score -= 5;
               return {
                 value: v,
                 paraId: unit.paraId,
                 sourceText: merged,
                 score,
                 confidence: 6,
                 source: 'regex',
               };
             }
           }
         }
       }
     }
   }

  // 关键字在本段内逐个出现位置尝试：跳过"复合长词标签"
  const CJK = /[\u4e00-\u9fff]/;
  let kidx = -1;
  let searchFrom = 0;
  let atStart = false;
  let followedColon = false;
  for (let t = 0; t < 5; t++) {
    const found = text.indexOf(rule.fieldName, searchFrom);
    if (found < 0) return null;
    const after = text[found + rule.fieldName.length] || '';
    // 跳过"采购人名称："中匹配到"采购人"的情况
    if (CJK.test(after) && /^[\u4e00-\u9fff]+[：:]/.test(text.slice(found + rule.fieldName.length, found + rule.fieldName.length + 12))) {
      searchFrom = found + rule.fieldName.length;
      continue;
    }
    kidx = found;
    atStart = kidx <= trimmedStart;
    followedColon = after === '：' || after === ':';
    break;
  }
  if (kidx < 0) return null;
  // 单字规则（如 ★ ▲ *）只匹配行首
  if ([...rule.fieldName].length === 1 && text.trimStart().indexOf(rule.fieldName) !== 0) return null;

  const confidence = calculateConfidence('keyword', atStart, followedColon, textLength);

  const scoreOf = (base: number, val: string): number => {
    let s = base;
    if (atStart) s += 3;
    if (followedColon) s += 2;
    if ([...text].length < 60) s += 1;
    const len = [...val].length;
    if (len >= 2 && len <= 100) s += 1;
    else if (len < 2) s -= 3;
    if (/[目录章节篇表格式一览]$/.test(val.trim())) s -= 5;
    return s;
  };

  // 1. 后：同行关键字之后
  let v = cleanValue(text.slice(kidx + rule.fieldName.length), nameRe, rule.fieldName);
  if (v) return { value: v, paraId: unit.paraId, sourceText: text, score: scoreOf(1, v), confidence, source: 'keyword' };

  // 2. 右 / 下：表格相邻格（裸标签邻格由守卫过滤）
  if (unit.tableId != null) {
    const grid = grids.get(unit.tableId);
    if (grid && unit.row !== undefined && unit.col !== undefined) {
      const right = (grid[unit.row] || [])[unit.col + 1] || '';
      if (right.trim() && !HAS_LABEL.test(right)) {
        v = cleanValue(right, nameRe, rule.fieldName);
        if (v && isBareLabelLike(v)) v = null;
        if (v) return { value: v, paraId: unit.paraId, sourceText: `${text} ${right.trim()}`, score: scoreOf(2, v), confidence, source: 'keyword' };
      }
      const belowRow = grid[unit.row + 1];
      const below = (belowRow || [])[unit.col] || '';
      if (below.trim() && !HAS_LABEL.test(below)) {
        v = cleanValue(below, nameRe, rule.fieldName);
        if (v && isBareLabelLike(v)) v = null;
        if (v) return { value: v, paraId: unit.paraId, sourceText: `${text} ${below.trim()}`, score: scoreOf(2, v), confidence, source: 'keyword' };
      }
    }
    return null;
  }

  // 3. 前：同行关键字之前（同行证据较强）
  const before = text.slice(0, kidx);
  if (before.trim() && [...before].length <= 100) {
    v = cleanValue(before, nameRe, rule.fieldName);
    // 去"（以下简称…"后缀取正主
    if (v) v = v.split(/[（(]/)[0].trim() || null;
    if (v) return { value: v, paraId: unit.paraId, sourceText: text, score: scoreOf(2, v), confidence, source: 'keyword' };
  }

  // 4. 下：下一段（跳过空行；遇标题或目录行止步）
  for (let j = idx + 1; j < units.length; j++) {
    const nu = units[j];
    if (nu.tableId != null) continue;
    if (!nu.text.trim()) continue;
    if (nu.level > 0) break;
    if (/^\d+[\s.、．·]/.test(nu.text.trim())) break;
    if (HAS_LABEL.test(nu.text)) break;
    v = cleanValue(nu.text, nameRe, rule.fieldName);
    if (v && isBareLabelLike(v)) break;
    if (v) return { value: v, paraId: nu.paraId, sourceText: `${text}\n${nu.text}`, score: scoreOf(-1, v), confidence, source: 'keyword' };
    break;
  }

  // 5. 上：上一段（严格守卫：非标题、非目录行、无冒号）
  for (let j = idx - 1; j >= 0; j--) {
    const pu = units[j];
    if (pu.tableId != null) continue;
    if (!pu.text.trim()) continue;
    if (pu.level > 0 || isSectionStart(pu.text)) break;
    if (/^\d+[\s.、．·]/.test(pu.text.trim())) break;
    if (HAS_LABEL.test(pu.text)) break;
    if ([...pu.text].length > 100) break;
    v = cleanValue(pu.text, nameRe, rule.fieldName);
    if (v && isBareLabelLike(v)) break;
    // 上位值多为日期/金额/长名称：无数字又短的不采信
    if (v && !/[0-9]/.test(v) && [...v].length < 10) break;
    if (v) return { value: v, paraId: pu.paraId, sourceText: `${pu.text}\n${text}`, score: scoreOf(-1, v), confidence, source: 'keyword' };
    break;
  }
  return null;
}

/**
 * 通配符字段名提取：规则字段名含 *（如 *编号 / 编号* / *编号*）时，
 * 编译为惰性正则全文扫描；命中片段扩展为完整词作为实际命中的字段名，
 * 取值沿用五方向逻辑（优先"自动名称后"即关键字之后，其次下一段/上一段）。
 */
function extractWildcardFromUnit(
  unit: SearchUnit,
  units: SearchUnit[],
  idx: number,
  grids: Map<string, string[][]>,
  rule: FieldRule,
  nameRe: RegExp | null,
): { value: string; paraId: number; sourceText: string; score: number; matchedName: string; ns: number; ne: number } | null {
  const text = unit.text;
  const trimmedStart = text.length - text.trimStart().length;

  // 定位最短通配符标签（如 *编号 → "标识编号" 而非整句）
  const loc = locateWildcardLabel(text, rule.fieldName);
  if (!loc) return null;
  const matchedName = loc.name;
  const ns = loc.ns;
  const ne = loc.ne;

  const atStart = ns <= trimmedStart;
  const followedColon = text[ne] === '：' || text[ne] === ':';

  const scoreOf = (base: number, val: string): number => {
    let s = base;
    if (atStart) s += 3;
    if (followedColon) s += 2;
    if ([...text].length < 60) s += 1;
    const len = [...val].length;
    if (len >= 2 && len <= 100) s += 1;
    else if (len < 2) s -= 3;
    if (/[目录章节篇表格式一览]$/.test(val.trim())) s -= 5;
    return s;
  };

  // 1. 后：自动名称之后（第一段文字）
  let v = cleanValue(text.slice(ne), nameRe, matchedName);
  if (v) return { value: v, paraId: unit.paraId, sourceText: text, score: scoreOf(1, v), matchedName, ns, ne };

  // 2. 右 / 下：表格相邻格
  if (unit.tableId != null) {
    const grid = grids.get(unit.tableId);
    if (grid && unit.row !== undefined && unit.col !== undefined) {
      const right = stripFullwidthLabel((grid[unit.row] || [])[unit.col + 1] || '');
      if (right && !/[：]/.test(right)) {
        v = cleanValue(right, nameRe, matchedName);
        if (v && isBareLabelLike(v)) v = null;
        if (v) return { value: v, paraId: unit.paraId, sourceText: `${text} ${right.trim()}`, score: scoreOf(2, v), matchedName, ns, ne };
      }
      const below = stripFullwidthLabel((grid[unit.row + 1] || [])[unit.col] || '');
      if (below && !/[：]/.test(below)) {
        v = cleanValue(below, nameRe, matchedName);
        if (v && isBareLabelLike(v)) v = null;
        if (v) return { value: v, paraId: unit.paraId, sourceText: `${text} ${below.trim()}`, score: scoreOf(2, v), matchedName, ns, ne };
      }
    }
    return null;
  }

  // 3. 前：自动名称之前（同行证据较强）
  const before = text.slice(0, ns);
  if (before.trim() && [...before].length <= 100) {
    v = cleanValue(before, nameRe, matchedName);
    if (v) v = v.split(/[（(]/)[0].trim() || null;
    if (v) return { value: v, paraId: unit.paraId, sourceText: text, score: scoreOf(2, v), matchedName, ns, ne };
  }

  // 4. 下：自动名称后的下一段
  for (let j = idx + 1; j < units.length; j++) {
    const nu = units[j];
    if (nu.tableId != null) continue;
    if (!nu.text.trim()) continue;
    if (nu.level > 0) break;
    if (/^\d+[\s.、．·]/.test(nu.text.trim())) break;
    if (HAS_LABEL.test(nu.text)) break;
    v = cleanValue(nu.text, nameRe, matchedName);
    if (v && isBareLabelLike(v)) break;
    if (v) return { value: v, paraId: nu.paraId, sourceText: `${text}\n${nu.text}`, score: scoreOf(-1, v), matchedName, ns, ne };
    break;
  }

  // 5. 上：上一段
  for (let j = idx - 1; j >= 0; j--) {
    const pu = units[j];
    if (pu.tableId != null) continue;
    if (!pu.text.trim()) continue;
    if (pu.level > 0 || isSectionStart(pu.text)) break;
    if (/^\d+[\s.、．·]/.test(pu.text.trim())) break;
    if (HAS_LABEL.test(pu.text)) break;
    if ([...pu.text].length > 100) break;
    v = cleanValue(pu.text, nameRe, matchedName);
    if (v && isBareLabelLike(v)) break;
    if (v && !/[0-9]/.test(v) && [...v].length < 10) break;
    if (v) return { value: v, paraId: pu.paraId, sourceText: `${pu.text}\n${text}`, score: scoreOf(-1, v), matchedName, ns, ne };
    break;
  }
  return null;
}

/** 标题兜底提取：对没有标签但形似项目名的首段直接返回 */
function extractTitleProjectName(paras: FlatParagraph[]): { value: string; score: number } | null {
  // 策略1：取前10段中第一个像项目名的（长度≥8，无冒号，纯中文/数字/空格组合，非标题行）
  for (let i = 0; i < Math.min(10, paras.length); i++) {
    const p = paras[i];
    if (p.level > 0) continue; // 跳过标题行
    const t = p.text.trim();
    if (!t) continue;
    // 跳过已知非项目名称的行（含章节标题、引导词）
    if (/^(招\s*标|投\s*标|目\s*录|第|特\s*别|说\s*明|各潜在|投标人|投标人操作|章节|篇|注|章|招标文件|招标公告|投标邀请|公开|进行|采用|人民币|金额|合同|保证金|投标)/.test(t)) continue;
    if (t.length < 8) continue;
    if (/[：:]/.test(t)) continue;
    // 包含至少一个汉字且长度合理
    if (/[\u4e00-\u9fff]/.test(t) && t.length <= 120) {
      // 要求以项目类后缀结尾，避免日期/金额误中
      if (/项目|工程|服务|系统|采购|标的|任务|课题|计划$/.test(t)) {
        return { value: t, score: 8 }; // 标题兜底高分
      }
    }
  }
  // 策略2：在后续段落中找含"项目名称"或"就XXX项目"的长文本
  for (let i = 0; i < Math.min(30, paras.length); i++) {
    const p = paras[i];
    if (p.level > 0) continue;
    const t = p.text.trim();
    if (!t || t.length < 15) continue;
    // 匹配 "就[XXX服务项目] [招标编号" 这种常见句式
    const m = t.match(/就([^【\[]+?(?:项目|工程|服务|系统|采购)[^\s]*)((?:\s*\[|\s*[（(]))/);
    if (m) {
      const name = m[1].trim();
      if (name.length >= 6 && name.length <= 120) {
        return { value: name, score: 7 };
      }
    }
  }
  return null;
}

function applyRuleExtraction(
  rules: FieldRule[],
  units: SearchUnit[],
  grids: Map<string, string[][]>,
  paras: FlatParagraph[],
  paraToPage?: number[],
): { extracts: Record<string, FieldExtract>; groups: Record<string, string>; fieldParaMap: Record<string, number>; fieldGroups: Record<string, string> } {
  const extracts: Record<string, FieldExtract> = {};
  const groups: Record<string, string> = {};
  const fieldParaMap: Record<string, number> = {};
  const fieldGroups: Record<string, string> = {};
  const nameRe = buildFieldNamePattern(rules.map(r => r.fieldName));

  // ── 别名扩展：将 alias_for 规则中的字段名映射到主字段名 ──────────────────
  // 例如：招标编号 → 项目编号，最高限价 → 预算金额
  const aliasMap: Record<string, string> = {};
  for (const r of rules) {
    if (r.aliasFor && r.aliasFor !== r.fieldName) {
      aliasMap[r.fieldName] = r.aliasFor;
    }
  }
  // 反向：canonical → [aliases]
  const canonicalToAliases: Record<string, string[]> = {};
  for (const [alias, canonical] of Object.entries(aliasMap)) {
    if (!canonicalToAliases[canonical]) canonicalToAliases[canonical] = [];
    canonicalToAliases[canonical].push(alias);
  }
  // 编译别名正则：最长优先，避免 "采购编号" 被 "编号" 截断
  const allNames = [...new Set(rules.map(r => r.fieldName))];
  const aliasNames = Object.keys(aliasMap).filter(n => n && [...n].length >= 2);
  const allSearchNames = [...allNames, ...aliasNames];
  const searchNameRe = buildFieldNamePattern(allSearchNames);

  const keyOf = (rule: FieldRule) =>
    (rule.aliasFor && rule.aliasFor !== rule.fieldName) ? rule.aliasFor : rule.fieldName;
  const isAlias = (r: FieldRule) => keyOf(r) !== r.fieldName;

  /** 用 rule.fieldName + 其别名搜索段落/单元格 */
  function searchWithAliases(unit: SearchUnit, rule: FieldRule): { value: string; paraId: number; sourceText: string; score: number; confidence: number; source: 'regex' | 'keyword'; matchedName: string } | null {
    // 优先用原始 fieldName 搜索（已内置在 extractFromUnit）
    const direct = extractFromUnit(unit, units, unit.paraId, grids, rule, nameRe);
    if (direct) return { ...direct, matchedName: rule.fieldName };

    // 再用别名搜索
    const aliases = canonicalToAliases[keyOf(rule)] || [];
    for (const alias of aliases) {
      const aliasRule = { ...rule, fieldName: alias };
      const aliasHit = extractFromUnit(unit, units, unit.paraId, grids, aliasRule, nameRe);
      if (aliasHit) return { ...aliasHit, matchedName: alias };
    }
    return null;
  }

  const bestByKey: Record<string, { value: string; paraId: number; sourceText: string; score: number; page: number; chapter: string; group: string; fromAlias: boolean; confidence?: number; source?: 'regex' | 'keyword' | 'title_fallback' } | null> = {};

  const processRule = (rule: FieldRule) => {
    const key = keyOf(rule);

    // title_first 类型：跳过，最后统一处理（避免标题行误中覆盖 regex 结果）
    if (rule.category === 'title_first') return;

    // 通配符规则：可命中多个不同名称（如 *编号 → 招标编号/项目编号），按实际命中名产出
    if (isWildcardName(rule.fieldName)) {
      const seenHit = new Set<string>();
      const wTextLen = (i: number) => [...units[i].text].length;
      for (let i = 0; i < units.length; i++) {
        const hit = extractWildcardFromUnit(units[i], units, i, grids, rule, nameRe);
        if (!hit || !hit.matchedName) continue;
        const hitKey = hit.matchedName;
        if (seenHit.has(hitKey)) continue;
        seenHit.add(hitKey);
        // 通配符标签视作关键字命中，用 extractWildcardFromUnit 返回的命中位置信息打分
        // （不能用 text.indexOf(matchedName) 重搜——同名字符串在段内可能出现在别处）
        const text = units[i].text;
        const trimmedStart = text.length - text.trimStart().length;
        const ns = hit.ns;
        const ne = hit.ne;
        const wAtStart = ns >= 0 && ns <= trimmedStart;
        const wColon = ne >= 0 && (text[ne] === '：' || text[ne] === ':');
        const wConfidence = calculateConfidence('keyword', wAtStart, wColon, wTextLen(i));
        const cur = bestByKey[hitKey];
        if (!cur || hit.score > cur.score) {
          bestByKey[hitKey] = {
            value: hit.value, paraId: hit.paraId, sourceText: hit.sourceText,
            score: hit.score, page: units[i].page, chapter: units[i].chapter,
            group: rule.group, fromAlias: false,
            confidence: wConfidence, source: 'keyword',
          };
        }
      }
      return;
    }

    // 全文候选打分取最优（含别名搜索）
    let best: { value: string; paraId: number; sourceText: string; score: number; page: number; chapter: string } | null = null;
    for (let i = 0; i < units.length; i++) {
      const hit = searchWithAliases(units[i], rule);
      if (hit && (!best || hit.score > best.score)) {
        best = { ...hit, page: units[i].page, chapter: units[i].chapter };
      }
    }
    if (best) {
      const cur = bestByKey[key];
      if (!cur || best.score > cur.score || (best.score === cur.score && !isAlias(rule) && cur.fromAlias)) {
        bestByKey[key] = { ...best, group: rule.group, fromAlias: isAlias(rule) };
      }
    }
  };

  for (const rule of rules) processRule(rule);

  // 最后处理 title_first 类型：当对应字段尚无结果，或已有结果分低于标题兜底时才覆盖
  const titleRules = rules.filter(r => r.category === 'title_first');
  for (const rule of titleRules) {
    const key = keyOf(rule);
    const cur = bestByKey[key];
    const titleHit = extractTitleProjectName(paras);
    if (titleHit && titleHit.value && titleHit.score >= 4 && (!cur || titleHit.score > cur.score)) {
      bestByKey[key] = {
        value: titleHit.value,
        paraId: -1,
        sourceText: `(标题兜底) ${titleHit.value}`,
        score: titleHit.score,
        page: 1,
        chapter: '',
        group: rule.group,
        fromAlias: false,
        confidence: 3,
        source: 'title_fallback',
      };
    } else if (cur && cur.score < 4) {
      // 如果已有结果分过低（<4），也用标题兜底覆盖（防止 keyword 规则误中）
      if (titleHit && titleHit.score >= cur.score) {
        bestByKey[key] = {
          value: titleHit.value,
          paraId: -1,
          sourceText: `(标题兜底) ${titleHit.value}`,
          score: titleHit.score,
          page: 1,
          chapter: '',
          group: rule.group,
          fromAlias: false,
          confidence: 3,
          source: 'title_fallback',
        };
      }
    }
  }

  for (const key of Object.keys(bestByKey)) {
    const b = bestByKey[key]!;
    // 最佳分过低宁缺毋滥；标星走 markedItems 不在此限
    extracts[key] = {
      value: b.value,
      page: b.page,
      chapter: b.chapter,
      group: b.group,
      sourceText: b.sourceText,
      paraIds: b.paraId >= 0 ? [b.paraId] : [],
      score: b.score,
      confidence: b.confidence,
      source: b.source,
    };
    groups[key] = b.group;
    fieldGroups[key] = b.group;
    fieldParaMap[key] = b.paraId;
  }

  // ── 上下文感知提取：按章节范围缩小搜索，提升不同模板的命中率 ──────────
  // 策略：文本内找章节标题（officeparser 未识别 heading 时回退到关键词匹配）
  const SECTION_PATTERNS: Record<string, RegExp[]> = {
    info: [/招标条件|项目概况|招标公告|投标须知|采购内容|项目背景|第一章|第一部分/],
    business: [/商务条款|投标人资格|资格要求|商务要求|合同条款|付款条件|质保期|售后服务/],
    tech: [/技术规格|技术要求|技术参数|技术标准|采购需求|技术需求|验收标准|技术说明|用户需求/],
    score: [/评分标准|评标办法|评审办法|评分细则|综合评分|评分因素/],
    seal: [/密封|封装|正本|副本|电子文件|递交|盖章|封标|投标文件的密封/],
  };

  // 文本检测章节起始位置
  function detectSectionBoundaries(paras: FlatParagraph[]): Record<string, { start: number; end: number }> {
    const ranges: Record<string, { start: number; end: number }> = {};
    const sectionOrder = ['info', 'business', 'tech', 'score', 'seal'];
    let currentSection = 'info';
    let currentStart = 0;

    for (let i = 0; i < paras.length; i++) {
      const text = paras[i].text.trim();
      if (!text || text.length < 3) continue;
      for (const group of sectionOrder) {
        if (group === currentSection) continue;
        if (SECTION_PATTERNS[group]?.some(re => re.test(text))) {
          // 切换到新章节
          if (ranges[currentSection] && !ranges[currentSection].end) {
            ranges[currentSection].end = i;
          }
          currentSection = group;
          currentStart = i;
          break;
        }
      }
    }
    // 关闭最后一个章节
    if (ranges[currentSection] && !ranges[currentSection].end) {
      ranges[currentSection].end = paras.length - 1;
    }
    // 确保所有章节都有范围
    for (const g of sectionOrder) {
      if (!ranges[g]) {
        // 默认：在整个文档中搜索
        ranges[g] = { start: 0, end: paras.length - 1 };
      }
    }
    return ranges;
  }

  const sectionRanges = detectSectionBoundaries(paras);

  // 在章节范围内对未命中的字段做模糊匹配
  const KNOWN_FIELDS: Array<{ field: string; group: string; keywords: string[] }> = [
    // info
    { field: '交付时间', group: 'info', keywords: ['交付时间','交付期限','交货时间','完工时间','服务周期','工期'] },
    { field: '交付地点', group: 'info', keywords: ['交付地点','交货地点','安装地点','实施地点','验收地点'] },
    { field: '资金来源', group: 'info', keywords: ['资金来源','资金性质','经费来源','预算来源'] },
    { field: '分包情况', group: 'info', keywords: ['分包情况','是否接受分包','分包要求','转包'] },
    { field: '合同包号', group: 'info', keywords: ['合同包号','采购包号','包件号','标段'] },
    // business
    { field: '保密要求', group: 'business', keywords: ['保密要求','保密义务','保密条款','信息安全'] },
    { field: '发票要求', group: 'business', keywords: ['发票要求','开票要求','发票类型','增值税'] },
    { field: '售后响应', group: 'business', keywords: ['响应时间','售后服务响应','故障响应','维修响应'] },
    { field: '交货期', group: 'business', keywords: ['交货期','供货周期','交付周期','工期','服务期'] },
    // tech
    { field: '配置清单', group: 'tech', keywords: ['配置清单','配置明细','设备清单','货物清单','服务清单'] },
    { field: '技术参数', group: 'tech', keywords: ['技术参数','技术规格','规格参数','技术指标'] },
    { field: '性能要求', group: 'tech', keywords: ['性能要求','性能指标','技术指标'] },
    { field: '安装调试', group: 'tech', keywords: ['安装调试','安装要求','部署方式'] },
    { field: '接口要求', group: 'tech', keywords: ['接口要求','接口规范','数据接口','接口协议'] },
    // score
    { field: '评分标准', group: 'score', keywords: ['评分标准','评分办法','评标标准','评审标准'] },
    { field: '综合评分', group: 'score', keywords: ['综合评分','评分方法','评标方法'] },
    { field: '合格分数线', group: 'score', keywords: ['合格分数线','合格分','及格线','通过分'] },
    // seal
    { field: '正本数量', group: 'seal', keywords: ['正本数量','正本份数','正本'] },
    { field: '副本数量', group: 'seal', keywords: ['副本数量','副本份数','副本'] },
    { field: '递交方式', group: 'seal', keywords: ['递交方式','提交方式','上传方式','递交'] },
  ];

  // 对每个未命中的字段，在其所属章节范围内搜索别名关键词
  for (const { field, group, keywords } of KNOWN_FIELDS) {
    if (extracts[field]?.value) continue; // 已命中
    const range = sectionRanges[group];
    if (!range) continue;
    let bestHit: { value: string; paraId: number; sourceText: string; score: number; page: number } | null = null;
    for (let i = range.start; i <= range.end && i < paras.length; i++) {
      const p = paras[i];
      if (p.level > 0) continue; // 跳过子标题
      const text = p.text;
      for (const kw of keywords) {
        const idx = text.indexOf(kw);
        if (idx < 0) continue;
        const after = text.slice(idx + kw.length);
        const v = cleanValue(after, nameRe, field);
        if (!v) continue;
        const atStart = idx <= (text.length - text.trimStart().length);
        const score = 3 + (atStart ? 3 : 0) + (after.startsWith('：') || after.startsWith(':') ? 2 : 0);
        if (!bestHit || score > bestHit.score) {
          bestHit = { value: v, paraId: i, sourceText: text, score, page: (paraToPage && i < paraToPage.length ? paraToPage[i] : 1) };
        }
      }
    }
    if (bestHit && bestHit.score >= 4) {
      extracts[field] = {
        value: bestHit.value,
        page: bestHit.page,
        chapter: paras[bestHit.paraId]?.chapter || '',
        group,
        sourceText: bestHit.sourceText,
        paraIds: [bestHit.paraId],
        score: bestHit.score,
        confidence: 6,
        source: 'context',
      };
      fieldGroups[field] = group;
    }
  }

  // 未命中补 null 占位（通配符规则名称未知，不做占位）
  const seenKeys = new Set<string>();
  for (const rule of rules) {
    if (isWildcardName(rule.fieldName)) continue;
    const key = keyOf(rule);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    if (!extracts[key]) {
      extracts[key] = { value: null, page: null, chapter: '', group: rule.group, paraIds: [] };
      groups[key] = rule.group;
      fieldGroups[key] = rule.group;
    }
  }

  return { extracts, groups, fieldParaMap, fieldGroups };
}

// ═══════════════════════════════════════════════════════════
// 标星条款提取
// ═══════════════════════════════════════════════════════════

function extractStarKeywordItems(
  rules: FieldRule[],
  units: SearchUnit[],
): MarkedItem[] {
  const items: MarkedItem[] = [];
  const starRules = rules.filter(r => r.group === 'star');
  if (starRules.length === 0) return items;
  for (const unit of units) {
    if (unit.tableId != null) continue;
    const trimmed = unit.text.trim();
    if (!trimmed) continue;
    for (const rule of starRules) {
      const name = rule.fieldName;
      if (!name) continue;
      const hit = [...name].length === 1
        ? trimmed.indexOf(name) === 0
        : unit.text.includes(name);
      if (hit) {
        const text = [...unit.text].length > 120
          ? [...unit.text].slice(0, 120).join('') + '...'
          : unit.text.trim();
        items.push({ symbol: [...name].length === 1 ? name : '★', text, page: unit.page });
        break;
      }
    }
  }
  return items;
}

function extractMarkedItems(paras: FlatParagraph[], paraToPage: number[]): MarkedItem[] {
  const items: MarkedItem[] = [];
  for (let i = 0; i < paras.length; i++) {
    for (const sym of STAR_SYMBOLS) {
      if (!paras[i].text.includes(sym)) continue;
      // 过滤：符号后紧跟中文数字年月（如 "○二○二六年五月"）不是标星条款
      const idx = paras[i].text.indexOf(sym);
      const afterSym = paras[i].text.slice(idx + 1).trimStart();
      // 过滤：纯日期/年份文本（如 "二○二六年五月"、"2026年"）
      if (/^[二三四五六七八九十○〇\d]{2,}(?:年|月|日)|^\d{4}[年\-\/]\d{1,2}[年\-\/]\d{1,2}/.test(afterSym)) continue;
      const page = i < paraToPage.length ? paraToPage[i] : 1;
      let text = paras[i].text.trim();
      if ([...text].length > 120) text = [...text].slice(0, 120).join('') + '...';
      items.push({ symbol: sym, text, page });
      break;
    }
  }
  return items;
}

// ═══════════════════════════════════════════════════════════
// 业务校验层（V1.3 §9）
// ═══════════════════════════════════════════════════════════

interface ValidateCheck {
  checkName: string;
  status: 'ok' | 'warn' | 'error';
  msg: string;
}

function parseChineseDate(s: string): number | null {
  if (!s) return null;
  const m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(parseInt(m[1]!), parseInt(m[2]!) - 1, parseInt(m[3]!));
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}

function extractNumber(s: string): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:,\d{3})*(?:\.\d{1,2})?)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

function businessValidate(extracts: Record<string, FieldExtract>): {
  isPass: boolean;
  validateMsg: string;
  checkItems: ValidateCheck[];
} {
  const checks: ValidateCheck[] = [];

  // ── 必填字段校验（项目信息核心字段）──────────────────────────
  const requiredFields = ['项目名称', '投标截止时间'];
  for (const f of requiredFields) {
    const val = extracts[f]?.value;
    if (!val) checks.push({ checkName: `必填字段[${f}]`, status: 'warn', msg: `未提取到「${f}」` });
    else checks.push({ checkName: `必填字段[${f}]`, status: 'ok', msg: `${f}: ${String(val).slice(0, 60)}` });
  }

  // ── 预算金额校验 ─────────────────────────────────────────────
  const budgetVal = extracts['预算金额']?.value as string | null;
  if (budgetVal) {
    const num = extractNumber(budgetVal);
    if (num !== null) {
      if (num <= 0) checks.push({ checkName: '预算金额校验', status: 'error', msg: `预算金额 ≤ 0: ${budgetVal}` });
      else checks.push({ checkName: '预算金额校验', status: 'ok', msg: `预算金额: ${budgetVal}` });
    }
  }

  // ── 时间逻辑校验：开标时间不能早于投标截止时间 ──────────────
  const deadlineVal = extracts['投标截止时间']?.value as string | null;
  const openTimeVal = extracts['开标时间']?.value as string | null;
  if (deadlineVal && openTimeVal) {
    const dl = parseChineseDate(deadlineVal);
    const ot = parseChineseDate(openTimeVal);
    if (dl !== null && ot !== null) {
      if (ot < dl) checks.push({ checkName: '时间逻辑校验', status: 'error', msg: `开标时间(${openTimeVal})早于投标截止时间(${deadlineVal})` });
      else checks.push({ checkName: '时间逻辑校验', status: 'ok', msg: `开标时间不早于截止时间 ✓` });
    }
  }

  // ── 评分总分校验 ─────────────────────────────────────────────
  const priceScore = extracts['价格评分']?.value as string | null;
  const techScore = extracts['技术评分']?.value as string | null;
  const businessScore = extracts['商务评分']?.value as string | null;
  const scores = [priceScore, techScore, businessScore]
    .map(s => s?.match(/(\d{1,3})\s*分/) ? parseInt(RegExp.$1) : NaN)
    .filter(n => !isNaN(n));
  if (scores.length >= 2) {
    const total = scores.reduce((a, b) => a + b, 0);
    if (total === 100) checks.push({ checkName: '评分总分校验', status: 'ok', msg: `总分 = ${total} 分` });
    else checks.push({ checkName: '评分总分校验', status: 'warn', msg: `总分 = ${total} 分（期望 100 分）` });
  }

  // ── 冲突检测：项目编号 vs 招标编号 是否一致 ──────────────────
  const projCode = extracts['项目编号']?.value;
  const tenderCode = extracts['招标编号']?.value;
  if (projCode && tenderCode && projCode !== tenderCode) {
    checks.push({ checkName: '编号冲突检测', status: 'warn', msg: `项目编号(${projCode}) ≠ 招标编号(${tenderCode})，请人工核对` });
  }

  // ── 标星条款漏识别校验 ──────────────────────────────────────
  const starItems = extracts['★'] || null;
  if (!starItems) checks.push({ checkName: '标星条款漏识别校验', status: 'warn', msg: '未提取到标星条款' });

  // ── 保证金双重来源校验 ──────────────────────────────────────
  const bidBond = extracts['投标保证金']?.value;
  const depositAmt = extracts['保证金金额']?.value;
  if (bidBond && depositAmt && bidBond !== depositAmt) {
    checks.push({ checkName: '保证金一致性校验', status: 'warn', msg: `投标保证金(${bidBond}) 与保证金金额(${depositAmt})不一致` });
  }

  const isPass = checks.every(c => c.status !== 'error');
  const warnMsg = checks.filter(c => c.status !== 'ok').map(c => c.msg).join('；');
  return { isPass, validateMsg: warnMsg || '校验通过', checkItems: checks };
}

// ═══════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════

/**
 * 计算命中率低于阈值的字段分组列表。
 * 新增：按字段级低置信度触发（confidence < 5 且无值），同时保留分组级兜底逻辑。
 * 分组内 hit 率 = 有值的字段数 / 该组总字段数；低于 threshold 的组需要 LLM 增强。
 */
function getLowHitGroups(
  extracts: Record<string, FieldExtract>,
  threshold = 0.6,
): string[] {
  const byGroup: Record<string, FieldExtract[]> = {};
  for (const [field, extract] of Object.entries(extracts)) {
    if (!byGroup[extract.group]) byGroup[extract.group] = [];
    byGroup[extract.group].push(extract);
  }
  const lowHitGroups: string[] = [];
  for (const [group, fields] of Object.entries(byGroup)) {
    const hitCount = fields.filter(f => f.value).length;
    const lowConfMissing = fields.filter(f =>
      !f.value && (f.confidence ?? 10) < 5
    ).length;
    const hitRate = fields.length > 0 ? hitCount / fields.length : 1;
    // 字段级触发：本组内有低置信度缺失字段 → 加入 LLM 范围
    if (lowConfMissing > 0) {
      if (!lowHitGroups.includes(group)) lowHitGroups.push(group);
      continue;
    }
    // 分组级兜底：整体命中率太低
    if (hitRate < threshold) {
      lowHitGroups.push(group);
    }
  }
  return lowHitGroups;
}

export async function parseDocument(input: Buffer | string, options?: { skillIds?: string[]; filename?: string }): Promise<ExtractOutput> {
  const filePath = typeof input === 'string' ? input : '';
  const buffer = typeof input === 'string' ? undefined : input;
  const fileName = options?.filename || (filePath ? path.basename(filePath) : 'unknown');
  const ext = (filePath ? path.extname(filePath) : path.extname(options?.filename || '')).toLowerCase();

  if (!SUPPORTED_EXT.includes(ext)) {
    return {
      fileMeta: { fileName, fileMd5: '', parseTime: new Date().toISOString(), parser: 'officeparser', warningList: [`不支持的格式：${ext || '未知'}`] },
      documentStructure: [], extractResult: {}, validateResult: { isPass: false, validateMsg: '不支持格式', checkItems: [] },
       extractMode: 'rule_only', markedItems: [], tables: [], virtualTables: [], paragraphsMeta: [], pageCount: 0,
    };
  }
  if (ext === '.doc') {
    return {
      fileMeta: { fileName, fileMd5: '', parseTime: new Date().toISOString(), parser: 'officeparser', warningList: ['.doc 格式暂不支持，请转换为 .docx 后上传'] },
      documentStructure: [], extractResult: {}, validateResult: { isPass: false, validateMsg: '.doc 不支持', checkItems: [] },
       extractMode: 'rule_only', markedItems: [], tables: [], virtualTables: [], paragraphsMeta: [], pageCount: 0,
    };
  }
  if (typeof input === 'string' && !fs.existsSync(filePath)) {
    return {
      fileMeta: { fileName, fileMd5: '', parseTime: new Date().toISOString(), parser: 'officeparser', warningList: ['文件不存在'] },
      documentStructure: [], extractResult: {}, validateResult: { isPass: false, validateMsg: '文件不存在', checkItems: [] },
       extractMode: 'rule_only', markedItems: [], tables: [], virtualTables: [], paragraphsMeta: [], pageCount: 0,
    };
  }

  try {
    let flatParas: FlatParagraph[];
    let tableRows: string[][][];
    const fileBuffer = buffer || fs.readFileSync(filePath);
    if (ext === '.txt') {
      const text = fileBuffer.toString('utf-8');
      flatParas = text.split(/\r?\n/).map(t => t.trim()).filter(Boolean)
        .map(t => ({ text: t, chapter: '', chapterPath: [] as string[], level: 0 }));
      tableRows = [];
    } else {
      const fileTypeHint = { '.md': 'md', '.html': 'html', '.csv': 'csv' }[ext];
      const ast = await OfficeParser.parseOffice(fileBuffer, {
        newlineDelimiter: '\n',
        ignoreHeadersAndFooters: true,
        ...(fileTypeHint ? { fileType: fileTypeHint } : {}),
      } as any);
      flatParas = flattenContent(ast.content);
      tableRows = collectTables(ast.content);
    }

    const { paraToPage, pageCount } = buildParaToPage(flatParas);
    const paragraphsMeta = buildParagraphsMeta(flatParas, paraToPage);
    const chapters = buildChapters(flatParas, paraToPage);

    const tablesMeta: TableMeta[] = tableRows.map((rows, ti) => {
      const anchor = paragraphsMeta[Math.min(ti, paragraphsMeta.length - 1)] || { page: 1, chapter: '' };
      return {
        tableId: `t${ti}`,
        markdown: buildTableMarkdown(rows),
        page: anchor.page,
        chapter: anchor.chapter,
        rows,
        group: detectTableGroup(rows),
      };
    });

    const rules = loadFieldRules();

    // 段落 + 表格单元格统一检索单元
    const grids = new Map<string, string[][]>();
    const units: SearchUnit[] = paragraphsMeta.map(p => ({
      text: p.text, page: p.page, chapter: p.chapter, level: p.level, paraId: p.paraId,
    }));
    let nextParaId = paragraphsMeta.length;
    const cellPages: number[] = [];
    for (const t of tablesMeta) {
      grids.set(t.tableId, t.rows);
      t.rows.forEach((row, r) => row.forEach((cell, c) => {
        if (!cell.trim()) return;
        units.push({
          text: cell.trim(), page: t.page, chapter: t.chapter, level: 0,
          paraId: nextParaId++, tableId: t.tableId, row: r, col: c,
        });
        cellPages.push(t.page);
      }));
    }

    const { extracts, groups, fieldParaMap, fieldGroups } = applyRuleExtraction(rules, units, grids, flatParas, paraToPage);
    const seen = new Set<string>();
    const markedItems = [
      ...extractMarkedItems(flatParas, paraToPage),
      ...extractStarKeywordItems(rules, units),
    ].filter(m => {
      const k = `${m.page}|${m.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // 业务校验
    const validateResult = businessValidate(extracts);

    const fileMd5 = cryptoCreateHash(fileBuffer);

    // Skill-driven LLM enhancement (V1.5 检查逻辑)
    // 1. 没有配置模型 → 纯 officeparser + 规则提取
    // 2. 配置了模型 → 调用所有对应技能的 LLM 提取
    let extractMode = 'rule_only' as 'rule_only' | 'llm_enhanced';

    const skillIds = options?.skillIds || [];
    if (skillIds.length > 0) {
      try {
        const llmSettings = db.prepare(
          'SELECT llm_hit_rate_threshold FROM profile_settings WHERE id = 1'
        ).get() as any;
        const threshold = llmSettings?.llm_hit_rate_threshold ?? 0.6;
        const lowHitGroups = getLowHitGroups(extracts, threshold);
        for (const sid of skillIds) {
          const skill = db.prepare(
            'SELECT * FROM tender_llm_skill WHERE id = ? AND enable = 1 AND enable_llm = 1'
          ).get(sid) as any;
          if (!skill) continue;
          const hasPrompt = !!(skill?.prompt_template || skill?.bind_prompt_template_id);
          if (!hasPrompt) continue;
          try {
            const skillLlmResult = await runLLMExtraction(skill, flatParas, chapters, extracts, lowHitGroups);
            const merged = Object.values(skillLlmResult || {}).filter(v => typeof v === 'string' && v.trim() !== '').length;
            if (merged > 0) {
              mergeWithConfidence(extracts, skillLlmResult!, skill.biz_type || 'info');
              extractMode = 'llm_enhanced';
            }
          } catch (llmErr) {
            console.error(`[docProcessor] LLM extraction failed for skill ${sid}:`, llmErr);
          }
        }
      } catch (llmErr) {
        console.error('[docProcessor] LLM extraction failed, falling back to rule-only:', llmErr);
        extractMode = 'rule_only';
      }
    }

    // 文字描述段落 → 虚拟表格（针对 tech / score 分类的长文本条目）
    const virtualTables = extractVirtualTables(flatParas, paraToPage, tablesMeta, fieldGroups, extracts);

    // 从评分表格中提取技术得分/商务得分/价格得分（补全文本规则无法覆盖的表格数据）
    const scoreTableScores = parseScoreTable(tablesMeta);
    const scoreFieldMap: Record<string, string> = {
      '技术得分': '技术评分',
      '商务得分': '商务评分',
      '价格得分': '价格评分',
    };
    for (const [extractField, tableField] of Object.entries(scoreFieldMap)) {
      if (scoreTableScores[tableField] && !extracts[extractField]?.value) {
        const scorePage = tablesMeta.find(t => t.group === 'score')?.page ?? 1;
        extracts[extractField] = {
          value: scoreTableScores[tableField],
          page: scorePage,
          chapter: '',
          group: 'score',
          sourceText: `(评分表) ${scoreTableScores[tableField]}`,
          paraIds: [],
          score: 9,
          confidence: 8,
          source: 'table',
        };
        fieldGroups[extractField] = 'score';
      }
    }

    return {
      fileMeta: {
        fileName,
        fileMd5,
        parseTime: new Date().toISOString(),
        parser: 'officeparser',
        warningList: validateResult.checkItems.filter((c: any) => c.status !== 'ok').map((c: any) => c.msg),
      },
      documentStructure: chapters,
      extractResult: extracts as ExtractOutput['extractResult'],
      validateResult,
      extractMode,
      markedItems,
      tables: tablesMeta,
      virtualTables,
      paragraphsMeta,
      pageCount,
      extracts,
      groups,
      fieldParaMap,
      fieldGroups,
      chapters,
      paraToPage,
    };
  } catch (err: any) {
    return {
      fileMeta: { fileName: path.basename(filePath), fileMd5: '', parseTime: new Date().toISOString(), parser: 'officeparser', warningList: [`解析失败：${err.message || '未知错误'}`] },
      documentStructure: [], extractResult: {},
      validateResult: { isPass: false, validateMsg: err.message || '未知错误', checkItems: [] },
       extractMode: 'rule_only', markedItems: [], tables: [], virtualTables: [], paragraphsMeta: [], pageCount: 0,
    };
  }
}

function cryptoCreateHash(buffer: Buffer | string): string {
  try {
    return crypto.createHash('md5').update(buffer).digest('hex');
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════════════
// LLM 抽取增强（V1.4 选配）
// ═══════════════════════════════════════════════════════════

/**
 * 基于置信度的 LLM 合并策略：
 *  - 规则置信度 >= 7：保留规则值，标注 LLM 确认
 *  - 规则置信度 < 5（或规则缺失）：LLM 覆盖
 *  - 规则置信度 5-6：保留规则值，标注 LLM 建议
 */
function mergeWithConfidence(
  ruleExtracts: Record<string, FieldExtract>,
  llmExtracts: Record<string, string>,
  fallbackGroup = '',
): Record<string, FieldExtract> {
  for (const [field, llmValue] of Object.entries(llmExtracts)) {
    if (!llmValue) continue;

    const ruleExtract = ruleExtracts[field];

    // 规则置信度 >= 7 时，LLM 不覆盖
    if (ruleExtract && (ruleExtract.confidence ?? 0) >= 7) {
      ruleExtract.sourceText = (ruleExtract.sourceText || '') + ' | LLM确认';
      continue;
    }

    // 规则置信度 < 5 且 LLM 有值时，LLM 覆盖（confidence 缺失视为低置信度）
    if (!ruleExtract || (ruleExtract.confidence ?? 0) < 5) {
      ruleExtracts[field] = {
        value: llmValue,
        confidence: 7,
        source: 'llm',
        page: ruleExtract?.page ?? null,
        chapter: ruleExtract?.chapter || 'LLM',
        group: ruleExtract?.group || fallbackGroup,
        sourceText: `LLM抽取: ${llmValue.slice(0, 50)}`,
        paraIds: ruleExtract?.paraIds || [],
      };
    }
    // 中间置信度（5-6）时，保留规则值，标注 LLM 建议
    else {
      ruleExtract.sourceText = (ruleExtract.sourceText || '') + ` | LLM建议: ${llmValue.slice(0, 30)}`;
    }
  }
  return ruleExtracts;
}

interface LLMSkillRow {
  id: string;
  skill_name: string;
  prompt_template: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  biz_type?: string;
  bind_prompt_template_id?: string;
  llm_api_config_id?: string;
}

// ── 字段 Schema（注入 LLM prompt，帮助模型理解字段类型/必填）────────
interface FieldSchema {
  name: string;
  type: 'string' | 'date' | 'amount' | 'number';
  description: string;
  required: boolean;
}

function inferFieldType(fieldName: string): 'string' | 'date' | 'amount' | 'number' {
  if (/时间|日期|截止|开标|发售|发布/.test(fieldName)) return 'date';
  if (/金额|预算|保证金|费用|价格|限价/.test(fieldName)) return 'amount';
  if (/数量|份数|比例|百分|权重/.test(fieldName)) return 'number';
  return 'string';
}

function isRequiredField(fieldName: string): boolean {
  const requiredFields = [
    '项目名称', '项目编号', '投标截止时间', '开标时间', '投标地点',
    '采购人', '代理机构', '预算金额',
  ];
  return requiredFields.includes(fieldName);
}

function buildFieldSchema(rules: FieldRule[]): FieldSchema[] {
  return rules.map(r => ({
    name: r.fieldName,
    type: inferFieldType(r.fieldName),
    description: r.fieldName,
    required: isRequiredField(r.fieldName),
  }));
}

function renderFieldSchemaList(schemas: FieldSchema[]): string {
  return schemas.map(s => {
    const typeLabel = s.type === 'date' ? '日期'
                   : s.type === 'amount' ? '金额'
                   : s.type === 'number' ? '数字'
                   : '文本';
    const reqLabel = s.required ? '必填' : '选填';
    return `- ${s.name} (${typeLabel}, ${reqLabel}): ${s.description}`;
  }).join('\n');
}

// ── Few-shot 示例（基于 correction_history 表）──────────────────────
function getCorrectionHistory(db: any, bizType: string) {
  try {
    return db.prepare(
      'SELECT * FROM correction_history WHERE group_name = ? ORDER BY created_at DESC LIMIT 10'
    ).all(bizType);
  } catch (e) {
    console.warn('[getCorrectionHistory] failed for group:', bizType, e);
    return [];
  }
}

function buildFewShotExamples(correctionHistory: any[], bizType: string): string {
  const recent = correctionHistory
    .filter(c => c.group_name === bizType)
    .slice(0, 3);
  if (recent.length === 0) return '';
  return `\n示例：\n${recent.map(c =>
    `原文: ${c.paragraph_text || ''}\n正确值: ${c.corrected_value || ''}`
  ).join('\n')}`;
}

/**
 * 将文档章节按 biz_type 分块，调用 LLM 进行结构化抽取。
 * lowHitGroups 为空时保持原有全量行为；非空时仅抽取命中组内 chunk。
 * 返回 { fieldName: extractedText } 映射，用于合并到 extractResult。
 *
 * Prompt 增强：
 *   - {{fieldSchema}}     字段 Schema 列表（类型/必填标注）
 *   - {{fewShotExamples}} 基于 correction_history 的最近纠错示例
 *   - {{preExtract}}      规则预抽取结果
 *   - {{chunkText}}       章节分块文本
 */
async function runLLMExtraction(
  skill: LLMSkillRow,
  paras: FlatParagraph[],
  chapters: Chapter[],
  ruleResult: Record<string, FieldExtract>,
  lowHitGroups: string[] = [],
): Promise<Record<string, string>> {
  const bizType = (skill as any).biz_type || 'info';

  // profile_settings.llm_model_id 作为全局模型覆盖，优先级高于 skill.llm_api_config_id
  let effectiveApiConfigId = skill.llm_api_config_id || '';
  try {
    const override = db.prepare(
      'SELECT llm_model_id FROM profile_settings WHERE id = 1'
    ).get() as any;
    if (override?.llm_model_id) effectiveApiConfigId = override.llm_model_id;
  } catch (e) {
    console.warn('[docProcessor] Failed to read profile_settings.llm_model_id:', e);
  }
  const apiConfig = effectiveApiConfigId
    ? db.prepare('SELECT * FROM api_configs WHERE id = ? AND enabled = 1').get(effectiveApiConfigId)
    : null;
  if (!apiConfig) {
    console.warn('[docProcessor] No API config found for skill', skill.id, 'override=', effectiveApiConfigId || '(none)');
    return {};
  }

  // 绑定的提示词模板优先：提示词标签的维护真正参与提取
  let effectivePrompt = skill.prompt_template;
  const bindId = (skill as any).bind_prompt_template_id || '';
  if (bindId) {
    try {
      const tpl = db.prepare(
        'SELECT template_text FROM llm_prompt_templates WHERE id = ? AND enable = 1'
      ).get(bindId) as any;
      if (tpl?.template_text) effectivePrompt = tpl.template_text;
      else console.warn('[docProcessor] Bound prompt template missing/disabled, fallback to skill prompt', skill.id, bindId);
    } catch (e) {
      console.warn('[docProcessor] Failed to load bound prompt template, fallback to skill prompt:', e);
    }
  }

  // 加载字段 Schema（按 bizType 过滤规则），供 prompt 注入
  let fieldSchemaList = '';
  try {
    const rules = loadFieldRules().filter(r => r.bizType === bizType || r.group === bizType);
    if (rules.length > 0) fieldSchemaList = renderFieldSchemaList(buildFieldSchema(rules));
  } catch (e) {
    console.warn('[docProcessor] Failed to build field schema:', e);
  }

  // 加载 Few-shot 示例（最近纠错历史）
  const correctionHistory = getCorrectionHistory(db, bizType);
  const fewShotExamples = buildFewShotExamples(correctionHistory, bizType);

  // 按章节分组文本：优先使用 path 分类（更精确），回退到 title+content 分类
  const chunksByType: Record<string, string> = {};
  for (const ch of chapters) {
    const text = ch.content.join('\n').trim();
    if (!text) continue;
    const key = ch.path && ch.path.length > 0
      ? classifyChapterByPath(ch.path)
      : classifyChapter(ch.title, ch.content);
    chunksByType[key] = (chunksByType[key] || '') + '\n' + text;
  }
  // 若无分类结果，把所有段落合并为一个 chunk
  if (Object.keys(chunksByType).length === 0) {
    chunksByType['all'] = paras.map(p => p.text).join('\n');
  }
  // 命中率阈值过滤：仅处理命中组
  let effectiveChunks: Record<string, string> = lowHitGroups.length > 0
    ? Object.fromEntries(Object.entries(chunksByType).filter(([k]) => lowHitGroups.includes(k)))
    : chunksByType;

  // 回退：lowHitGroups 来自 extract.group，chunksByType key 来自 classifyChapter，
  // 命名空间可能不匹配导致静默为空，此时退回全量 chunks 以避免 LLM 完全被跳过。
  if (lowHitGroups.length > 0 && Object.keys(effectiveChunks).length === 0) {
    console.warn(
      `[docProcessor] effectiveChunks empty due to group/chunk namespace mismatch ` +
      `(lowHitGroups=${JSON.stringify(lowHitGroups)}, chunksByType=${JSON.stringify(Object.keys(chunksByType))}), fallback to all chunks`,
    );
    effectiveChunks = chunksByType;
  }

  const allResults: Record<string, string> = {};
  // 规则预抽取结果仅与 skill 相关，chunk 无关，提升到循环外序列化一次
  const preExtractJson = JSON.stringify(ruleResult);

  for (const [chunkKey, chunkText] of Object.entries(effectiveChunks)) {
    const filled = effectivePrompt
      .replace(/\{\{chunkText\}\}/g, chunkText.slice(0, 3000))
      .replace(/\{\{preExtract\}\}/g, preExtractJson)
      .replace(/\{\{fieldSchema\}\}/g, fieldSchemaList)
      .replace(/\{\{fewShotExamples\}\}/g, fewShotExamples);

    try {
      const raw = await callLLM(apiConfig, filled, skill.temperature, skill.top_p, skill.max_tokens);
      const jsonStr = extractJSONFromResponse(raw);
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr) as Record<string, string>;
        Object.assign(allResults, parsed);
      }
    } catch (e) {
      console.error(`[docProcessor] LLM call failed for chunk ${chunkKey}:`, e);
    }
  }

  return allResults;
}

function classifyChapter(title: string, content: string[]): string {
  const combined = title + ' ' + content.join(' ');
  if (/评分|分值|评标|得分|权重|满分/.test(combined)) return 'score';
  if (/技术|参数|规格|配置|性能|验收|指标/.test(combined)) return 'tech';
  if (/商务|付款|质保|履约|保证金|合同/.test(combined)) return 'business';
  if (/密封|封装|正本|副本|递交|封标/.test(combined)) return 'seal';
  if (/★|▲|●|◆|※|废标|否决投标|强制性/.test(combined)) return 'star';
  if (/项目|招标|采购|编号|预算|截止|开标|地点|采购人|代理/.test(combined)) return 'info';
  return 'other';
}

function classifyChapterByPath(chapterPath: string[]): string {
  for (const path of chapterPath) {
    if (/评分|分值|评标|得分|权重|满分/.test(path)) return 'score';
    if (/技术|参数|规格|配置|性能|验收|指标/.test(path)) return 'tech';
    if (/商务|付款|质保|履约|保证金|合同/.test(path)) return 'business';
    if (/密封|封装|正本|副本|递交|封标/.test(path)) return 'seal';
    if (/★|▲|●|◆|※|废标|否决投标|强制性/.test(path)) return 'star';
    if (/项目|招标|采购|编号|预算|截止|开标|地点|采购人|代理/.test(path)) return 'info';
  }
  return 'other';
}

async function callLLM(
  apiConfig: any,
  prompt: string,
  temperature: number,
  top_p: number,
  max_tokens: number,
): Promise<string> {
  const key = (() => {
    try {
      return apiConfig.api_key ? decrypt(apiConfig.api_key) : '';
    } catch {
      return apiConfig.api_key || '';
    }
  })();
  const baseUrl = (apiConfig.base_url || getDefaultBaseURL(apiConfig.provider || 'OpenAI')).replace(/\/$/, '');
  const model = apiConfig.model || 'qwen-turbo';
  const url = new URL('/v1/chat/completions', baseUrl);

  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    top_p,
    max_tokens,
  });

  return new Promise((resolve, reject) => {
    const proto = url.protocol === 'https:' ? https : http;
    const req = proto.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (ch: string) => { data += ch; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`LLM HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed?.choices?.[0]?.message?.content || '';
            resolve(content);
          } catch {
            reject(new Error('LLM response parse failed'));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('LLM timeout')); });
    req.write(body);
    req.end();
  });
}

function extractJSONFromResponse(text: string): string | null {
  // 1. 尝试从 ```json 代码块提取（LLM 常用格式）
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1];

  // 2. 尝试从普通 ``` 代码块提取
  const codeBlockGenericMatch = text.match(/```\s*([\s\S]*?)```/);
  if (codeBlockGenericMatch) {
    const inner = codeBlockGenericMatch[1].trim();
    if (inner.startsWith('{') || inner.startsWith('[')) return inner;
  }

  // 3. 尝试提取第一个 { 到最后一个 }（覆盖散文+JSON 混合场景）
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  // 4. 尝试提取数组
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) return arrMatch[0];

  return null;
}

function getDefaultBaseURL(provider: string): string {
  const map: Record<string, string> = {
    '阿里云': 'https://dashscope.aliyuncs.com',
    '百度': 'https://aip.baidubce.com',
    '智谱': 'https://open.bigmodel.cn',
    'OpenAI': 'https://api.openai.com',
    'Anthropic': 'https://api.anthropic.com',
    'DeepSeek': 'https://api.deepseek.com',
    'Moonshot': 'https://api.moonshot.cn',
    'Google': 'https://generativelanguage.googleapis.com',
  };
  return map[provider] || 'https://api.openai.com';
}
