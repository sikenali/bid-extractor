# 标书核心提取重构：LLM+RAG 设计

**日期**：2026-08-10
**状态**：已认可，待写实现计划

## 背景与目标

当前系统以 Go 规则引擎（160+ 正则/关键字，运行在 doc-handler）为主要字段抽取手段，LLM 仅作缺失字段补充（`llmExtractor.ts`，单次全文截断 + 单次抽补）。

本次重构将 **LLM+RAG 提升为主要提取路径**，规则应用移除，仅保留解析能力与字段 schema。

**新主链路**：

```
.docx
  → Go (unioffice) 纯解析：文本 + 表格Markdown + 元数据（章节/页/paraId/tableId）
  → TS 语义分块：按章节，超长再按段落/句切分
  → SQLite FTS5 BM25 索引（job 作用域，TTL 复用现有 1h）
  → 按 6 分类构造检索需求召回 top-k chunk
  → LLM 按组抽取：固定 schema，强制 JSON
  → 逐字段 { value, page, chapter, sourceText, paraIds } 溯源
  → 前端展示溯源 + 预览定位
```

## 决策记录

- **定位**：RAG+LLM 成为主要提取路径；规则应用移除，保留解析 + schema。
- **向量库**：嵌入式单机库（与现有 SQLite 自包含部署一致）。
- **嵌入**：本次先用关键词/BM25 检索（不做真嵌入）；检索器做成插件接口，后期可换 dense embedding。
- **Schema**：固定字段 + 逐字段溯源（沿用现有 6 分类 field_name / group_name / description）。
- **溯源范围**：后端 JSON 与前端 UI 均展示溯源，可点击进预览定位。
- **架构**：方案 A —— Node/TS 编排 + SQLite FTS5 BM25。

## 1. 解析输出（Go doc-handler 收窄）

改 `backend/doc-handler/main.go`：

- 移除规则应用代码：`applyRules`、`extractByKeyword`、`extractFromTables`、`extractFromTableCells`、`extractStructuredValue`、`findFieldParagraphs`、`scoreWithPriority`/`matchSpecificity` 的规则调用路径、`getCompiledRules`、`Priority` 常量（保留 `matchSpecificity` 仅当格式归一化需要，见 §3 —— 若无复用则一并移除）。
- `ParseRequest` 不再读 `rules`；`docProcessor.ts` 不再从库中取规则注入。
- 解析时产出元数据：
  - **段落流 `paragraphsMeta`**：每段 `{ text, paraId(全局自增), chapter(所属标题), level, page }`。
  - **表格 `tablesMeta`**：每个表 `{ tableId, markdown, page, chapter, rows }`（在既有 `DocTable` 基础上加 Markdown 渲染位置元数据）。
  - **章节语义块**：沿用现有 `isHeading`（level≤3）/ `isSectionStart`（一、二、三… 第一章…）闭合出 `Chapter`，作为分块边界。
- **扩展 `ParseResponse`**：新增 `paragraphsMeta`、`tablesMeta`，保留 `text` / `chapters` / `pageCount` / `paraToPage`（前端预览定位仍需要页信息）。

## 2. 分块 + FTS5 索引 + BM25 召回

新后端服务（`backend/src/services/retrieval.ts`），复用 `database.ts` 的 better-sqlite3：

- **语义块切割**：以章节为一个语义块；单块超过 `maxChunkChars`（默认 800–1200 字，可配）则按段落边界再切，段落仍超长按句号/分号切。每个 chunk：`{ chunkId, seq, chapter, pageStart, pageEnd, content, paraIds: [], tableIds: [] }`。
- **FTS5 索引**：建独立临时库（如 `data/retrieval_tmp.db`）或内存库，存 chunk 全文（BM25），行元数据列存 chapter / page / paraIds / tableIds。**job 作用域**，复用现有 jobStore TTL(1h) 清理，不污染主库。
- **Retriever 接口**：`Retriever`（keyword BM25 —— 后续 dense embedding 只需新增实现）。本次实现 `Ft5Retriever`。
- **召回策略**：按 6 分类触发——资质/资格(business)、评分标准(score)、废标条款(seal)、项目信息(info)、技术(tech)、商务(business)。对每个 field 需求构造 BM25 query，召回 top-k（默认 k=6），按相关度排序，拼接带元数据的召回上下文。

## 3. LLM 抽取 + 溯源

改造 `backend/src/services/llmExtractor.ts`：

