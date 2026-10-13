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
  value: string | null;
  page: number | null;
  chapter: string;
  group: string;
  sourceText?: string;
  paraIds: number[];
  score?: number;
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
        // tables collected separately
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
    if (accumulated >= charsPerPage * currentPage) currentPage++;
  }
  return { paraToPage, pageCount: estimatedPages };
}

const SCORE_TABLE_KEYWORDS = ['评分', '分值', '得分', '权重', '评标', '商务分', '技术分', '价格分'];
const TECH_TABLE_KEYWORDS = ['技术', '参数', '规格', '配置', '设备', '性能', '服务', '验收', '指标', '系统', '软件', '硬件', '方案', '质保'];

function detectTableGroup(rows: string[][]): string {
  const text = rows.flat().join(' ');
  const count = (kws: string[]) => kws.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
  const scoreHits = count(SCORE_TABLE_KEYWORDS);
  const techHits = count(TECH_TABLE_KEYWORDS);
  if (scoreHits < 2 && techHits < 2) return '';
  return scoreHits >= techHits ? 'score' : 'tech';
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

function truncateAtOtherFields(value: string, fieldNames: string[], self: string): string {
  let cut = -1;
  for (const f of fieldNames) {
    if (!f || f === self || [...f].length < 2) continue;
    const at = value.indexOf(f);
    if (at >= 0 && (cut < 0 || at < cut)) cut = at;
  }
  if (cut < 0) return value;
  return value.slice(0, cut).replace(/[：:、,，；;\s]+$/, '').trim();
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
  allNames: string[],
): { value: string; paraId: number; sourceText: string; score: number } | null {
  const text = unit.text;
  const trimmedStart = text.length - text.trimStart().length;

  // 0. 正则优先（精度最高）
  //    DOCX 文本常被拆分成多段，仅在当段以冒号/引导符结尾时才与下一段合并
  if (rule.category === 'regex' && rule.pattern) {
    try {
      const re = new RegExp(rule.pattern);
      const m = text.match(re);
      if (m) {
        const v = ((m[1] || m[0]) || '').trim();
        if (v) {
          let score = 2;
          if (m.index !== undefined && m.index <= trimmedStart) score += 3;
          const afterRe = m.index !== undefined ? text[m.index + m[0].length] : '';
          if (afterRe === '：' || afterRe === ':') score += 2;
          if ([...text].length < 60) score += 1;
          if (/[目录章节篇表格式一览]$/.test(v.trim())) score -= 5;
          return { value: v, paraId: unit.paraId, sourceText: text, score };
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
            const v = ((mm[1] || mm[0]) || '').trim();
            if (v) {
              let score = 2;
              if (/[目录章节篇表格式一览]$/.test(v.trim())) score -= 5;
              return { value: v, paraId: unit.paraId, sourceText: merged, score };
            }
          }
        }
      }
    } catch { /* 非法正则回落关键字 */ }
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
  let v = cleanValue(text.slice(kidx + rule.fieldName.length), allNames, rule.fieldName);
  if (v) return { value: v, paraId: unit.paraId, sourceText: text, score: scoreOf(1, v) };

  // 2. 右 / 下：表格相邻格（裸标签邻格由守卫过滤）
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

  // 3. 前：同行关键字之前（同行证据较强）
  const before = text.slice(0, kidx);
  if (before.trim() && [...before].length <= 100) {
    v = cleanValue(before, allNames, rule.fieldName);
    // 去"（以下简称…"后缀取正主
    if (v) v = v.split(/[（(]/)[0].trim() || null;
    if (v) return { value: v, paraId: unit.paraId, sourceText: text, score: scoreOf(2, v) };
  }

  // 4. 下：下一段（跳过空行；遇标题或目录行止步）
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

  // 5. 上：上一段（严格守卫：非标题、非目录行、无冒号）
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
    // 上位值多为日期/金额/长名称：无数字又短的不采信
    if (v && !/[0-9]/.test(v) && [...v].length < 10) break;
    if (v) return { value: v, paraId: pu.paraId, sourceText: `${pu.text}\n${text}`, score: scoreOf(-1, v) };
    break;
  }
  return null;
}

/** 标题兜底提取：对没有标签但形似项目名的首段直接返回 */
function extractTitleProjectName(paras: FlatParagraph[]): { value: string; score: number } | null {
  // 取前10段中第一个像项目名的（长度≥8，无冒号，纯中文/数字/空格组合，非标题行）
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
  return null;
}

function applyRuleExtraction(
  rules: FieldRule[],
  units: SearchUnit[],
  grids: Map<string, string[][]>,
  paras: FlatParagraph[],
): { extracts: Record<string, FieldExtract>; groups: Record<string, string>; fieldParaMap: Record<string, number>; fieldGroups: Record<string, string> } {
  const extracts: Record<string, FieldExtract> = {};
  const groups: Record<string, string> = {};
  const fieldParaMap: Record<string, number> = {};
  const fieldGroups: Record<string, string> = {};
  const allNames = rules.map(r => r.fieldName);

  const keyOf = (rule: FieldRule) =>
    (rule.aliasFor && rule.aliasFor !== rule.fieldName) ? rule.aliasFor : rule.fieldName;
  const isAlias = (r: FieldRule) => keyOf(r) !== r.fieldName;

  const bestByKey: Record<string, { value: string; paraId: number; sourceText: string; score: number; page: number; chapter: string; group: string; fromAlias: boolean } | null> = {};

  const processRule = (rule: FieldRule) => {
    const key = keyOf(rule);

    // title_first 类型：跳过，最后统一处理（避免标题行误中覆盖 regex 结果）
    if (rule.category === 'title_first') return;

    // 全文候选打分取最优
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
      };
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
    };
    groups[key] = b.group;
    fieldGroups[key] = b.group;
    fieldParaMap[key] = b.paraId;
  }

  // 未命中补 null 占位
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
      if (paras[i].text.includes(sym)) {
        const page = i < paraToPage.length ? paraToPage[i] : 1;
        let text = paras[i].text.trim();
        if ([...text].length > 120) text = [...text].slice(0, 120).join('') + '...';
        items.push({ symbol: sym, text, page });
        break;
      }
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

