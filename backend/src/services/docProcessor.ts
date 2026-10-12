import fs from 'fs';
import path from 'path';
import { OfficeParser } from 'officeparser';
import { db } from '../database.js';

export interface MarkedItem {
  symbol: string;
  text: string;
  page: number;
}

export interface Chapter {
  title: string;
  content: string[];
  page: number;
}

export interface ParagraphMeta {
  text: string;
  paraId: number;
  chapter: string;
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

export interface FieldExtract {
  value: unknown;
  page: number | null;
  chapter: string;
  group: string;
  sourceText?: string;
  paraIds: number[];
}

export interface ParseResult {
  status: string;
  text?: string;
  extracts?: Record<string, unknown>;
  groups?: Record<string, string>;
  chapters?: Chapter[];
  tables?: TableMeta[];
  markedItems?: MarkedItem[];
  fieldParaMap?: Record<string, number>;
  fieldGroups?: Record<string, string>;
  pageCount?: number;
  paraToPage?: number[];
  paragraphsMeta?: ParagraphMeta[];
  tablesMeta?: TableMeta[];
  error?: string;
}

const SUPPORTED_EXT = ['.docx', '.pdf', '.md', '.txt', '.xlsx', '.wps', '.doc', '.csv', '.html', '.odt', '.rtf', '.pptx'];

const STAR_SYMBOLS = ['★', '☆', '▲', '△', '●', '○', '◆', '◇', '※', '⚠', '♦', '▸', '▹', '►', '▻', '✦', '✧', '⬤', '🔴', '⭐', '❗'];

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

interface FlatParagraph {
  text: string;
  chapter: string;
  level: number;
}

/** officeparser 节点文本可能在 n.text，也可能嵌在 children 里（直接 text 优先，避免 heading 重复拼接） */
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
  let chapter = '';
  const walk = (list: any[]) => {
    for (const n of list) {
      if (!n) continue;
      if (n.type === 'heading') {
        const level = n.metadata?.level ?? 1;
        const title = nodeText(n).trim();
        if (title) chapter = title;
        out.push({ text: title, chapter, level });
      } else if (n.type === 'paragraph') {
        const t = nodeText(n).trim();
        if (t) out.push({ text: t, chapter, level: 0 });
      } else if (n.type === 'table') {
        // tables are collected separately by collectTables(); skip their
        // inner paragraphs so cell text is not duplicated into the flow.
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
    level: p.level,
    page: i < paraToPage.length ? paraToPage[i] : 1,
  }));
}

function buildChapters(paras: FlatParagraph[], paraToPage: number[]): Chapter[] {
  const chapters: Chapter[] = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.level > 0 || isSectionStart(p.text)) {
      chapters.push({ title: p.text, content: [], page: i < paraToPage.length ? paraToPage[i] : 1 });
    } else if (chapters.length > 0) {
      chapters[chapters.length - 1].content.push(p.text);
    }
  }
  return chapters;
}

function buildParaToPage(paras: FlatParagraph[]): { paraToPage: number[]; pageCount: number } {
  const totalChars = paras.reduce((sum, p) => sum + [...p.text].length, 0);
  const avgCharsPerPage = 1000;
  let estimatedPages = Math.ceil(totalChars / avgCharsPerPage);
  if (estimatedPages < 1) estimatedPages = 1;
  const charsPerPage = totalChars / estimatedPages;
  const paraToPage: number[] = new Array(paras.length).fill(1);
  let accumulated = 0;
  let currentPage = 1;
  for (let i = 0; i < paras.length; i++) {
    accumulated += [...paras[i].text].length;
    paraToPage[i] = currentPage;
    if (accumulated >= charsPerPage * currentPage) {
      currentPage++;
    }
  }
  return { paraToPage, pageCount: estimatedPages };
}

const SCORE_TABLE_KEYWORDS = ['评分', '分值', '得分', '权重', '评标', '商务分', '技术分', '价格分'];
const TECH_TABLE_KEYWORDS = ['技术', '参数', '规格', '配置', '设备', '性能', '服务', '验收', '指标', '系统', '软件', '硬件', '方案', '质保'];

/** 按关键词命中给表格归组（技术 / 评分），命中不足则不归组 */
function detectTableGroup(rows: string[][]): string {
  const text = rows.flat().join(' ');
  const count = (kws: string[]) => kws.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
  const scoreHits = count(SCORE_TABLE_KEYWORDS);
  const techHits = count(TECH_TABLE_KEYWORDS);
  if (scoreHits < 2 && techHits < 2) return '';
  return scoreHits >= techHits ? 'score' : 'tech';
}

/**
 * 标星组规则全量扫描：每条命中段落都计入标星条款。
 * 单字规则（★ ▲ * ● 等）只匹配行首，多字按包含匹配。
 */
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
      if (paras[i].text.includes(sym)) {
        const page = i < paraToPage.length ? paraToPage[i] : 1;
        let text = paras[i].text.trim();
        if ([...text].length > 120) {
          text = [...text].slice(0, 120).join('') + '...';
        }
        items.push({ symbol: sym, text, page });
        break;
      }
    }
  }
  return items;
}

