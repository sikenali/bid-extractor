# 提取流程优化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现四阶段提取流水线（文档解析增强 → 规则抽取 → LLM 按需增强 → 合并校验），提升字段提取准确率并降低规则维护成本。

**架构：** 后端 `docProcessor.ts` 改造为四阶段流水线，前端 `ProfileSettingsView` 改造为 4 Tab 布局，新增 LLM 增强配置 API。

**技术栈：** TypeScript, Express, better-sqlite3, Vue 3, officeparser

---

## 文件结构

### 后端修改
- `backend/src/database.ts` — 数据库迁移（新增字段）
- `backend/src/services/docProcessor.ts` — 核心提取逻辑改造
- `backend/src/routes/settings.ts` — 新增 LLM 增强配置 API
- `backend/src/routes/upload.ts` — JobEntry 增加 progress 字段

### 前端修改
- `frontend/src/views/settings/ProfileSettingsView.vue` — 4 Tab 改造
- `frontend/src/views/UploadView.vue` — StepStrip 步骤文字优化
- `frontend/src/api/llm.ts` — 新增 LLM 增强配置 API 调用

---

## 任务分解

### 任务 1：数据库迁移 — 新增配置字段

**文件：**
- 修改：`backend/src/database.ts`

- [ ] **步骤 1：修改 profile_settings 表结构**

```typescript
// 在 initializeDatabase() 函数末尾添加
if (!tableExists('profile_settings')) {
  db.exec(`CREATE TABLE profile_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    auto_redirect_after_extract INTEGER DEFAULT 1,
    default_skill_id TEXT DEFAULT '',
    extract_preview_mode TEXT DEFAULT 'list'
  )`);
} else {
  // 新增 LLM 增强配置字段
  const cols = db.prepare(`PRAGMA table_info(profile_settings)`).all() as any[];
  if (!cols.some(c => c.name === 'llm_enhance_enabled')) {
    db.exec(`ALTER TABLE profile_settings ADD COLUMN llm_enhance_enabled INTEGER DEFAULT 1`);
  }
  if (!cols.some(c => c.name === 'llm_hit_rate_threshold')) {
    db.exec(`ALTER TABLE profile_settings ADD COLUMN llm_hit_rate_threshold REAL DEFAULT 0.6`);
  }
  if (!cols.some(c => c.name === 'llm_model_id')) {
    db.exec(`ALTER TABLE profile_settings ADD COLUMN llm_model_id TEXT DEFAULT ''`);
  }
}
```

- [ ] **步骤 2：修改 llm_prompt_templates 表结构**

```typescript
// 在 initializeDatabase() 函数中，llm_prompt_templates 表创建后添加
if (tableExists('llm_prompt_templates')) {
  const cols = db.prepare(`PRAGMA table_info(llm_prompt_templates)`).all() as any[];
  if (!cols.some(c => c.name === 'field_schema')) {
    db.exec(`ALTER TABLE llm_prompt_templates ADD COLUMN field_schema TEXT DEFAULT '[]'`);
  }
}
```

- [ ] **步骤 3：运行迁移验证**

运行：`cd backend && npx ts-node -e "const { initializeDatabase } = require('./src/database'); initializeDatabase(); console.log('Migration OK')"`

预期：输出 "Migration OK"

- [ ] **步骤 4：Commit**

```bash
git add backend/src/database.ts
git commit -m "feat(db): add LLM enhance config fields to profile_settings and field_schema to llm_prompt_templates"
```

---

### 任务 2：文档解析增强 — chapterPath 支持

**文件：**
- 修改：`backend/src/services/docProcessor.ts`

- [ ] **步骤 1：扩展 FlatParagraph 接口**

在 `docProcessor.ts` 中找到 `FlatParagraph` 接口定义，修改为：

```typescript
interface FlatParagraph {
  text: string;
  chapter: string;
  level: number;
  chapterPath: string[];  // 新增：完整章节路径
  tableIndex?: number;
}
```

