# 标书核心提取重构：LLM+RAG 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将标书核心提取从 Go 正则规则引擎重构为 LLM+RAG 主路径（Go unioffice 纯解析 → TS 分块 + SQLite FTS5 BM25 检索 → LLM 按字段抽取并逐字段溯源），规则应用移除、仅保留字段 schema。

**Architecture:** Go doc-handler 收窄为纯解析器并输出段落/表格元数据；后端 TS 将解析结果按章节语义分块写入 job 作用域的 SQLite FTS5 表，经 BM25 召回 top-k chunk，按 6 分类分组送 LLM 强制 JSON 抽取，返回 `{value, page, chapter, sourceText, paraIds}` 溯源结构；前端标签页展示溯源并支持预览定位。

**Tech Stack:** Go(unioffice)、TypeScript(Express + better-sqlite3 FTS5)、Vue3(Element Plus)、Vitest、axios。

**参考设计文档：** `docs/superpowers/specs/2026-08-10-bid-extraction-rag-design.md`

## Global Constraints

- `.docx` 是唯一支持的上传格式（维持现状）。
- 复用现有 SQLite `better-sqlite3` 连接与 `api_configs` 密钥解密；不新增外部服务。
- 检索先实现 **BM25 关键词**（`Ft5Retriever`）；`Retriever` 接口留作后期 dense embedding 替换点。
- 字段 schema 取自 `extraction_rules`(enabled=1) 的 `field_name / group_name`，描述用 `llmExtractor.ts` 现有 `descriptions` 映射表。
- RAG/LLM 不可用（未启用/无 key/超时）时降级为"仅解析 + 关键词召回文本"，不阻断上传。
- 逐字段溯源为硬要求：每个非 null 字段必须携带 `{value, score?, page, chapter, sourceText, paraIds}`。
- 后端测试用 vitest（无配置文件，默认 glob `**/*.test.ts`），测试文件放 `backend/src/**`。
- 前端标签页数据源从 `result.extracts`（原标量）迁到新的 `{value, provenance}` 结构。

---

### Task 1: Go doc-handler 收窄为纯解析器并输出元数据

**Files:**
- Modify: `backend/doc-handler/main.go`
- Test: `backend/doc-handler/main_test.go`（新建）

**Interfaces:**
- Produces（后续 TS 任务依赖的 JSON 类型）：
  ```jsonc
  // ParseResponse 新增字段
  "paragraphsMeta": [ { "text": "...", "paraId": 0, "chapter": "一、招标公告", "level": 1, "page": 1 } ],
  "tablesMeta":    [ { "tableId": "t0", "markdown": "| a | b |\n|---|---|", "page": 1, "chapter": "...", "rows": [["a","b"]] } ]
  ```
- Consumes：沿用 `ParseRequest{FilePath}`，**移除** `Rules` 读取。

- [ ] **Step 1: 编写解析元数据单测（先失败）**

`backend/doc-handler/main_test.go`：
```go
package main

import (
	"strings"
	"testing"
)

func TestBuildTablesMeta(t *testing.T) {
	rows := [][]string{{"序号", "评分项"}, {"1", "技术方案"}}
	meta := buildTablesMeta(rows, 0, 3, "评分标准")
	if meta.TableId != "t0" {
		t.Fatalf("tableId wrong: %s", meta.TableId)
	}
	if !strings.Contains(meta.Markdown, "| 序号 | 评分项 |") {
		t.Fatalf("markdown missing header: %s", meta.Markdown)
	}
	if meta.Page != 3 || meta.Chapter != "评分标准" {
		t.Fatalf("page/chapter wrong: %d/%s", meta.Page, meta.Chapter)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend/doc-handler && go test ./... -run "TestBuildTablesMeta" -v`
Expected: FAIL，`buildTablesMeta` 未定义。

- [ ] **Step 3: 新增元数据输出类型与表格 Markdown 构建函数**