interface FieldRule {
  fieldName: string;
  group: string;
  pattern: string;
  category: string;
  aliasFor: string;
}

function loadFieldRules(): FieldRule[] {
  const rows = db.prepare('SELECT field_name, group_name, pattern, category, alias_for FROM extraction_rules WHERE enabled = 1').all() as Array<{ field_name: string; group_name: string; pattern: string; category: string; alias_for: string }>;
  return rows.map(r => ({ fieldName: r.field_name, group: r.group_name || 'info', pattern: r.pattern || '', category: r.category || 'keyword', aliasFor: (r.alias_for || '').trim() }));
}

/** 段落 + 表格单元格统一检索单元（左右上下取值的基础） */
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
function cleanValue(raw: string, allNames: string[], self: string): string | null {
  let v = (raw || '').trim().replace(/^[：:、,，；;\s]+/, '').trim();
  if (!v) return null;
  const end = v.match(/[。；;\n]/);
  if (end && end.index !== undefined && end.index < 200) v = v.slice(0, end.index);
  else if (v.length > 200) v = v.slice(0, 200);
  v = truncateAtOtherFields(v, allNames, self);
  v = v.replace(/(\s*的\s*)+$/, '').trim();
  return v.trim() || null;
}

const HAS_LABEL = /[：:]/;

/**
 * 五方向取值：后（同行关键字之后）→ 右/下（表格相邻格）→ 下（下一段）
 * → 上（上一段，严格守卫）→ 前（同行关键字之前，严格守卫）
 */
function extractFromUnit(
  unit: SearchUnit,
  units: SearchUnit[],
  idx: number,
  grids: Map<string, string[][]>,
  rule: FieldRule,
  allNames: string[],
): { value: string; paraId: number; sourceText: string } | null {
  const text = unit.text;
  // 0. 正则优先（精度最高）
  if (rule.category === 'regex' && rule.pattern) {
    try {
      const m = text.match(new RegExp(rule.pattern));
      const v = ((m && (m[1] || m[0])) || '').trim();
      if (v) return { value: v, paraId: unit.paraId, sourceText: text };
    } catch {
      // 非法正则，回落关键字
    }
  }
  const kidx = text.indexOf(rule.fieldName);
  if (kidx < 0) return null;
  // 单字规则（如 ★ ▲ *）是行首标记：只在行首匹配，避免正文误伤
  if ([...rule.fieldName].length === 1 && text.trimStart().indexOf(rule.fieldName) !== 0) return null;

  // 1. 后：同行关键字之后
  let v = cleanValue(text.slice(kidx + rule.fieldName.length), allNames, rule.fieldName);
  if (v) return { value: v, paraId: unit.paraId, sourceText: text };

  // 2. 右 / 下：表格相邻格（标签独占一格时）
  if (unit.tableId != null) {
    const grid = grids.get(unit.tableId);
    if (grid && unit.row !== undefined && unit.col !== undefined) {
      const right = (grid[unit.row] || [])[unit.col + 1] || '';
      if (right.trim() && !HAS_LABEL.test(right)) {
        v = cleanValue(right, allNames, rule.fieldName);
        if (v) return { value: v, paraId: unit.paraId, sourceText: `${text} ${right.trim()}` };
      }
      const belowRow = grid[unit.row + 1];
      const below = (belowRow || [])[unit.col] || '';
      if (below.trim() && !HAS_LABEL.test(below)) {
        v = cleanValue(below, allNames, rule.fieldName);
        if (v) return { value: v, paraId: unit.paraId, sourceText: `${text} ${below.trim()}` };
      }
    }
    return null;
  }

  // 3. 前：同行关键字之前（同行有字优先于跨行）
  const before = text.slice(0, kidx);
  if (before.trim() && [...before].length <= 100) {
    v = cleanValue(before, allNames, rule.fieldName);
    if (v) return { value: v, paraId: unit.paraId, sourceText: text };
  }

  // 4. 下：下一段（仅段落之间，跳过空行；遇到标题则止步；单元格不参与）
  for (let j = idx + 1; j < units.length; j++) {
    const nu = units[j];
    if (nu.tableId != null) continue;
    if (!nu.text.trim()) continue;
    if (nu.level > 0) break;
    if (HAS_LABEL.test(nu.text)) break;
    v = cleanValue(nu.text, allNames, rule.fieldName);
    if (v) return { value: v, paraId: nu.paraId, sourceText: `${text}\n${nu.text}` };
    break;
  }

  // 5. 上：上一段（仅段落之间；严格守卫：非标题、短文本、无冒号）
  for (let j = idx - 1; j >= 0; j--) {
    const pu = units[j];
    if (pu.tableId != null) continue;
    if (!pu.text.trim()) continue;
    if (pu.level > 0 || isSectionStart(pu.text)) break;
    if (HAS_LABEL.test(pu.text)) break;
    if ([...pu.text].length > 100) break;
    v = cleanValue(pu.text, allNames, rule.fieldName);
    if (v) return { value: v, paraId: pu.paraId, sourceText: `${pu.text}\n${text}` };
    break;
  }
  return null;
}