- **Schema**：沿用 `extraction_rules`(enabled=1) 的 `field_name` / `group_name` / `description`；description 缺失时沿用现有 `descriptions` 映射表。仅作 schema，不再作为正则规则注入。
- **按需分组抽取**：按 group 分批送 LLM。每批 prompt = 分类描述 + 本组字段清单(field_name/中文描述/输出约束) + 召回上下文(带章节目录 + 每 chunk 原文 + 位置元数据) + JSON schema 示例。强制 `response_format: json_object`。
- **逐字段溯源**，返回结构：
  ```json
  {
    "info_bid_deadline": {
      "value": "2026-08-15 14:00",
      "score": 0.92,
      "page": 12,
      "chapter": "第二章 投标须知",
      "chunkId": "c_7",
      "sourceText": "……投标文件递交截止时间2026年8月15日14时……",
      "paraIds": [142]
    },
    "info_budget": null
  }
  ```
  LLM 从召回片段选取值并回填该片段位置元数据；未命中返回 `null`，由 `identifyMissingFields`/置信度逻辑决定是否二次强召（全字段 → 空/低置信字段二次扩展召回重抽）。
- **合并**：规则引擎已移除，无需 merge；RAG+LLM 结果即最终 `extracts`。可选后端格式归一化（金额/日期）。
- **复用现有**：队列并发控制（MAX_CONCURRENT=3）、token 估算、超时、`api_configs` 密钥解密与 provider/endpoint 映射。

## 4. 前端溯源展示

- 每个字段条目右侧展示来源：`第12页 · 第二章 投标须知`；点击展开 `sourceText` 原文片段；提供"在预览中定位"按钮（复用现有 DocxEditor 预览组件，传 page/chapter/paraId 定位）。
- `ProjectView.vue` 六个标签页数据源从 `result.extracts` 映射到新的 `{ value, provenance }` 结构；新增组件 `FieldValue.vue`、`ProvenanceBadge.vue`。

## 5. 接口 / 错误处理 / 测试

**接口（现有路由改动最小）**
- `POST /api/upload`：上传 → `parseDocument`(Go 解析，含元数据) → 新 `runRagExtraction(job)`(分块 → FTS 索引 → 按组召回 → LLM → 带溯源 JSON) → 结果入 jobStore。`status` 仍为 `parsed`。
- 配置：分块大小 `maxChunkChars`、召回 `topK`、`embeddingMode`(`'keyword' | 'dense'`) 写入 `llm_enhance_settings` 或新表 `rag_settings`。
- `POST /api/upload/:id/refine` 语义改为"对空/低置信字段做二次 RAG 强召补抽"。
- LLM 不可用/超时/无 key 时降级为"仅解析 + 关键词召回文本"（返回无 value 占位或错误，与现有一致）。

**错误处理**
- 解析失败：沿用现有 400 + 清理上传文件。
- LLM 失败：按 group 逐批抓错，已成功批次保留；退避沿用现有。
- FTS 索引/检索失败：捕获并回退为"按章节顺序取前三块"直送 LLM（RAG 挂掉仍出结果）。
- 溯源缺失降级：chunk 无位置时字段带 `page:null` / `chapter:''`，不阻断。

**测试**
- Go `go test`：断言解析输出的元数据（chapter/page/tableId）与语义块边界；移除规则代码后回归。
- 后端 `vitest`/node test：覆盖 `chunkText`（章节边界、超长切分）、`buildBm25Query`、`rowToChunk`、LLM 响应解析含溯源、降级路径。
- 端到端：上传 `backend/uploads/test.docx`（或 `data/` 示例）→ 断言输出含结构化 value + 溯源字段。

## 改动文件清单

- `backend/doc-handler/main.go`：收窄为解析 + 元数据（删规则，加 paragraphsMeta/tablesMeta/markdown）
- `backend/src/services/retrieval.ts`（新）：语义分块、FTS5 索引、`Retriever` 接口 + `Ft5Retriever`
- `backend/src/services/ragExtraction.ts`（新，或并入改造后 `llmExtractor.ts`）：按组召回、prompt 编排、带溯源 JSON 解析、降级
- `backend/src/services/llmExtractor.ts`：改造为 RAG 调用 + 二次强召补抽；保留队列/token/提供方映射
- `backend/src/services/docProcessor.ts`：`ParseResult` 扩展元数据结构
- `backend/src/routes/upload.ts`：接入 RAG 主链路与 rag_settings
- `backend/src/database.ts`：rag_settings 配置列/表、字段 schema 读取复用
- `frontend/src/...`：`FieldValue.vue`、`ProvenanceBadge.vue`、ProjectView 适配溯源展示与预览定位
- `README.md`：更新提取流程描述

## 里程碑

1. Go 解析收窄 + 元数据输出（含单测）
2. TS 分块 + FTS5 索引 + BM25 检索（含单测）
3. RAG+LLM 分字段抽取 + 溯源 JSON（含降级）
4. 前端溯源展示 + 预览定位
5. 端到端验证 + README

## 待定/开放项

- 后端是否复用 `matchSpecificity` 做金额/日期归一化（见 §1），实现计划阶段定。
- chunking 默认 `maxChunkChars`、召回 `topK` 精确值，实现阶段定并配置化。