export async function parseDocument(filePath: string, options?: { skillId?: string; taskId?: string }): Promise<ExtractOutput> {
  const ext = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_EXT.includes(ext)) {
    return {
      fileMeta: { fileName: path.basename(filePath), fileMd5: '', parseTime: new Date().toISOString(), parser: 'officeparser', warningList: [`不支持的格式：${ext || '未知'}`] },
      documentStructure: [], extractResult: {}, validateResult: { isPass: false, validateMsg: '不支持格式', checkItems: [] },
      extractMode: 'rule_only', markedItems: [], tables: [], paragraphsMeta: [], pageCount: 0,
    };
  }
  if (ext === '.doc') {
    return {
      fileMeta: { fileName: path.basename(filePath), fileMd5: '', parseTime: new Date().toISOString(), parser: 'officeparser', warningList: ['.doc 格式暂不支持，请转换为 .docx 后上传'] },
      documentStructure: [], extractResult: {}, validateResult: { isPass: false, validateMsg: '.doc 不支持', checkItems: [] },
      extractMode: 'rule_only', markedItems: [], tables: [], paragraphsMeta: [], pageCount: 0,
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      fileMeta: { fileName: path.basename(filePath), fileMd5: '', parseTime: new Date().toISOString(), parser: 'officeparser', warningList: ['文件不存在'] },
      documentStructure: [], extractResult: {}, validateResult: { isPass: false, validateMsg: '文件不存在', checkItems: [] },
      extractMode: 'rule_only', markedItems: [], tables: [], paragraphsMeta: [], pageCount: 0,
    };
  }

  try {
    let flatParas: FlatParagraph[];
    let tableRows: string[][][];
    if (ext === '.txt') {
      const text = fs.readFileSync(filePath, 'utf-8');
      flatParas = text.split(/\r?\n/).map(t => t.trim()).filter(Boolean)
        .map(t => ({ text: t, chapter: '', level: 0 }));
      tableRows = [];
    } else {
      const buffer = fs.readFileSync(filePath);
      const fileTypeHint = { '.md': 'md', '.html': 'html', '.csv': 'csv' }[ext];
      const ast = await OfficeParser.parseOffice(buffer, {
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

    const { extracts, groups, fieldParaMap, fieldGroups } = applyRuleExtraction(rules, units, grids, flatParas);
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

    const fileMd5 = cryptoCreateHash(filePath);

    // Skill-driven LLM enhancement (optional)
    let llmResult: Record<string, string> | undefined;
    let extractMode = 'rule_only' as 'rule_only' | 'llm_enhanced';
    if (options?.skillId) {
      const skill = db.prepare(
        'SELECT * FROM tender_llm_skill WHERE id = ? AND enable = 1'
      ).get(options.skillId) as any;
      const hasPrompt = !!(skill?.prompt_template || skill?.bind_prompt_template_id);
      if (skill && skill.enable_llm && hasPrompt) {
        try {
          llmResult = await runLLMExtraction(skill, flatParas, chapters, extracts);
          const merged = mergeLLMResult(extracts, groups, fieldGroups, llmResult, skill.biz_type || 'info');
          if (merged > 0) extractMode = 'llm_enhanced';
          else console.warn('[docProcessor] LLM returned no usable fields, keep rule_only:', options.skillId);
        } catch (llmErr) {
          console.error('[docProcessor] LLM extraction failed, falling back to rule-only:', llmErr);
          extractMode = 'rule_only';
        }
      }
    }

    // Persist task record if taskId provided
    if (options?.taskId) {
      try {
        const skillName = (db.prepare('SELECT skill_name FROM tender_llm_skill WHERE id = ?').get(options.skillId) as any)?.skill_name || '';
        db.prepare(`INSERT INTO extraction_tasks (
          id, filename, file_size, skill_id, skill_name, status, extract_mode,
          result_json, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).run(
          options.taskId,
          path.basename(filePath),
          fs.statSync(filePath).size,
          options.skillId || '',
          skillName,
          'completed',
          extractMode,
          JSON.stringify({
            fileMeta: {
              fileName: path.basename(filePath),
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
            paragraphsMeta,
            pageCount,
          }),
        );
      } catch { /* ignore persistence errors */ }
    }

    return {
      fileMeta: {
        fileName: path.basename(filePath),
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
      extractMode: 'rule_only', markedItems: [], tables: [], paragraphsMeta: [], pageCount: 0,
    };
  }
}

function cryptoCreateHash(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buf).digest('hex');
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════════════
// LLM 抽取增强（V1.4 选配）
// ═══════════════════════════════════════════════════════════

/**
 * 把 LLM 返回的 { field: value } 合并回规则抽取结果。
 * LLM 覆盖/补全新值并标记来源；空值不覆盖已有规则值。
 * 返回实际合并的字段数（为 0 时调用方保持 rule_only）。
 */
function mergeLLMResult(
  extracts: Record<string, FieldExtract>,
  groups: Record<string, string>,
  fieldGroups: Record<string, string>,
  llmResult: Record<string, string> | undefined,
  fallbackGroup: string,
): number {
  if (!llmResult) return 0;
  let merged = 0;
  for (const [field, raw] of Object.entries(llmResult)) {
    const value = typeof raw === 'string' ? raw.trim() : raw as any;
    if (value === undefined || value === null || value === '') continue;
    const prev = extracts[field];
    extracts[field] = {
      value: value as string,
      page: prev?.page ?? null,
      chapter: prev?.chapter || 'LLM',
      group: prev?.group || fallbackGroup,
      sourceText: 'LLM增强',
      paraIds: prev?.paraIds || [],
    };
    groups[field] = extracts[field].group;
    fieldGroups[field] = extracts[field].group;
    merged++;
  }
  return merged;
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

/**
 * 将文档章节按 biz_type 分块，调用 LLM 进行结构化抽取。
 * 返回 { fieldName: extractedText } 映射，用于合并到 extractResult。
 */
async function runLLMExtraction(
  skill: LLMSkillRow,
  paras: FlatParagraph[],
  chapters: Chapter[],
  ruleResult: Record<string, FieldExtract>,
): Promise<Record<string, string>> {
  const bizType = (skill as any).biz_type || 'info';
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
  // 按章节分组文本
  const chunksByType: Record<string, string> = {};
  for (const ch of chapters) {
    const text = ch.content.join('\n').trim();
    if (!text) continue;
    // 简单按标题关键词分类到对应 biz_type 块
    const key = classifyChapter(ch.title, ch.content);
    chunksByType[key] = (chunksByType[key] || '') + '\n' + text;
  }
  // 若无分类结果，把所有段落合并为一个 chunk
  if (Object.keys(chunksByType).length === 0) {
    chunksByType['all'] = paras.map(p => p.text).join('\n');
  }

  const allResults: Record<string, string> = {};

  for (const [chunkKey, chunkText] of Object.entries(chunksByType)) {
    const filled = effectivePrompt
      .replace(/\{\{chunkText\}\}/g, chunkText.slice(0, 3000))
      .replace(/\{\{preExtract\}\}/g, JSON.stringify(ruleResult));

    const apiConfig = skill.llm_api_config_id
      ? db.prepare('SELECT * FROM api_configs WHERE id = ? AND enabled = 1').get(skill.llm_api_config_id)
      : null;

    if (!apiConfig) {
      console.warn('[docProcessor] No API config found for skill', skill.id);
      continue;
    }

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
  // Try to find JSON block in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  // Try array
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