/** 关键字取值串到下一个字段时截断（如“预算金额…投标截止时间…”），保证取值干净 */
function truncateAtOtherFields(value: string, fieldNames: string[], self: string): string {
  let cut = -1;
  for (const f of fieldNames) {
    if (!f || f === self || [...f].length < 2) continue;
    const at = value.indexOf(f);
    if (at > 0 && (cut < 0 || at < cut)) cut = at;
  }
  if (cut < 0) return value;
  return value.slice(0, cut).replace(/[：:、,，；;\s]+$/, '').trim();
}

function applyRuleExtraction(
  rules: FieldRule[],
  units: SearchUnit[],
  grids: Map<string, string[][]>,
): { extracts: Record<string, FieldExtract>; groups: Record<string, string>; fieldParaMap: Record<string, number>; fieldGroups: Record<string, string> } {
  const extracts: Record<string, FieldExtract> = {};
  const groups: Record<string, string> = {};
  const fieldParaMap: Record<string, number> = {};
  const fieldGroups: Record<string, string> = {};
  const allNames = rules.map(r => r.fieldName);

  for (const rule of rules) {
    // 别名归因：别名字段的取值记到规范字段名下，结果页只有规范行
    const key = (rule.aliasFor && rule.aliasFor !== rule.fieldName) ? rule.aliasFor : rule.fieldName;
    if (extracts[key] && extracts[key].value != null) continue;
    let matched = false;
    for (let i = 0; i < units.length; i++) {
      const hit = extractFromUnit(units[i], units, i, grids, rule, allNames);
      if (hit) {
        const unit = units[i];
        extracts[key] = {
          value: hit.value,
          page: unit.page,
          chapter: unit.chapter,
          group: rule.group,
          sourceText: hit.sourceText,
          paraIds: [hit.paraId],
        };
        groups[key] = rule.group;
        fieldGroups[key] = rule.group;
        fieldParaMap[key] = hit.paraId;
        matched = true;
        break;
      }
    }
    if (!matched && !extracts[key]) {
      extracts[key] = { value: null, page: null, chapter: '', group: rule.group, paraIds: [] };
      groups[key] = rule.group;
      fieldGroups[key] = rule.group;
    }
  }

  return { extracts, groups, fieldParaMap, fieldGroups };
}

export async function parseDocument(filePath: string): Promise<ParseResult> {
  const ext = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_EXT.includes(ext)) {
    return { status: 'error', error: `不支持的格式：${ext || '未知'}` };
  }
  if (ext === '.doc') {
    return { status: 'error', error: '.doc 格式暂不支持，请转换为 .docx 后上传' };
  }
  if (!fs.existsSync(filePath)) {
    return { status: 'error', error: '文件不存在' };
  }

  try {
    let flatParas: FlatParagraph[];
    let tableRows: string[][][];
    if (ext === '.txt') {
      // OfficeParser 不支持 txt，直接按行切分纯文本
      const text = fs.readFileSync(filePath, 'utf-8');
      flatParas = text.split(/\r?\n/).map(t => t.trim()).filter(Boolean)
        .map(t => ({ text: t, chapter: '', level: 0 }));
      tableRows = [];
    } else {
      const buffer = fs.readFileSync(filePath);
      const fileTypeHint = { '.md': 'md', '.html': 'html', '.csv': 'csv' }[ext];
      const ast = await OfficeParser.parseOffice(buffer, {
        newlineDelimiter: '\n',
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

    // 段落 + 表格单元格统一检索：表格 label/value 对、跨行取值就靠它
    const grids = new Map<string, string[][]>();
    const units: SearchUnit[] = paragraphsMeta.map(p => ({
      text: p.text,
      page: p.page,
      chapter: p.chapter,
      level: p.level,
      paraId: p.paraId,
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
    const fullParaToPage = [...paraToPage, ...cellPages];

    const { extracts, groups, fieldParaMap, fieldGroups } = applyRuleExtraction(rules, units, grids);
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

    const fullText = flatParas.map(p => p.text).join('\n');

    return {
      status: 'ok',
      text: fullText,
      extracts,
      groups,
      chapters,
      tables: tablesMeta,
      markedItems,
      fieldParaMap,
      fieldGroups,
      pageCount,
      paraToPage: fullParaToPage,
      paragraphsMeta,
      tablesMeta,
    };
  } catch (err: any) {
    return {
      status: 'error',
      error: `文档解析失败：${err.message || '未知错误'}`,
    };
  }
}