在 `main.go` 添加：
```go
type ParaMeta struct {
	Text    string `json:"text"`
	ParaId  int    `json:"paraId"`
	Chapter string `json:"chapter"`
	Level   int    `json:"level"`
	Page    int    `json:"page"`
}

type TableMeta struct {
	TableId  string     `json:"tableId"`
	Markdown string     `json:"markdown"`
	Page     int        `json:"page"`
	Chapter  string     `json:"chapter"`
	Rows     [][]string `json:"rows"`
}

func tableCellToMarkdown(s string) string {
	s = strings.ReplaceAll(s, "\n", "<br>")
	s = strings.ReplaceAll(s, "|", "\\|")
	return s
}

func buildTablesMeta(rows [][]string, index, page int, chapter string) TableMeta {
	mdRows := make([]string, 0, len(rows)+1)
	if len(rows) > 0 {
		mdRows = append(mdRows, "| "+strings.Join(mapSlice(rows[0], tableCellToMarkdown), " | ")+" |")
		sep := make([]string, len(rows[0]))
		for i := range sep {
			sep[i] = "---"
		}
		mdRows = append(mdRows, "| "+strings.Join(sep, " | ")+" |")
	}
	for _, r := range rows[1:] {
		mdRows = append(mdRows, "| "+strings.Join(mapSlice(r, tableCellToMarkdown), " | ")+" |")
	}
	return TableMeta{
		TableId:  fmt.Sprintf("t%d", index),
		Markdown: strings.Join(mdRows, "\n"),
		Page:     page,
		Chapter:  chapter,
		Rows:     rows,
	}
}

func mapSlice[T any, U any](in []T, f func(T) U) []U {
	out := make([]U, len(in))
	for i, v := range in {
		out[i] = f(v)
	}
	return out
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend/doc-handler && go test ./...`
Expected: PASS。

- [ ] **Step 5: 移除规则应用代码并改写解析主函数输出元数据**

删除以下函数（及其唯一被调处）：`applyRules`、`extractByKeyword`、`extractFromTables`、`extractFromTableCells`、`extractStructuredValue`、`findFieldParagraphs`、`getCompiledRules`、`matchSpecificity`、`scoreWithPriority`、`extractTechSection`/`isTechItem`、`techItemPattern`/`majorStopPattern`、`compiledRulesCache`、`priorityTable`/`priorityRegexExact`/`priorityKeyword`/`priorityFallback` 常量、`Rule` 类型、`ParseRequest.Rules` 字段、`sectionKeywords`/`contentGroupKeywords`/`detectSection`/`detectContentGroup`/`isSectionStart` 的 group 返回（若不再用 group 则一并简化，`sectionStarters` 保留用于章节边界）。

在 `extractDocxWithChapters` 内：
- 维护 `currentChapterTitle`（当前章标题）与 `currentLevel`；每次 `isHeading`(level≤3) 或 `isSectionStart` 起新章时更新。段落循环内即时追加 `paraMetas`：
```go
paraMetas = append(paraMetas, ParaMeta{
	Text:    text,
	ParaId:  len(paraMetas),
	Chapter: currentChapterTitle,
	Level:   currentLevel,
	Page:    pageCount + 1,
})
```
- 表格改为按文档顺序交错遍历（`doc.Body()` 遍历段落与表格），同时产出 `tablesMeta`。每表 `rows` 抽成 `[][]string`，`page`(当前页) / `chapter`(当前章标题)。若交错遍历实现复杂度过高，退化为沿用 `doc.Tables()` 顺序编号，`page`/`chapter` 取近似（该表在段落序列首字符对应页/章），并在 `main_test.go` 备注该近似性。目标以交错遍历为准。
- 返回签名改为：`(... tablesMeta []TableMeta, paraMetas []ParaMeta, err error)`，并在 `main()` 中传入新的 `ParseResponse.ParagraphsMeta` / `TablesMeta`；移除 `applyRules` 调用，不再读 `req.Rules`。

- [ ] **Step 6: 运行测试确认回归通过**

Run: `cd backend/doc-handler && go test ./... && go build -o dist/doc-handler .`
Expected: PASS + 编译成功。

- [ ] **Step 7: 提交**

```bash
git add backend/doc-handler/main.go backend/doc-handler/main_test.go
git commit -m "refactor(doc-handler): pure parser with paragraph/table metadata, drop rule engine"
```