- [ ] **步骤 2：修改 flattenContent 函数**

```typescript
function flattenContent(nodes: any[]): FlatParagraph[] {
  const out: FlatParagraph[] = [];
  let chapterStack: string[] = [];  // 章节路径栈
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
          level
        });
      } else if (n.type === 'paragraph') {
        const t = nodeText(n).trim();
        if (t) out.push({
          text: t,
          chapter: chapterStack[chapterStack.length - 1] || '',
          chapterPath: [...chapterStack],
          level: 0
        });
      } else if (n.type === 'table') {
        out.push({ text: '', chapter: chapterStack[chapterStack.length - 1] || '', chapterPath: [...chapterStack], level: -1, tableIndex: tableCount++ });
      } else if (n.children && n.children.length) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}
```

- [ ] **步骤 3：扩展 Chapter 接口**

```typescript
interface Chapter {
  title: string;
  content: string[];
  page: number;
  path?: string[];  // 新增：章节路径
}
```

- [ ] **步骤 4：修改 buildChapters 函数**

```typescript
function buildChapters(paras: FlatParagraph[], paraToPage: number[]): Chapter[] {
  const chapters: Chapter[] = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.level === -1) continue; // 表格占位符不参与章节划分
    if (p.level > 0) {
      chapters.push({
        title: p.text,
        content: [],
        page: i < paraToPage.length ? paraToPage[i] : 1,
        path: p.chapterPath  // 新增：存储完整路径
      });
    } else if (chapters.length > 0) {
      chapters[chapters.length - 1].content.push(p.text);
    }
  }
  return chapters;
}
```

- [ ] **步骤 5：添加新的 classifyChapter 函数**

```typescript
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
```

- [ ] **步骤 6：修改 buildParagraphsMeta 函数**

确保 `ParagraphMeta` 包含 `chapterPath` 字段：

```typescript
export interface ParagraphMeta {
  text: string;
  paraId: number;
  chapter: string;
  chapterPath: string[];  // 新增
  level: number;
  page: number;
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
```

- [ ] **步骤 7：运行测试验证**

运行：`cd backend && npm run build`

预期：编译成功，无类型错误

- [ ] **步骤 8：Commit**

```bash
git add backend/src/services/docProcessor.ts
git commit -m "feat(parse): add chapterPath tracking for improved chapter classification"
```

---

### 任务 3：置信度打分体系

**文件：**
- 修改：`backend/src/services/docProcessor.ts`

- [ ] **步骤 1：扩展 FieldExtract 接口**

```typescript
export interface FieldExtract {
  value: string | null;
  page: number | null;
  chapter: string;
  group: string;
  sourceText?: string;
  paraIds: number[];
  score?: number;
  confidence?: number;  // 新增：0-10
  source?: 'regex' | 'keyword' | 'llm' | 'title_fallback';  // 新增
}
```

- [ ] **步骤 2：添加 calculateConfidence 函数**

```typescript
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
```

- [ ] **步骤 3：修改 extractFromUnit 返回类型**

```typescript
function extractFromUnit(
  unit: SearchUnit,
  units: SearchUnit[],
  idx: number,
  grids: Map<string, string[][]>,
  rule: FieldRule,
  nameRe: RegExp | null,
): { value: string; paraId: number; sourceText: string; score: number; confidence: number; source: string } | null {
  // ... 现有逻辑，在返回时添加 confidence 和 source
}
```

- [ ] **步骤 4：修改 applyRuleExtraction 函数**

在提取结果中设置 `confidence` 和 `source` 字段：

```typescript
// 在 bestByKey 赋值时添加
bestByKey[key] = {
  ...best,
  group: rule.group,
  fromAlias: isAlias(rule),
  confidence: hit.confidence,
  source: hit.source,
};
```

- [ ] **步骤 5：运行测试验证**

运行：`cd backend && npm run build`

预期：编译成功

- [ ] **步骤 6：Commit**

