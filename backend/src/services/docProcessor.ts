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
  // 编号条目开头（(2)/5.2/3、…）是目录/条款序号，不是取值
  if (/^[(（]?\d+[、．.·)）]/.test(v)) return null;
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
): { value: string; paraId: number; sourceText: string; score: number } | null {
  const text = unit.text;
  const trimmedStart = text.length - text.trimStart().length;
  // 0. 正则优先（精度最高）
  if (rule.category === 'regex' && rule.pattern) {
    try {
      const m = text.match(new RegExp(rule.pattern));
      const v = ((m && (m[1] || m[0])) || '').trim();
      if (v) {
        let score = 2;
        if (m.index !== undefined && m.index <= trimmedStart) score += 3;
        const afterRe = m.index !== undefined ? text[m.index + m[0].length] : '';
        if (afterRe === '：' || afterRe === ':') score += 2;
        if ([...text].length < 60) score += 1;
        return { value: v, paraId: unit.paraId, sourceText: text, score };
      }
    } catch {
      // 非法正则，回落关键字
    }
  }
  // 关键字在本段内逐个出现位置尝试：跳过“复合长词标签”（如“采购人名称/联系电话：”中的采购人）
  const CJK = /[\u4e00-\u9fff]/;
  let kidx = -1;
  let searchFrom = 0;
  let atStart = false;
  let followedColon = false;
  for (let t = 0; t < 5; t++) {
    const found = text.indexOf(rule.fieldName, searchFrom);
    if (found < 0) return null;
    const after = text[found + rule.fieldName.length] || '';
    // 关键字后面紧跟数个汉字+冒号 = 更长的标签词（如采购人联系电话：），跳过找下一个出现位置
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
  // 单字规则（如 ★ ▲ *）是行首标记：只在行首匹配，避免正文误伤
  if ([...rule.fieldName].length === 1 && text.trimStart().indexOf(rule.fieldName) !== 0) return null;
  const scoreOf = (base: number, val: string): number => {
    let s = base;
    if (atStart) s += 3;
    if (followedColon) s += 2;
    if ([...text].length < 60) s += 1;
    const len = [...val].length;
    if (len >= 2 && len <= 100) s += 1;
    else if (len < 2) s -= 3;
    // 目录/表格味的值（…目录/章节/表格/格式）大概率是串行，可信度降权
    if (/[目录章节篇表格式一览]$/.test(val.trim())) s -= 5;
    return s;
  };

  // 1. 后：同行关键字之后
  let v = cleanValue(text.slice(kidx + rule.fieldName.length), allNames, rule.fieldName);
  if (v) return { value: v, paraId: unit.paraId, sourceText: text, score: scoreOf(1, v) };

  // 2. 右 / 下：表格相邻格（标签独占一格时；裸标签邻格由守卫过滤）
  if (unit.tableId != null) {
    const grid = grids.get(unit.tableId);
    if (grid && unit.row !== undefined && unit.col !== undefined) {
      const right = (grid[unit.row] || [])[unit.col + 1] || '';
      if (right.trim() && !HAS_LABEL.test(right)) {
        v = cleanValue(right, allNames, rule.fieldName);
        if (v && isBareLabelLike(v)) v = null;
        if (v) return { value: v, paraId: unit.paraId, sourceText: `${text} ${right.trim()}`, score: scoreOf(2, v) };
      }
      const belowRow = grid[unit.row + 1];
      const below = (belowRow || [])[unit.col] || '';
      if (below.trim() && !HAS_LABEL.test(below)) {
        v = cleanValue(below, allNames, rule.fieldName);
        if (v && isBareLabelLike(v)) v = null;
        if (v) return { value: v, paraId: unit.paraId, sourceText: `${text} ${below.trim()}`, score: scoreOf(2, v) };
      }
    }
    return null;
  }

  // 3. 前：同行关键字之前（同行有字优先于跨行；同行证据较强）
  const before = text.slice(0, kidx);
  if (before.trim() && [...before].length <= 100) {
    v = cleanValue(before, allNames, rule.fieldName);
    // 去“（以下简称…”后缀取正主（如“中招国际…（以下简称“采购人”）”）
    if (v) v = v.split(/[（(]/)[0].trim() || null;
    if (v) return { value: v, paraId: unit.paraId, sourceText: text, score: scoreOf(2, v) };
  }

  // 4. 下：下一段（仅段落之间，跳过空行；遇到标题则止步；单元格不参与）
  //     目录编号行（数字+空格开头）不是取值，直接止步
  for (let j = idx + 1; j < units.length; j++) {
    const nu = units[j];
    if (nu.tableId != null) continue;
    if (!nu.text.trim()) continue;
    if (nu.level > 0) break;
    if (/^\d+[\s.、．·]/.test(nu.text.trim())) break;
    if (HAS_LABEL.test(nu.text)) break;
    v = cleanValue(nu.text, allNames, rule.fieldName);
    if (v && isBareLabelLike(v)) break;
    if (v) return { value: v, paraId: nu.paraId, sourceText: `${text}\n${nu.text}`, score: scoreOf(-1, v) };
    break;
  }

  // 5. 上：上一段（仅段落之间；严格守卫：非标题、短文本、无冒号、非目录行）
  for (let j = idx - 1; j >= 0; j--) {
    const pu = units[j];
    if (pu.tableId != null) continue;
    if (!pu.text.trim()) continue;
    if (pu.level > 0 || isSectionStart(pu.text)) break;
    if (/^\d+[\s.、．·]/.test(pu.text.trim())) break;
    if (HAS_LABEL.test(pu.text)) break;
    if ([...pu.text].length > 100) break;
    v = cleanValue(pu.text, allNames, rule.fieldName);
    if (v && isBareLabelLike(v)) break;
    // 上位值多为日期/金额/长名称：无数字又短的一律不要
    if (v && !/[0-9]/.test(v) && [...v].length < 10) break;
    if (v) return { value: v, paraId: pu.paraId, sourceText: `${pu.text}\n${text}`, score: scoreOf(-1, v) };
    break;
  }
  return null;
}

/** 关键字取值串到下一个字段时截断（如“预算金额…投标截止时间…”），保证取值干净 */
/** 跨段/邻格取值守卫：无数字、且像裸标签的值不可信（短文本，或以地址/要求/标准等标签后缀结尾） */
const LABEL_SUFFIXES = ['地址', '电话', '传真', '邮箱', '方式', '要求', '标准', '数量', '期限', '须知', '说明', '概述', '概况', '内容', '范围', '条件', '资格', '地点', '时间', '日期', '单位', '联系人', '明细', '清单', '规范', '细则', '办法', '指南', '承诺', '声明', '证书', '执照', '文件', '资料', '材料', '证明', '报告', '方案', '图纸', '表格', '附件'];
function isBareLabelLike(v: string): boolean {
  const t = v.trim();
  if (/[0-9]/.test(t)) return false;
  return LABEL_SUFFIXES.some(s => t.endsWith(s));
}

function truncateAtOtherFields(value: string, fieldNames: string[], self: string): string {
  let cut = -1;
  for (const f of fieldNames) {
    if (!f || f === self || [...f].length < 2) continue;
    const at = value.indexOf(f);
    // at === 0：取值本身就是别的字段名，整体不可信
    if (at >= 0 && (cut < 0 || at < cut)) cut = at;
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

  // 别名归因：别名字段的取值记到规范字段名下，结果页只有规范行
  const keyOf = (rule: FieldRule) =>
    (rule.aliasFor && rule.aliasFor !== rule.fieldName) ? rule.aliasFor : rule.fieldName;
  const isAlias = (r: FieldRule) => keyOf(r) !== r.fieldName;
  // 同一规范键：候选按分取最高（规范优先于别名，保证确定性，与 DB 行序无关）
  const bestByKey: Record<string, { value: string; paraId: number; sourceText: string; score: number; page: number; chapter: string; group: string; fromAlias: boolean } | null> = {};

  const processRule = (rule: FieldRule) => {
    const key = keyOf(rule);
    // 全文候选打分取最优（标签式命中优先于正文顺带提及）
    let best: { value: string; paraId: number; sourceText: string; score: number; page: number; chapter: string } | null = null;
    for (let i = 0; i < units.length; i++) {
      const hit = extractFromUnit(units[i], units, i, grids, rule, allNames);
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

  for (const key of Object.keys(bestByKey)) {
    const b = bestByKey[key]!;
    // 最佳分过低宁缺毋滥（正文顺带提及不采信）；标星走 markedItems，不在此限
    if (b.score < 4 && b.group !== 'star') continue;
    extracts[key] = {
      value: b.value,
      page: b.page,
      chapter: b.chapter,
      group: b.group,
      sourceText: b.sourceText,
      paraIds: [b.paraId],
    };
    groups[key] = b.group;
    fieldGroups[key] = b.group;
    fieldParaMap[key] = b.paraId;
  }

  // 未命中 canonical key 补 null 占位，保证结果页行齐
  const seenKeys = new Set<string>();
  for (const rule of rules) {
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