---

### Task 2: TS 分块 + SQLite FTS5 BM25 检索

**Files:**
- Create: `backend/src/services/retrieval.ts`
- Create: `backend/src/services/retrieval.test.ts`
- Modify: `backend/src/services/docProcessor.ts`（扩展 `ParseResult` 类型）

**Interfaces:**
- Consumes：Task 1 的 `ParagraphMeta`/`TableMeta`（下面给出 TS 镜像类型）。
- Produces：
  ```ts
  export interface ParagraphMeta { text: string; paraId: number; chapter: string; level: number; page: number }
  export interface TableMeta { tableId: string; markdown: string; page: number; chapter: string; rows: string[][] }
  export interface Chunk { chunkId: string; seq: number; chapter: string; pageStart: number; pageEnd: number; content: string; paraIds: number[]; tableIds: string[] }
  export function chunkText(paras: ParagraphMeta[], tables: TableMeta[], maxChars: number): Chunk[]
  export interface Retriever { retrieve(query: string, topK: number): Promise<Chunk[]>; close(): void }
  export class Ft5Retriever implements Retriever {
    constructor(dbPath: string, jobId: string, chunks: Chunk[])
    async retrieve(query: string, topK: number): Promise<Chunk[]>
    close(): void
  }
  ```

- [ ] **Step 1: 编写分块单测（先失败）**

`backend/src/services/retrieval.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { chunkText, Ft5Retriever } from './retrieval.js';
import type { ParagraphMeta, TableMeta } from './retrieval.js';

const paras: ParagraphMeta[] = [
  { text: '一、资格要求', paraId: 0, chapter: '一、资格要求', level: 1, page: 1 },
  { text: '投标人须具备建筑工程施工总承包壹级资质。', paraId: 1, chapter: '一、资格要求', level: 0, page: 1 },
  { text: '二、评分标准', paraId: 2, chapter: '二、评分标准', level: 1, page: 2 },
  { text: '技术分满分40分。', paraId: 3, chapter: '二、评分标准', level: 0, page: 2 },
  { text: '三、废标条款', paraId: 4, chapter: '三、废标条款', level: 1, page: 3 },
  { text: '未提供投标保证金保函的，作废标处理。', paraId: 5, chapter: '三、废标条款', level: 0, page: 3 },
];

describe('chunkText', () => {
  it('按章节边界分块', () => {
    const chunks = chunkText(paras, [], 5000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].chapter).toBe('一、资格要求');
    expect(chunks[2].chapter).toBe('三、废标条款');
  });
  it('超长块按段落再切', () => {
    const long = [
      { text: '一、资格要求', paraId: 0, chapter: '一、资格要求', level: 1, page: 1 },
      { text: '甲乙丙丁'.repeat(400), paraId: 1, chapter: '一、资格要求', level: 0, page: 1 },
    ];
    const chunks = chunkText(long, [], 500);
    expect(chunks.length).toBeGreaterThan(1);
  });
  it('合并表格 markdown 到所属章块', () => {
    const tables: TableMeta[] = [{
      tableId: 't0', markdown: '| 序号 | 分值 |\n|---|---|', page: 2, chapter: '二、评分标准', rows: [],
    }];
    const chunks = chunkText(paras, tables, 5000);
    const score = chunks.find(c => c.chapter === '二、评分标准')!;
    expect(score.content).toContain('| 序号 | 分值 |');
    expect(score.tableIds).toContain('t0');
  });
});

describe('Ft5Retriever', () => {
  it('按关键词 BM25 召回相关 chunk', async () => {
    const chunks = chunkText(paras, [], 5000);
    const r = new Ft5Retriever(':memory:', 'job1', chunks);
    const res = await r.retrieve('废标 保函', 3);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].content).toContain('废标');
    r.close();
  });
});
```

- [ ] **Step 2: 反向运行确认失败**

Run: `cd backend && npx vitest run src/services/retrieval.test.ts`
Expected: FAIL（`chunkText` / `Ft5Retriever` 不存在）。