```bash
git add backend/src/services/docProcessor.ts
git commit -m "feat(extract): add confidence scoring system to field extraction"
```

---

### 任务 4：命中率阈值控制

**文件：**
- 修改：`backend/src/services/docProcessor.ts`

- [ ] **步骤 1：添加 shouldCallLlm 函数**

```typescript
function shouldCallLlm(
  extracts: Record<string, FieldExtract>,
  threshold = 0.6
): string[] {
  const byGroup: Record<string, FieldExtract[]> = {};
  for (const [field, extract] of Object.entries(extracts)) {
    if (!byGroup[extract.group]) byGroup[extract.group] = [];
    byGroup[extract.group].push(extract);
  }
  const lowHitGroups: string[] = [];
  for (const [group, fields] of Object.entries(byGroup)) {
    const hitCount = fields.filter(f => f.value).length;
    const hitRate = fields.length > 0 ? hitCount / fields.length : 1;
    if (hitRate < threshold) {
      lowHitGroups.push(group);
    }
  }
  return lowHitGroups;
}
```

- [ ] **步骤 2：修改 parseDocument 函数**

在 LLM 增强部分添加阈值判断：

```typescript
// 在 parseDocument 中，LLM 增强部分
if (options?.skillId) {
  const skill = db.prepare(
    'SELECT * FROM tender_llm_skill WHERE id = ? AND enable = 1'
  ).get(options.skillId) as any;
  
  const llmSettings = db.prepare(
    'SELECT llm_enhance_enabled, llm_hit_rate_threshold, llm_model_id FROM profile_settings WHERE id = 1'
  ).get() as any;
  
  const llmEnabled = llmSettings?.llm_enhance_enabled !== 0;
  const threshold = llmSettings?.llm_hit_rate_threshold || 0.6;
  
  if (llmEnabled && skill && skill.enable_llm && hasPrompt) {
    try {
      const lowHitGroups = shouldCallLlm(extracts, threshold);
      if (lowHitGroups.length > 0) {
        llmResult = await runLLMExtraction(skill, flatParas, chapters, extracts, lowHitGroups);
        const merged = mergeLLMResult(extracts, groups, fieldGroups, llmResult, skill.biz_type || 'info');
        if (merged > 0) extractMode = 'llm_enhanced';
      }
    } catch (llmErr) {
      console.error('[docProcessor] LLM extraction failed, falling back to rule-only:', llmErr);
      extractMode = 'rule_only';
    }
  }
}
```

- [ ] **步骤 3：运行测试验证**

运行：`cd backend && npm run build`

预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add backend/src/services/docProcessor.ts
git commit -m "feat(extract): add hit rate threshold control for LLM enhancement"
```

---

### 任务 5：LLM Prompt 抽取增强

**文件：**
- 修改：`backend/src/services/docProcessor.ts`

- [ ] **步骤 1：添加字段 Schema 相关函数**

```typescript
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
```

- [ ] **步骤 2：添加 Few-shot 示例函数**

```typescript
function buildFewShotExamples(correctionHistory: any[], bizType: string): string {
  const recent = correctionHistory
    .filter(c => c.groupName === bizType)
    .slice(-3);
  if (recent.length === 0) return '';
  return `\n示例：\n${recent.map(c =>
    `原文: ${c.paragraphText}\n正确值: ${c.correctedValue}`
  ).join('\n')}`;
}

