# LLM 增强提取 — 设计文档

> 版本: 1.0
> 日期: 2026-07-20
> 状态: 设计中

---

## 1. 概述

在现有的正则/关键词/表格解析提取管道之上，增加一层 LLM 增强提取。LLM 仅作为补充，不替代现有规则引擎。目标字段是 Go doc-handler **未提取到**或**置信度低**的字段。

---

## 2. 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Vue 3)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Upload   │  │ Project  │  │ Settings │  │ Refine Btn  │ │
│  │ View     │  │ View     │  │ Page     │  │ (per job)   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       │             │             │                │        │
│       ▼             ▼             ▼                ▼        │
│  POST /upload   GET /:id       PUT /llm_enhance   POST     │
│  ?enhance=llm   /status        /llm_enabled       /:id/refine
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express + TS)                    │
│                                                              │
│  ┌──────────────┐    ┌──────────────────┐    ┌────────────┐ │
│  │ upload.ts    │    │ llmExtractor.ts  │    │ settings.ts│ │
│  │              │    │                  │    │            │ │
│  │ • POST /     │    │ • refineJob()    │    │ • GET/PUT  │ │
│  │ • query:     │    │ • buildPrompt()  │    │   /llm_    │ │
│  │   enhance=llm│    │ • callLLM()      │    │   enhance  │ │
│  │ • auto-trig  │    │ • parseResponse()│    │ • GET/PUT  │ │
│  │   LLM if     │    │ • mergeResults() │    │   /theme   │ │
│  │   enabled    │    │ • estimateTokens()│   │ • GET/PUT  │ │
│  └──────┬───────┘    │ • queueRequest() │    │   /export  │ │
│         │            └───────┬──────────┘    │ • GET/POST │ │
│         │                    │               │   /apikeys │ │
│         ▼                    ▼               └────────────┘ │
│  ┌──────────────┐    ┌──────────────────┐                    │
│  │ docProcessor │    │  jobStore (Map)  │                    │
│  │ .ts          │    │                  │                    │
│  │ • spawn      │    │ • jobId → {      │                    │
│  │   doc-handler│    │    filename,     │                    │
│  │ • return     │    │    result,       │                    │
│  │   ParseResult│    │    llmEnhanced,  │                    │
│  │              │    │    llmFields,    │                    │
│  │              │    │    createdAt }   │                    │
│  └──────┬───────┘    └──────────────────┘                    │
│         │                                                     │
│         ▼                                                     │
│  ┌──────────────────┐    ┌──────────────────────────────┐    │
│  │  doc-handler (Go) │    │  External LLM API (OpenAI/   │    │
│  │                   │    │  Alibaba/Qwen/Baidu/GLM)     │    │
│  │ • PDF/DOCX parse  │    │                              │    │
│  │ • regex extract   │    │ • streaming or non-streaming │    │
│  │ • keyword match   │    │ • JSON output mode           │    │
│  │ • table parsing   │    │                              │    │
│  └──────────────────┘    └──────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                 SQLite (data/bid-extractor.db)            ││
│  │  • extraction_rules  • api_configs  • theme_config       ││
│  │  • export_settings • correction_history • _migrations    ││
│  │  NEW: llm_enhance_settings (singleton row)               ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 数据模型变更

### 3.1 新增表: `llm_enhance_settings`

```sql
CREATE TABLE IF NOT EXISTS llm_enhance_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER DEFAULT 0,          -- 0=关闭, 1=开启
  provider TEXT DEFAULT 'qwen-turbo', -- 使用的 LLM provider
  max_doc_chars INTEGER DEFAULT 32000,-- 文档文本最大字符数
  timeout_seconds INTEGER DEFAULT 60, -- LLM 请求超时
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)
```

### 3.2 jobStore 扩展