- [ ] **Step 3: 实现 `retrieval.ts`**

```ts
import Database from 'better-sqlite3';

export interface ParagraphMeta { text: string; paraId: number; chapter: string; level: number; page: number }
export interface TableMeta { tableId: string; markdown: string; page: number; chapter: string; rows: string[][] }
export interface Chunk {
  chunkId: string; seq: number; chapter: string;
  pageStart: number; pageEnd: number; content: string;
  paraIds: number[]; tableIds: string[];
}

export function chunkText(paras: ParagraphMeta[], tables: TableMeta[], maxChars: number): Chunk[] {
  const byChapter = new Map<string, { paras: ParagraphMeta[]; tables: TableMeta[] }>();
  for (const p of paras) {
    const key = p.chapter || '(前言)';
    if (!byChapter.has(key)) byChapter.set(key, { paras: [], tables: [] });
    byChapter.get(key)!.paras.push(p);
  }
  for (const t of tables) {
    const key = t.chapter || '(前言)';
    if (!byChapter.has(key)) byChapter.set(key, { paras: [], tables: [] });
    if (byChapter.get(key)!.tables.some(x => x.tableId === t.tableId)) continue;
    byChapter.get(key)!.tables.push(t);
  }

  const chunks: Chunk[] = [];
  let seq = 0;
  for (const [chapter, group] of byChapter) {
    const fullText = [
      ...group.paras.map(p => p.text),
      ...group.tables.map(t => t.markdown),
    ].join('\n');
    if (fullText.length <= maxChars) {
      chunks.push({
        chunkId: `c_${seq}`, seq, chapter,
        pageStart: firstPage(group.paras, group.tables), pageEnd: lastPage(group.paras, group.tables),
        content: fullText,
        paraIds: group.paras.map(p => p.paraId), tableIds: group.tables.map(t => t.tableId),
      });
      seq++;
      continue;
    }
    let buf = ''; let bufParas: number[] = []; let startPage = 0;
    const pushChunk = (content: string, paraIds: number[], ps: number, pe: number) => {
      chunks.push({ chunkId: `c_${seq}`, seq, chapter, pageStart: ps, pageEnd: pe, content, paraIds, tableIds: [] });
      seq++;
    };
    for (const p of group.paras) {
      if (buf && buf.length + p.text.length > maxChars) {
        pushChunk(buf, bufParas, startPage, p.page);
        buf = ''; bufParas = []; startPage = 0;
      }
      if (!startPage) startPage = p.page;
      buf += (buf ? '\n' : '') + p.text;
      bufParas.push(p.paraId);
    }
    if (buf) pushChunk(buf, bufParas, startPage, lastPage(group.paras, group.tables));
  }
  return chunks;
}

function firstPage(paras: ParagraphMeta[], tables: TableMeta[]): number {
  const a = paras.length ? paras[0].page : Infinity;
  const b = tables.length ? tables[0].page : Infinity;
  return Math.min(a, b) === Infinity ? 1 : Math.min(a, b);
}
function lastPage(paras: ParagraphMeta[], tables: TableMeta[]): number {
  let m = 1;
  if (paras.length) m = Math.max(m, paras[paras.length - 1].page);
  tables.forEach(t => { m = Math.max(m, t.page); });
  return m;
}

export interface Retriever { retrieve(query: string, topK: number): Promise<Chunk[]>; close(): void }

export class Ft5Retriever implements Retriever {
  private db: Database.Database;
  private chunks: Chunk[];
  constructor(dbPath: string, jobId: string, chunks: Chunk[]) {
    this.db = new Database(dbPath);
    this.chunks = chunks;
    this.db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, chunkid UNINDEXED)');
    const ins = this.db.prepare('INSERT INTO chunks_fts (content, chunkid) VALUES (?, ?)');
    for (const c of chunks) ins.run(c.content, c.chunkId);
  }
  async retrieve(query: string, topK: number): Promise<Chunk[]> {
    const tokenized = query.replace(/[，。、；：\s,.;:]+/g, ' ');
    const rows = this.db.prepare(
      'SELECT chunkid FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?'
    ).all(tokenized, topK) as Array<{ chunkid: string }>;
    const byId = new Map(this.chunks.map(c => [c.chunkId, c]));
    return rows.map(r => byId.get(r.chunkid)).filter((c): c is Chunk => !!c);
  }
  close(): void { this.db.close(); }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npx vitest run src/services/retrieval.test.ts`