function getCorrectionHistory(db: any, bizType: string) {
  try {
    return db.prepare(
      'SELECT * FROM correction_history WHERE group_name = ? ORDER BY created_at DESC LIMIT 10'
    ).all(bizType);
  } catch {
    return [];
  }
}
```

- [ ] **步骤 3：改进 extractJSONFromResponse 函数**

```typescript
function extractJSONFromResponse(text: string): string | null {
  // 1. 尝试从 ```json 代码块提取
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1];
  
  // 2. 尝试提取第一个 { 到最后一个 }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  
  // 3. 尝试提取数组
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) return arrMatch[0];
  
  return null;
}
```

- [ ] **步骤 4：修改 runLLMExtraction 函数**

```typescript
async function runLLMExtraction(
  skill: LLMSkillRow,
  paras: FlatParagraph[],
  chapters: Chapter[],
  ruleResult: Record<string, FieldExtract>,
  lowHitGroups: string[],
): Promise<Record<string, string>> {
  // 1. 按分类分组段落
  const chunksByType: Record<string, string> = {};
  for (const p of paras) {
    const type = classifyChapterByPath(p.chapterPath);
    if (!chunksByType[type]) chunksByType[type] = '';
    chunksByType[type] += p.text + '\n';
  }
  
  // 2. 构建字段 Schema
  const rules = loadFieldRules();
  const fieldSchema = buildFieldSchema(rules.filter(r =>
    lowHitGroups.includes(r.group)
  ));
  
  // 3. 加载纠错历史作为 Few-shot 示例
  let fewShot = '';
  if (lowHitGroups.length > 0) {
    const correctionHistory = getCorrectionHistory(db, lowHitGroups[0]);
    fewShot = buildFewShotExamples(correctionHistory, lowHitGroups[0]);
  }
  
  // 4. 对每个低命中率分类调用 LLM
  const allResults: Record<string, string> = {};
  for (const group of lowHitGroups) {
    const chunkText = chunksByType[group] || '';
    if (!chunkText) continue;
    
    const prompt = skill.prompt_template
      .replace('{{fieldSchemaList}}', renderFieldSchemaList(fieldSchema))
      .replace('{{preExtract}}', JSON.stringify(ruleResult))
      .replace('{{fewShot}}', fewShot)
      .replace('{{chunkText}}', chunkText.slice(0, 3000));
    
    const apiConfig = skill.llm_api_config_id
      ? db.prepare('SELECT * FROM api_configs WHERE id = ? AND enabled = 1').get(skill.llm_api_config_id)
      : null;
    
    if (!apiConfig) continue;
    
    try {
      const raw = await callLLM(apiConfig, prompt, skill.temperature, skill.top_p, skill.max_tokens);
      const jsonStr = extractJSONFromResponse(raw);
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        Object.assign(allResults, parsed);
      }
    } catch (e) {
      console.error(`[docProcessor] LLM call failed for chunk ${group}:`, e);
    }
  }
  
  return allResults;
}
```

- [ ] **步骤 5：运行测试验证**

运行：`cd backend && npm run build`

预期：编译成功

- [ ] **步骤 6：Commit**

```bash
git add backend/src/services/docProcessor.ts
git commit -m "feat(llm): add field schema, few-shot examples, and improved JSON extraction"
```

---

### 任务 6：LLM 合并策略

**文件：**
- 修改：`backend/src/services/docProcessor.ts`

- [ ] **步骤 1：添加 mergeWithConfidence 函数**

```typescript
function mergeWithConfidence(
  ruleExtracts: Record<string, FieldExtract>,
  llmExtracts: Record<string, string>,
): Record<string, FieldExtract> {
  for (const [field, llmValue] of Object.entries(llmExtracts)) {
    if (!llmValue) continue;
    
    const ruleExtract = ruleExtracts[field];
    
    // 规则置信度 >= 7 时，LLM 不覆盖
    if (ruleExtract && (ruleExtract.confidence ?? 0) >= 7) {
      ruleExtract.sourceText = (ruleExtract.sourceText || '') + ' | LLM确认';
      continue;
    }
    
    // 规则置信度 < 5 且 LLM 有值时，LLM 覆盖
    if (!ruleExtract || (ruleExtract.confidence ?? 5) < 5) {
      ruleExtracts[field] = {
        value: llmValue,
        confidence: 7,
        source: 'llm',
        page: ruleExtract?.page ?? null,
        chapter: ruleExtract?.chapter || 'LLM',
        group: ruleExtract?.group || '',
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
```

- [ ] **步骤 2：修改 parseDocument 使用 mergeWithConfidence**

```typescript
// 替换原来的 mergeLLMResult 调用
if (merged > 0) {
  extracts = mergeWithConfidence(extracts, llmResult);
  extractMode = 'llm_enhanced';
}
```

- [ ] **步骤 3：运行测试验证**

运行：`cd backend && npm run build`

预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add backend/src/services/docProcessor.ts
git commit -m "feat(merge): add confidence-based merge strategy for LLM results"
```

---

### 任务 7：LLM 增强配置 API

**文件：**
- 修改：`backend/src/routes/settings.ts`

- [ ] **步骤 1：添加 LLM 增强配置路由**

```typescript
// GET /api/settings/llm-enhance
router.get('/llm-enhance', (req, res) => {
  const row = db.prepare(
    'SELECT llm_enhance_enabled, llm_hit_rate_threshold, llm_model_id FROM profile_settings WHERE id = 1'
  ).get() as any;
  
  res.json({
    enabled: (row?.llm_enhance_enabled ?? 1) === 1,
    hitRateThreshold: row?.llm_hit_rate_threshold ?? 0.6,
    modelId: row?.llm_model_id ?? '',
  });
});

// PUT /api/settings/llm-enhance
router.put('/llm-enhance', (req, res) => {
  const { enabled, hitRateThreshold, modelId } = req.body;
  
  db.prepare(`UPDATE profile_settings SET 
    llm_enhance_enabled = ?, 
    llm_hit_rate_threshold = ?, 
    llm_model_id = ? 
    WHERE id = 1`).run(
    enabled ? 1 : 0,
    hitRateThreshold || 0.6,
    modelId || ''
  );
  
  res.json({ success: true });
});
```

- [ ] **步骤 2：运行测试验证**

运行：`cd backend && npm run build`

预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add backend/src/routes/settings.ts
git commit -m "feat(api): add LLM enhance config endpoints"
```

---

### 任务 8：JobEntry 进度字段

**文件：**
- 修改：`backend/src/routes/upload.ts`

- [ ] **步骤 1：修改 JobEntry 接口**

```typescript
interface JobEntry {
  filename: string;
  size: number;
  result: ExtractOutput;
  createdAt: number;
  skillId?: string;
  progress: number;        // 新增：当前阶段 0-3
  progressText: string;    // 新增：阶段描述
}
```

- [ ] **步骤 2：修改 jobStore 初始化**

```typescript
jobStore.set(jobId, {
  filename: originalName,
  size: req.file.size,
  result,
  createdAt: Date.now(),
  skillId,
  progress: 3,  // 完成状态
  progressText: '已完成',
});
```

- [ ] **步骤 3：修改状态查询接口**

```typescript
router.get('/:id/status', (req, res) => {
  const job = jobStore.get(req.params.id);
  // ...
  if (job) {
    res.json({
      id: req.params.id,
      status: 'parsed',
      progress: 100,
      filename: job.filename,
      fileSize: fileStat?.size || job.size,
      result: job.result,
      progressStage: job.progress,  // 新增
      progressText: job.progressText,  // 新增
    });
    return;
  }
  // ...
});
```

- [ ] **步骤 4：运行测试验证**

运行：`cd backend && npm run build`

预期：编译成功

- [ ] **步骤 5：Commit**

```bash
git add backend/src/routes/upload.ts
git commit -m "feat(upload): add progress tracking to job entries"
```

---

### 任务 9：前端 LLM 增强配置 API

**文件：**
- 修改：`frontend/src/api/llm.ts`

- [ ] **步骤 1：添加 LLM 增强配置 API**

```typescript
export interface LlmEnhanceConfig {
  enabled: boolean;
  hitRateThreshold: number;
  modelId: string;
}

export async function getLlmEnhanceConfig(): Promise<LlmEnhanceConfig> {
  const response = await apiClient.get<LlmEnhanceConfig>('/settings/llm-enhance');
  return response.data;
}

export async function updateLlmEnhanceConfig(config: Partial<LlmEnhanceConfig>): Promise<void> {
  await apiClient.put('/settings/llm-enhance', config);
}
```

- [ ] **步骤 2：运行测试验证**

运行：`cd frontend && npm run build`

预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add frontend/src/api/llm.ts
git commit -m "feat(api): add LLM enhance config API client"
```

---

### 任务 10：ProfileSettingsView 改造

**文件：**
- 修改：`frontend/src/views/settings/ProfileSettingsView.vue`

- [ ] **步骤 1：修改 Tab 定义**

```typescript
const mainTab = ref<'profile' | 'llm' | 'prompts' | 'rules'>('profile');

const TABS = [
  { key: 'profile' as const, label: '通用', icon: 'ri-settings-4-line' },
  { key: 'llm' as const, label: '智能增强', icon: 'ri-brain-line' },
  { key: 'prompts' as const, label: '提示词模板', icon: 'ri-chat-3-line' },
  { key: 'rules' as const, label: '规则管理', icon: 'ri-list-settings-line' },
];
```

- [ ] **步骤 2：添加 LLM 增强配置状态**

```typescript
// LLM 增强配置
const llmEnhanceConfig = ref({
  enabled: true,
  hitRateThreshold: 0.6,
  modelId: '',
});

async function loadLlmEnhanceConfig() {
  try {
    llmEnhanceConfig.value = await getLlmEnhanceConfig();
  } catch {
    // 使用默认值
  }
}

async function saveLlmEnhanceConfig() {
  try {
    await updateLlmEnhanceConfig(llmEnhanceConfig.value);
    ElMessage.success('配置已保存');
  } catch {
    ElMessage.error('保存失败');
  }
}
```

- [ ] **步骤 3：添加模型配置列表加载**

```typescript
// 模型配置列表
const apiConfigs = ref<Array<{ id: string; provider: string; model: string; base_url?: string }>>([]);

async function loadApiConfigs() {
  try {
    apiConfigs.value = await getLlmApiConfigs();
  } catch {
    // 使用空数组
  }
}
```

- [ ] **步骤 4：修改 Tab 1 模板**

在 Tab 1 中添加原有通用设置内容（界面密度、行为偏好等），保持原有功能。

- [ ] **步骤 5：修改 Tab 2 模板（智能增强）**

```vue
<template v-else-if="mainTab==='llm'">
  <!-- LLM 增强配置区 -->
  <div class="llm-config-card">
    <div class="config-header">
      <span class="config-title">LLM 智能增强</span>
      <UiSwitch :model-value="llmEnhanceConfig.enabled" @update:model-value="saveLlmEnhanceConfig" />
    </div>
    <div class="config-body" v-if="llmEnhanceConfig.enabled">
      <div class="config-row">
        <span class="config-label">命中率阈值</span>
        <div class="threshold-control">
          <input type="range" min="0" max="100" step="10" 
                 :value="llmEnhanceConfig.hitRateThreshold * 100"
                 @input="llmEnhanceConfig.hitRateThreshold = $event.target.value / 100" />
          <span class="threshold-value">{{ Math.round(llmEnhanceConfig.hitRateThreshold * 100) }}%</span>
        </div>
      </div>
      <div class="config-row">
        <span class="config-label">模型配置</span>
        <UiSelect v-model="llmEnhanceConfig.modelId" :options="modelOptions" size="sm" />
      </div>
    </div>
  </div>
  
  <!-- 技能列表 -->
  <div class="skill-section">
    <!-- ... 原有技能列表内容 ... -->
  </div>
</template>
```

- [ ] **步骤 6：添加模型选项计算属性**

```typescript
const modelOptions = computed(() => [
  { value: '', label: '使用技能配置' },
  ...apiConfigs.value.map(c => ({
    value: c.id,
    label: `${c.provider} - ${c.model}`,
  })),
]);
```

- [ ] **步骤 7：修改 onMounted 加载数据**

```typescript
onMounted(() => {
  loadLlmEnhanceConfig();
  loadApiConfigs();
  loadLlmSkills();
  loadTemplates();
});
```

- [ ] **步骤 8：添加样式**

```css
.llm-config-card {
  background: var(--color-bg-white, #fff);
  border: 0.7px solid var(--color-border-soft, #EDE9E0);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.config-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, #1F1D1A);
}

.config-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.config-label {
  font-size: 14px;
  color: var(--color-text-body, #3A3A3A);
}

.threshold-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.threshold-control input[type="range"] {
  width: 160px;
}

.threshold-value {
  font-size: 14px;
  color: var(--color-primary, #C0392B);
  font-weight: 500;
  min-width: 40px;
  text-align: right;
}
```

- [ ] **步骤 9：运行测试验证**

运行：`cd frontend && npm run build`

预期：编译成功

- [ ] **步骤 10：Commit**

```bash
git add frontend/src/views/settings/ProfileSettingsView.vue
git commit -m "feat(profile): redesign settings view with 4 tabs and LLM enhance config"
```

---

### 任务 11：StepStrip 步骤文字优化

**文件：**
- 修改：`frontend/src/views/UploadView.vue`

- [ ] **步骤 1：修改步骤定义**

在 UploadView.vue 中找到步骤定义，修改为：

```typescript
const steps = [
  { key: 0, label: '文档解析' },
  { key: 1, label: '规则抽取' },
  { key: 2, label: '智能增强' },
];
```

- [ ] **步骤 2：修改轮询逻辑读取 progressStage**

```typescript
const pollJob = async (jobId: string) => {
  const res = await apiClient.get(`/upload/${jobId}/status`);
  const data = res.data;
  loadingProgress.value = data.progressStage ?? -1;
  if (data.status === 'parsed') {
    loading.value = false;
    currentResult.value = data.result;
  }
};
```

- [ ] **步骤 3：运行测试验证**

运行：`cd frontend && npm run build`

预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add frontend/src/views/UploadView.vue
git commit -m "feat(upload): optimize step strip labels for better user understanding"
```

---

## 自检清单

### 规格覆盖度检查

| 规格章节 | 对应任务 | 状态 |
|----------|----------|------|
| §2 文档解析增强 | 任务 2 | ✅ |
| §3 规则优先兜底 | 任务 3, 4 | ✅ |
| §4 LLM Prompt 抽取 | 任务 5 | ✅ |
| §5 LLM 语义增强 | 任务 6 | ✅ |
| §7 数据库变更 | 任务 1 | ✅ |
| §10 个性设置改造 | 任务 10 | ✅ |
| §11 步骤条优化 | 任务 11 | ✅ |
| §12 配置项 | 任务 1, 7, 9 | ✅ |

### 类型一致性检查

- `FieldExtract.confidence` - 在任务 3 定义，任务 4, 6 使用 ✅
- `FieldExtract.source` - 在任务 3 定义，任务 6 使用 ✅
- `FlatParagraph.chapterPath` - 在任务 2 定义，任务 2 使用 ✅
- `LlmEnhanceConfig` - 在任务 9 定义，任务 10 使用 ✅

---

## 执行顺序

1. 任务 1（数据库迁移）- 基础依赖
2. 任务 2（文档解析增强）- 基础依赖
3. 任务 3（置信度打分）- 依赖任务 2
4. 任务 4（阈值控制）- 依赖任务 3
5. 任务 5（LLM Prompt 增强）- 依赖任务 2
6. 任务 6（合并策略）- 依赖任务 3, 5
7. 任务 7（LLM 配置 API）- 独立
8. 任务 8（JobEntry 进度）- 独立
9. 任务 9（前端 API）- 依赖任务 7
10. 任务 10（ProfileSettingsView）- 依赖任务 9
11. 任务 11（StepStrip）- 依赖任务 8
