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

function flattenContent(nodes: any[]): FlatParagraph[] {
  const out: FlatParagraph[] = [];
  let chapter = '';
  const walk = (list: any[]) => {
    for (const n of list) {
      if (!n) continue;
      if (n.type === 'heading') {
        const level = n.metadata?.level ?? 1;
        const title = (n.text || '').trim();
        if (title) chapter = title;
        out.push({ text: title, chapter, level });
      } else if (n.type === 'paragraph') {
        const t = (n.text || '').trim();
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
            cells.push((cell.text || '').trim());
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
}

function loadFieldRules(): FieldRule[] {
  const rows = db.prepare('SELECT field_name, group_name, pattern, category FROM extraction_rules WHERE enabled = 1').all() as Array<{ field_name: string; group_name: string; pattern: string; category: string }>;
  return rows.map(r => ({ fieldName: r.field_name, group: r.group_name || 'info', pattern: r.pattern || '', category: r.category || 'keyword' }));
}

function extractValueForKeyword(text: string, fieldName: string): string | null {
  const idx = text.indexOf(fieldName);
  if (idx < 0) return null;
  let rest = text.slice(idx + fieldName.length).trim();
  rest = rest.replace(/^[：:、,\s]+/, '').trim();
  if (!rest) return null;
  const endMatch = rest.match(/[。；;。\n]/);
  if (endMatch && endMatch.index !== undefined && endMatch.index < 200) {
    rest = rest.slice(0, endMatch.index);
  } else if (rest.length > 200) {
    rest = rest.slice(0, 200);
  }
  return rest.trim() || null;
}

function applyRuleExtraction(
  rules: FieldRule[],
  paras: ParagraphMeta[],
): { extracts: Record<string, FieldExtract>; groups: Record<string, string>; fieldParaMap: Record<string, number>; fieldGroups: Record<string, string> } {
  const extracts: Record<string, FieldExtract> = {};
  const groups: Record<string, string> = {};
  const fieldParaMap: Record<string, number> = {};
  const fieldGroups: Record<string, string> = {};

  for (const rule of rules) {
    let matched = false;
    for (const para of paras) {
      let value: string | null = null;
      if (rule.category === 'regex' && rule.pattern) {
        try {
          const re = new RegExp(rule.pattern);
          const m = para.text.match(re);
          if (m) value = (m[1] || m[0] || '').trim();
        } catch {
          // invalid regex, fall through to keyword
        }
      }
      if (value == null) {
        value = extractValueForKeyword(para.text, rule.fieldName);
      }
      if (value) {
        extracts[rule.fieldName] = {
          value,
          page: para.page,
          chapter: para.chapter,
          group: rule.group,
          sourceText: para.text,
          paraIds: [para.paraId],
        };
        groups[rule.fieldName] = rule.group;
        fieldGroups[rule.fieldName] = rule.group;
        fieldParaMap[rule.fieldName] = para.paraId;
        matched = true;
        break;
      }
    }
    if (!matched) {
      extracts[rule.fieldName] = { value: null, page: null, chapter: '', group: rule.group, paraIds: [] };
      groups[rule.fieldName] = rule.group;
      fieldGroups[rule.fieldName] = rule.group;
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
    const buffer = fs.readFileSync(filePath);
    const ast = await OfficeParser.parseOffice(buffer, { newlineDelimiter: '\n' });

    const flatParas = flattenContent(ast.content);
    const tableRows = collectTables(ast.content);
    const { paraToPage, pageCount } = buildParaToPage(flatParas);

    const paragraphsMeta = buildParagraphsMeta(flatParas, paraToPage);
    const chapters = buildChapters(flatParas, paraToPage);
    const markedItems = extractMarkedItems(flatParas, paraToPage);

    const tablesMeta: TableMeta[] = tableRows.map((rows, ti) => {
      const anchor = paragraphsMeta[Math.min(ti, paragraphsMeta.length - 1)] || { page: 1, chapter: '' };
      return {
        tableId: `t${ti}`,
        markdown: buildTableMarkdown(rows),
        page: anchor.page,
        chapter: anchor.chapter,
        rows,
      };
    });

    const rules = loadFieldRules();
    const { extracts, groups, fieldParaMap, fieldGroups } = applyRuleExtraction(rules, paragraphsMeta);

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
      paraToPage,
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