Expected: PASS。

- [ ] **Step 5: 扩展 `ParseResult` 类型**

`backend/src/services/docProcessor.ts`：在 `ParseResult` 增加 `paragraphsMeta` / `tablesMeta`，并 `import type { ParagraphMeta, TableMeta } from './retrieval.js';`。同时移除 `ParseResult` 中不再使用的 `groups`/`chapters`(保留 text/paraToPage/pageCount) 相关如与主链路无关的旧字段——只做最小变更，`docProcessor.ts` 的 `ParseRequest` 不再构造 `rules`（删除从库读取规则的代码块）。

- [ ] **Step 6: 提交**

```bash
git add backend/src/services/retrieval.ts backend/src/services/retrieval.test.ts backend/src/services/docProcessor.ts
git commit -m "feat: semantic chunking + SQLite FTS5 BM25 retriever"
```

---

### Task 3: RAG + LLM 分字段抽取并返回逐字段溯源

**Files:**
- Create: `backend/src/services/ragExtraction.ts`
- Create: `backend/src/services/ragExtraction.test.ts`
- Modify: `backend/src/services/llmExtractor.ts`（导出复用件）
- Modify: `backend/src/routes/upload.ts`（接入 `runRagExtraction`，启用 RAG 主链路）

**Interfaces:**
- Consumes：Task 2 的 `chunkText`/`Ft5Retriever`/`Chunk`/`ParagraphMeta`/`TableMeta`；`llmExtractor.ts` 的 `callLLM`/`estimateTokens`/`getLlmSettings`/`descriptions`/`resolveApiKey`。
- Produces：
  ```ts
  export interface FieldExtract { value: unknown; score?: number; page: number | null; chapter: string; sourceText?: string; paraIds: number[] }
  export type RagResult = Record<string, FieldExtract | null>
  export async function runRagExtraction(jobId: string, result: ParseResult): Promise<RagResult>
  ```

- [ ] **Step 1: 编写 schema 与溯源解析单测（先失败）**

`backend/src/services/ragExtraction.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { parseFieldResponses, groupFieldsByGroup, buildRetrievalQuery } from './ragExtraction.js';

describe('groupFieldsByGroup', () => {
  it('按 group 分组字段', () => {
    const fields = [
      { fieldName: 'business_license', group: 'business', description: '营业执照' },
      { fieldName: 'score_full', group: 'score', description: '满分' },
    ] as any;
    const g = groupFieldsByGroup(fields);
    expect(Object.keys(g).sort()).toEqual(['business', 'score']);
  });
});

describe('buildRetrievalQuery', () => {
  it('为分类构造召回关键词', () => {
    expect(buildRetrievalQuery('business')).toContain('资格');
    expect(buildRetrievalQuery('seal')).toContain('废标');
  });
});

describe('parseFieldResponses', () => {
  it('解析带溯源的 JSON', () => {
    const raw = JSON.stringify({
      business_license: { value: '营业执照正本', page: 5, chapter: '一、资格要求', sourceText: '……', paraIds: [12] },
      score_full: null,
    });
    const out = parseFieldResponses(raw, new Set(['business_license', 'score_full']));
    expect(out.business_license!.value).toBe('营业执照正本');
    expect(out.business_license!.page).toBe(5);
    expect(out.score_full).toBeNull();
  });
});
```

- [ ] **Step 2: 反向运行确认失败**

Run: `cd backend && npx vitest run src/services/ragExtraction.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 `ragExtraction.ts`（schema/分组/召回查询/响应解析）**

```ts
import { chunkText, Ft5Retriever } from './retrieval.js';
import type { Chunk, ParagraphMeta, TableMeta } from './retrieval.js';
import type { ParseResult } from './docProcessor.js';
import { getLlmSettings, callLLM, estimateTokens, descriptions, resolveApiKey } from './llmExtractor.js';
import { db } from '../database.js';