```typescript
interface JobEntry {
  filename: string;
  size: number;
  result: ParseResult;          // 原始提取结果 (Go)
  llmEnhanced: boolean;         // 是否已做过 LLM 增强
  llmResults: Record<string, unknown>;  // LLM 补充的字段
  llmFields: Record<string, 'llm'>;       // 标记哪些字段来自 LLM
  createdAt: number;
}
```

---

## 4. API 端点规范

### 4.1 `POST /api/upload/:id/refine`

手动触发 LLM 增强。

**请求:** 无 body

**响应 (200):**
```json
{
  "success": true,
  "fieldsExtracted": 5,
  "totalFields": 120,
  "source": "llm"
}
```

**响应 (400):**
```json
{ "error": "Job not found" }
// 或
{ "error": "LLM enhancement not enabled" }
// 或
{ "error": "No API keys configured" }
```

**响应 (504):** LLM 超时 → 返回原始结果，标记 timeout

### 4.2 `GET /api/settings/llm_enhance`

获取 LLM 增强设置。

**响应 (200):**
```json
{
  "enabled": true,
  "provider": "qwen-turbo",
  "max_doc_chars": 32000,
  "timeout_seconds": 60
}
```

### 4.3 `PUT /api/settings/llm_enhance`

更新 LLM 增强设置。

**请求体:**
```json
{
  "enabled": true,
  "provider": "qwen-turbo",
  "max_doc_chars": 32000,
  "timeout_seconds": 60
}
```

### 4.4 `GET /api/settings/llm_status`

快速检查 LLM 功能是否可用（前端用于决定是否显示按钮）。

**响应 (200):**
```json
{
  "available": true,
  "enabled": true,
  "hasApiKey": true
}
```

---

## 5. 数据流 (Step by Step)

### 5.1 上传时自动触发 (`?enhance=llm`)

```
1. 前端 POST /upload?enhance=llm (或全局开关打开)
2. 后端 upload.ts 收到请求
3. 调用 parseDocument() → Go doc-handler 提取
4. 将 result 存入 jobStore
5. 检查 llm_enhance_settings.enabled == 1
6. 如果启用 → 调用 llmExtractor.refineJob(jobId, result)
7. refineJob():
   a. 识别缺失字段: extracts 中值为空/短文本的字段
   b. 读取 api_configs 获取 API key
   c. 构建 prompt (含文档文本 + 缺失字段列表)
   d. 调用 callLLM() 发送请求
   e. 解析 LLM 返回的 JSON
   f. 合并结果: mergeResults(originalExtracts, llmResults)
   g. 更新 jobStore: llmEnhanced=true, llmResults, llmFields
8. 返回包含 llmEnhanced 标记的完整结果
```

### 5.2 事后手动触发 (`POST /:id/refine`)

```
1. 前端点击「LLM 增强」按钮
2. 后端检查 jobStore 中是否存在该 job
3. 如果已增强过 → 返回 400 "Already enhanced"
4. 检查设置和 API key
5. 调用 llmExtractor.refineJob(jobId, result)
6. 同 5.1 步骤 6-8
```

### 5.3 前端展示

```
1. ProjectView 从 /:id/status 获取结果
2. 结果中包含 llmFields: { "field_name": "llm" }
3. 渲染表格时:
   - 如果 field 在 llmFields 中 → 显示 "LLM" 徽章
   - 徽章样式: 小标签，蓝色背景，圆角
4. 如果 llmEnhanced == true → 顶部显示提示条
   "此文档已通过 LLM 增强提取，XX 个字段由 AI 补充"
```

---

## 6. Prompt 设计

### 6.1 System Prompt

```
你是一个专业的中文招标文件信息提取助手。你的任务是从招标文件中提取特定字段的信息。
请严格按照以下要求提取信息，保持原文表述，不要编造或推断不存在的内容。
如果某个字段在文档中找不到对应信息，请将该字段的值设为 null。
```

### 6.2 User Prompt (模板)