export interface FieldExtract { value: unknown; score?: number; page: number | null; chapter: string; sourceText?: string; paraIds: number[] }
export type RagResult = Record<string, FieldExtract | null>;

interface FieldDef { fieldName: string; group: string; description: string }

export function groupFieldsByGroup(fields: FieldDef[]): Record<string, FieldDef[]> {
  const out: Record<string, FieldDef[]> = {};
  for (const f of fields) { (out[f.group] ||= []).push(f); }
  return out;
}

const RETRIEVAL_HINTS: Record<string, string> = {
  info: '招标公告 项目 采购人 保证金 截止时间 开标 预算',
  business: '资格 资质 要求 资格条件 商务 付款 质保 验收 联合体',
  tech: '技术规格 技术要求 参数 指标 验收标准 服务 培训',
  score: '评分 评分标准 评标办法 分值 满分 评审因素 权重',
  seal: '废标 无效投标 否决 实质性响应 封标 密封 正本 副本',
};

export function buildRetrievalQuery(group: string): string {
  return RETRIEVAL_HINTS[group] || '投标 招标 要求';
}

export function parseFieldResponses(raw: string, expected: Set<string>): RagResult {
  let obj: Record<string, any>;
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Cannot parse LLM response as JSON');
    obj = JSON.parse(m[0]);
  }
  const out: RagResult = {};
  for (const name of expected) {
    const v = obj[name];
    if (v == null || (typeof v === 'object' && v.value == null)) { out[name] = null; continue; }
    const rec = typeof v === 'object' ? v : { value: v };
    out[name] = {
      value: rec.value,
      score: typeof rec.score === 'number' ? rec.score : undefined,
      page: typeof rec.page === 'number' ? rec.page : null,
      chapter: rec.chapter ?? '',
      sourceText: rec.sourceText ?? undefined,
      paraIds: Array.isArray(rec.paraIds) ? rec.paraIds : [],
    };
  }
  return out;
}

function getFieldSchema(): FieldDef[] {
  const rows = db.prepare('SELECT field_name, group_name FROM extraction_rules WHERE enabled = 1').all() as Array<{ field_name: string; group_name: string }>;
  return rows.map(r => ({ fieldName: r.field_name, group: r.group_name || 'info', description: descriptions[r.field_name] || r.field_name }));
}

function buildPrompt(group: string, fields: FieldDef[], context: string) {
  const list = fields.map((f, i) => `${i + 1}. ${f.fieldName}（${f.description}）`).join('\n');
  const system =
    '你是专业的中文招标文件信息抽取助手。仅依据给定片段抽取，禁止编造。' +
    '对每个字段：value 填原文；page/chapter/sourceText/paraIds 必须来自片段中位置元数据；' +
    '找不到则整体为 null。输出为合法 JSON，键名是字段名。';
  const user =
    `【分类】${group}\n【待提取字段】\n${list}\n\n【检索片段】\n${context}\n\n` +
    `返回 JSON，形如：{"field_name":{"value":"...","page":5,"chapter":"一、资格要求","sourceText":"...","paraIds":[12]}}。无则为 null。`;
  return { system, user };
}

function fallbackContext(chunks: Chunk[]): string {
  return chunks.slice(0, 3).map((c, i) => `[片段${i}] 章节:${c.chapter}\n${c.content}`).join('\n\n---\n\n');
}

export async function runRagExtraction(jobId: string, result: ParseResult): Promise<RagResult> {
  const paras: ParagraphMeta[] = result.paragraphsMeta ?? [];
  const tables: TableMeta[] = result.tablesMeta ?? [];
  const settings = getLlmSettings();
  const maxChars = Math.max(400, Math.min(3000, Math.floor((settings.maxDocChars || 32000) / 24)));
  const chunks = chunkText(paras, tables, maxChars);

  const retriever = new Ft5Retriever(':memory:', jobId, chunks);
  try {
    const fieldDefs = getFieldSchema();
    const byGroup = groupFieldsByGroup(fieldDefs);
    const out: RagResult = {};
    for (const [group, fields] of Object.entries(byGroup)) {
      const topK = Math.max(3, Math.min(8, chunks.length));
      const hits = await retriever.retrieve(buildRetrievalQuery(group), topK);
      const ctx = hits.length
        ? hits.map((c, i) => `[片段${i}] 章节:${c.chapter} 页:${c.pageStart}-${c.pageEnd}\n${c.content}`).join('\n\n---\n\n')
        : fallbackContext(chunks);
      const prompt = buildPrompt(group, fields, ctx);
      const tokens = estimateTokens(prompt.system + prompt.user);
      if (tokens > 90_000) {
        const shortCtx = hits.slice(0, 3).map((c, i) => `[片段${i}]\n${c.content}`).join('\n\n---\n\n');
        Object.assign(prompt, buildPrompt(group, fields, shortCtx));
      }
      const { key, baseUrl, model } = resolveApiKey();
      let text: string;
      try {
        text = await callLLM(key, baseUrl, model, prompt.system, prompt.user, settings.timeoutSeconds);
      } catch (e: any) {
        console.warn(`[RAG] group ${group} failed:`, e.message);
        continue;
      }
      Object.assign(out, parseFieldResponses(text, new Set(fields.map(f => f.fieldName))));
    }
    return out;
  } finally {
    retriever.close();
  }
}
```

- [ ] **Step 4: 运行测试确认当前通过**

Run: `cd backend && npx vitest run src/services/ragExtraction.test.ts`
Expected: PASS（schema/分组/召回/解析已通；`runRagExtraction` 涉及 LLM，测试只覆盖纯函数）。

- [ ] **Step 5: 导出 `llmExtractor.ts` 复用件**

在 `llmExtractor.ts`：
- `export function getLlmSettings`（已是 export）。
- `const descriptions` 改为 `export const descriptions: Record<string, string>`。
- `async function callLLM` 改为 `export async function callLLM(...)`。
- `function estimateTokens` 改为 `export function estimateTokens`。
- 新增：
```ts
export function resolveApiKey(): { key: string; baseUrl?: string; model: string } {
  const rec = db.prepare('SELECT * FROM api_configs LIMIT 1').get() as any;
  if (!rec) throw new Error('No API keys configured');
  return { key: decrypt(rec.api_key), baseUrl: rec.base_url, model: rec.model };
}
```

- [ ] **Step 6: 运行后端全部测试确保未破坏**

Run: `cd backend && npx vitest run && npm run build`
Expected: 全部 PASS + `tsc` 编译通过。

- [ ] **Step 7: 在 `upload.ts` 接入 RAG 主链路**

`backend/src/routes/upload.ts`：
- `import { runRagExtraction } from '../services/ragExtraction.js';`
- 上传成功后、写 jobStore 前，调用 `const rag = await runRagExtraction(jobId, result);`，将 `rag` 写入 `result.extracts`（或新增 `result.rag` 字段，二选一；推荐写入 `result.extracts` 以便前端复用）。
- 保留 `?enhance=llm` 语义：若未启用 LLM 或无 key，`runRagExtraction` 内部 `resolveApiKey` 抛错 → 外层 try/catch 捕获并记录，返回的 `rag` 为空对象，不阻断上传（降级为仅解析）。为此把 RAG 调用放 try/catch 中。
- `refine` 路由语义改为（本次可保留现状，仅在未来迭代做二次强召；本任务不改 refine，标记为开放项）。

- [ ] **Step 8: 运行后端全部测试 + 构建**

Run: `cd backend && npx vitest run && npm run build`
Expected: PASS + 编译通过。

- [ ] **Step 9: 提交**

```bash
git add backend/src/services/ragExtraction.ts backend/src/services/ragExtraction.test.ts backend/src/services/llmExtractor.ts backend/src/routes/upload.ts
git commit -m "feat: RAG+LLM field extraction with provenance, wire into upload pipeline"
```

---

### Task 4: 前端溯源展示与预览定位

**Files:**
- Create: `frontend/src/components/ProvenanceBadge.vue`
- Create: `frontend/src/components/FieldValue.vue`
- Modify: `frontend/src/views/ProjectView.vue`

**Interfaces:**
- Consumes：后端 `FieldExtract`（`{value, score?, page, chapter, sourceText, paraIds}`）与 `result.extracts`。
- Produces：两个可复用组件；ProjectView 各标签页从新结构渲染。

- [ ] **Step 1: 确认当前 ProjectView 数据读取方式**

阅读 `frontend/src/views/ProjectView.vue` 与 `frontend/src/api/upload.ts`，确认 `result.extracts` 当前形状（标量字符串或数组），以及是否有 `DocxEditor` 预览组件可复用于位置定位。

- [ ] **Step 2: 编写 `ProvenanceBadge.vue` 溯源徽标**

`frontend/src/components/ProvenanceBadge.vue`：
```vue
<template>
  <el-tag v-if="hasProvenance" size="small" type="info" class="prov-badge" @click="expanded = !expanded">
    第{{ page }}页 · {{ chapter }}
    <el-icon><ArrowDown /></el-icon>
  </el-tag>
  <div v-if="expanded && sourceText" class="prov-source">{{ sourceText }}</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';