```
请从以下招标文件文本中提取以下字段的信息：

【待提取字段】
{fields_list}

【文档全文】
{document_text}

请以 JSON 格式返回提取结果，键名为字段名，值为提取到的原文内容。如果某字段无法提取，值为 null。

示例输出格式：
{
  "info_bid_deadline": "2026年8月15日14:00",
  "info_budget": null,
  ...
}
```

### 6.3 字段列表格式

```
1. info_bid_deadline (投标截止时间): 投标或递交文件的截止日期和时间
2. info_budget (预算金额): 项目的预算或最高限价金额
3. info_project_name (项目名称): 本次招标/采购的项目名称
...
```

只列出缺失或低置信度的字段（通常 10-30 个，不是全部 120+ 个）。

---

## 7. Token 管理与长文档策略

### 7.1 Token 估算

```typescript
// 保守估算: 中文字符 ≈ 1.5 tokens, 英文字符 ≈ 0.25 tokens
function estimateTokens(text: string): number {
  const cnChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - cnChars;
  return Math.ceil(cnChars * 1.5 + otherChars * 0.25);
}
```

### 7.2 分层策略

| 场景 | 策略 |
|------|------|
| 文档 < 16KB | 发送全文 |
| 16KB ~ 32KB | 发送全文 |
| 32KB ~ 64KB | 截取前 32KB + 关键章节(摘要、资格要求、评分标准) |
| > 64KB | 只提取缺失字段，发送文档摘要 + 缺失字段列表 |

### 7.3 关键章节提取

对于超长文档，优先提取以下章节的文本:
- 招标公告/项目概况
- 投标人资格要求
- 招标范围
- 合同条款
- 评分标准
- 投标文件递交要求

---

## 8. 错误处理策略

### 8.1 超时

- LLM 请求超过 `timeout_seconds` → 捕获超时
- 记录日志: `[LLM] Timeout for job {id}`
- 返回原始结果，`llmEnhanced` 保持 `false`
- 前端不显示 LLM 徽章

### 8.2 解析失败

- LLM 返回非 JSON 或 JSON 格式错误 → 捕获并解析
- 尝试从混乱文本中提取 JSON 块
- 如果仍失败 → 记录日志，回退到原始结果

### 8.3 API Key 缺失

- 查询 `api_configs` 为空 → 前端不显示「LLM 增强」按钮
- 后端拒绝请求，返回 400

### 8.4 速率限制

- 检测到 429 状态码 → 指数退避重试 (1s, 4s, 16s)
- 最多重试 2 次
- 仍失败 → 记录日志，回退到原始结果

### 8.5 并发控制

- 使用简单队列: 最多同时处理 3 个 LLM 请求
- 超出时排队等待
- 队列满时返回 503 "LLM service busy"

---

## 9. 前端变更

### 9.1 Settings 页面新增 LLM 增强开关

在 `ApiKeySettingsView.vue` 底部添加新区域:

```vue
<section class="llm-enhance-section">
  <h3>LLM 增强提取</h3>
  <p class="section-desc">启用后，上传文档时将自动使用 LLM 补充缺失的提取字段</p>
  <div class="setting-row">
    <label>
      <input type="checkbox" v-model="enabled" />
      启用 LLM 增强提取
    </label>
  </div>
  <div class="setting-row" v-if="enabled">
    <label>文档最大字符数</label>
    <input type="number" v-model.number="maxDocChars" min="8000" max="64000" step="4000" />
  </div>
  <div class="setting-row" v-if="enabled">
    <label>超时时间 (秒)</label>
    <input type="number" v-model.number="timeoutSeconds" min="15" max="120" step="15" />
  </div>
</section>
```

### 9.2 ProjectView 增强

1. 在提取结果表格上方显示 LLM 增强提示条:
```vue
<div v-if="llmEnhanced" class="llm-badge-banner">
  <span class="icon ri-brain-line"></span>
  已启用 LLM 增强 · {{ llmFieldsCount }} 个字段由 AI 补充
</div>
```

2. 在每行表格中，如果字段来自 LLM，在字段名旁显示徽章:
```vue
<td class="col-field">
  {{ row.field }}
  <span v-if="row.source === 'llm'" class="llm-source-badge">LLM</span>
</td>
```

### 9.3 手动增强按钮

在顶部操作栏添加按钮:
```vue
<button v-if="!llmEnhanced && llmAvailable" @click="triggerRefine">
  <span class="icon ri-brain-line"></span>
  LLM 增强
</button>
```

### 9.4 API Client 新增方法

```typescript
// frontend/src/api/upload.ts
export async function refineJob(id: string): Promise<{
  success: boolean;
  fieldsExtracted: number;
  totalFields: number;
}> {
  const response = await apiClient.post(`/upload/${id}/refine`);
  return response.data;
}

// frontend/src/api/settings.ts
export async function getLlmEnhanceSettings(): Promise<LlmSettings> { ... }
export async function setLlmEnhanceSettings(settings: Partial<LlmSettings>): Promise<void> { ... }
export async function getLlmStatus(): Promise<{ available: boolean; enabled: boolean; hasApiKey: boolean }> { ... }
```

---

## 10. 成本估算

### 10.1 假设

- 平均文档: 20KB 文本 ≈ 30,000 tokens (含系统 prompt)
- 输出: ≈ 500 tokens
- 使用 qwen-turbo: ¥0.003/1K input tokens, ¥0.002/1K output tokens

### 10.2 单次文档成本

```
输入: 30,000 × ¥0.003/1000 = ¥0.09
输出:   500 × ¥0.002/1000 = ¥0.001
合计:  ≈ ¥0.09/篇
```

### 10.3 月度估算

```
100 篇/天 × 30 天 × ¥0.09 = ¥270/月
500 篇/天 × 30 天 × ¥0.09 = ¥1,350/月
```

如果使用更贵的模型 (GPT-4o, Claude):
```
GPT-4o: $2.50/1M input, $10/1M output
单次 ≈ $0.08-0.15
100 篇/天 × 30 天 × $0.12 = $360/月
```

### 10.4 优化建议

- 默认使用 qwen-turbo 或类似低成本模型
- 只对缺失字段调用 LLM (而非全部字段)，减少 70-80% token 用量
- 长文档只提取关键章节，进一步降低 token 消耗

---

## 11. 实现文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `backend/src/database.ts` | 修改 | 新增 `llm_enhance_settings` 表初始化 |
| `backend/src/services/llmExtractor.ts` | 新建 | LLM 提取核心逻辑 |
| `backend/src/routes/upload.ts` | 修改 | 新增 `POST /:id/refine` 端点 + `?enhance=llm` 自动触发 |
| `backend/src/routes/settings.ts` | 修改 | 新增 LLM 增强设置 CRUD 端点 |
| `frontend/src/api/settings.ts` | 修改 | 新增 LLM 设置 API 方法 |
| `frontend/src/api/upload.ts` | 修改 | 新增 `refineJob()` 方法 |
| `frontend/src/views/settings/ApiKeySettingsView.vue` | 修改 | 新增 LLM 增强设置区域 |
| `frontend/src/views/ProjectView.vue` | 修改 | 新增 LLM 徽章 + 增强按钮 |

---

## 12. 安全注意事项

1. **API Key 存储**: 已有加密机制 (`encrypt()`/`decrypt()`)，复用
2. **Rate Limiting**: 在 LLM 调用层做并发限制，防止滥用
3. **Input Sanitization**: 文档文本直接传给 LLM API，但已存储在服务端，不暴露给用户
4. **Timeout**: 所有 LLM 调用必须有超时保护 (默认 60s)
5. **Fallback**: 所有 LLM 错误都必须优雅降级到原始结果，不能影响主流程