const props = defineProps<{
  page?: number | null;
  chapter?: string;
  sourceText?: string;
}>();
const expanded = ref(false);
const hasProvenance = computed(() => props.page != null || !!props.chapter);
</script>

<style scoped>
.prov-badge { cursor: pointer; margin-left: 8px; }
.prov-source { margin-top: 4px; color: #909399; font-size: 12px; }
</style>
```
（补齐 `computed` 的 `import { ref, computed } from 'vue';`。）

- [ ] **Step 3: 编写 `FieldValue.vue` 值 + 溯源组件**

`frontend/src/components/FieldValue.vue` 展示一个字段的 `value` 与 `ProvenanceBadge`，并根据 `value` 是否为数组/表格选择不同渲染。用 `type="text"` + 就近定位按钮（预留 `page` 参数传给预览，事件 `emit('locate', field)`）。

- [ ] **Step 4: 改造 `ProjectView.vue` 渲染**

将六个标签页的数据项从 `result.extracts[field]`（标量）改为读取 `{value, page, chapter, sourceText}`；用 `FieldValue` 替代原文本展示；保留原有分组/表格 tab 逻辑不变，仅适配取值路径。

- [ ] **Step 5: 运行前端构建与 lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: 编译通过 + lint 通过。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/ProvenanceBadge.vue frontend/src/components/FieldValue.vue frontend/src/views/ProjectView.vue
git commit -m "feat: show per-field provenance with preview locate in result view"
```

---

### Task 5: 端到端验证 + README + 收尾

**Files:**
- Test: `backend/uploads/test.docx`（现有样例）
- Modify: `README.md`

- [ ] **Step 1: 端到端冒烟**

Run: 启动后端 `cd backend && npm run dev`，`curl -F "file=@backend/uploads/test.docx" http://localhost:3000/api/upload`；确认响应含 `extracts`（新溯源结构）。若无样例可用，先用 Task 1 的 `go test` 覆盖解析路径。

- [ ] **Step 2: 更新 README 提取流程**

将 `README.md` 的"提取流程"一节从规则引擎描述改为：解析(Go) → 分块 → FTS5 BM25 召回 → LLM 抽取 → 带溯源 JSON。

- [ ] **Step 3: 全量回归**

Run: `cd backend && go test ./... && npx vitest run && npm run build`（前端 `cd frontend && npm run build`）
Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs: update extraction pipeline to LLM+RAG"
```

---

## 开放项（实现时决策）

- `chunkText` 超长块的表格归属：超长章节内的表格 markdown 未在逐段切分中分割，本计划将其并入最后一个子块或首个子块；实现时若遇真实超长章+表，需决定归属。
- `refine` 路由的"二次强召补抽"本次仅标记，未实现；后续迭代做。
- 前端 `FieldValue` 对衍生字段（`技术指标` 等对象/数组）的渲染细节，实现时按现有 tab 逻辑对拍。