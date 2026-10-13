# 提取流程优化设计

> 日期：2026-10-13  
> 主题：文档解析 + LLM Prompt 抽取 + 规则优先兜底 + LLM 语义增强  
> 方案：方案 A（规则优先 + LLM 按需补全）

---

## 1. 目标

解决当前系统的两个核心痛点：
1. **字段提取不准** — 正则规则覆盖不全，LLM 输出结构不稳定
2. **规则维护成本高** — 需要大量正则变体覆盖各种文档写法

采用**四阶段流水线**，平衡精度与费用：

```
Phase 1: 文档解析增强 → 结构化段落/表格/章节
Phase 2: 规则抽取     → 全量规则跑，带置信度打分
Phase 3: LLM 按需增强 → 命中率低的分类调 LLM
Phase 4: 合并与校验   → 高置信优先，冲突标注来源
```

---

## 2. 文档解析增强（Phase 1）

### 2.1 数据结构

```typescript
// 现有接口扩展
interface RichParagraph {
  text: string;
  paraId: number;
  chapter: string;          // 当前章节标题（保持兼容）
  chapterPath: string[];    // 新增：完整章节路径 ["第三章", "3.2 资格要求"]
  level: number;            // 标题层级 0=正文, 1-5=标题
  page: number;
  pageSource: 'actual' | 'estimated';  // 新增：页码来源标记
}

// 章节结构扩展
interface Chapter {
  title: string;
  content: string[];
  page: number;
  path?: string[];          // 新增：章节路径（用于分类）
}
```

### 2.2 章节路径追踪

`flattenContent` 维护章节栈，每遇到标题时 push：

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
      }
      // ...
    }
  };
  walk(nodes);
  return out;
}
```

### 2.3 章节构建（buildChapters 改造）

`buildChapters` 使用 `chapterPath` 构建更准确的章节内容：

```typescript
function buildChapters(paras: FlatParagraph[], paraToPage: number[]): Chapter[] {
  const chapters: Chapter[] = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.level === -1) continue; // 表格占位符不参与章节划分
    if (p.level > 0) {
      // 有层级的标题创建新章节
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

### 2.4 章节分类改进

`classifyChapter` 改为基于 `chapterPath` 精确匹配：

```typescript
function classifyChapter(chapterPath: string[]): string {
  const combined = chapterPath.join(' ');
  // 优先匹配路径中最具体的层级
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

---

## 3. 规则优先兜底（Phase 2 + 阈值控制）

### 3.1 置信度打分体系

```typescript
interface FieldExtract {
  value: string | null;
  confidence: number;      // 新增：0-10
  source: 'regex' | 'keyword' | 'llm' | 'title_fallback';  // 新增
  page: number | null;
  chapter: string;
  group: string;
  sourceText?: string;
  paraIds: number[];
}
```

**置信度分配规则**：

| 来源 | 条件 | 置信度 |
|------|------|--------|
| 正则精确匹配 | 行首 + 冒号 | 9-10 |
| 正则匹配 | 普通位置 | 7-8 |
| 关键字 + 冒号 | followedColon=true | 6-7 |
| 位置推导 | 上下段取值 | 4-5 |
| LLM 抽取 | 模型返回 | 6-8 |
| 标题兜底 | title_first 类型 | 8 |

**置信度计算函数**：

```typescript
function calculateConfidence(
  matchType: 'regex' | 'keyword',
  atStart: boolean,
  followedColon: boolean,
  textLength: number,
): number {
  let confidence = 5;  // 基础分
  
  if (matchType === 'regex') {
    confidence = 7;    // 正则基础分更高
    if (atStart) confidence += 2;  // 行首加分
    if (followedColon) confidence += 1;  // 冒号加分
  } else {
    if (followedColon) confidence += 1;
  }
  
  // 长文本降分（可能是误匹配）
  if (textLength > 200) confidence -= 1;
  
  return Math.min(10, Math.max(1, confidence));
}
```

### 3.2 命中率阈值控制

```typescript
function shouldCallLlm(
  extracts: Record<string, FieldExtract>,
  threshold = 0.6
): string[] {
  // 按分类分组统计命中率
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

### 3.3 精简规则表

规则表可以精简，不再需要覆盖所有变体：
- 只保留**高置信度**规则（正则匹配精确、关键字+冒号）
- 删除低置信度规则（单纯关键字、位置推导）
- LLM 兜底后，规则表可从 ~200 条精简到 ~80 条

---

## 4. LLM Prompt 抽取（Phase 3 核心）

### 4.1 字段 Schema 定义

每个分类绑定一组目标字段：

```typescript
interface FieldSchema {
  name: string;
  type: 'string' | 'date' | 'amount' | 'number';
  description: string;
  required: boolean;
}

interface LlmPromptConfig {
  bizType: 'info' | 'business' | 'tech' | 'score' | 'seal' | 'star';
  fieldSchema: FieldSchema[];
  promptTemplate: string;  // 带占位符的模板
}

// 字段 Schema 从 extraction_rules 表动态生成
function buildFieldSchema(rules: FieldRule[]): FieldSchema[] {
  return rules.map(r => ({
    name: r.fieldName,
    type: inferFieldType(r.fieldName),
    description: r.fieldName,
    required: isRequiredField(r.fieldName),
  }));
}

// 根据字段名推断类型
function inferFieldType(fieldName: string): 'string' | 'date' | 'amount' | 'number' {
  if (/时间|日期|截止|开标|发售|发布/.test(fieldName)) return 'date';
  if (/金额|预算|保证金|费用|价格|限价/.test(fieldName)) return 'amount';
  if (/数量|份数|比例|百分|权重/.test(fieldName)) return 'number';
  return 'string';
}

// 判断是否为必填字段
function isRequiredField(fieldName: string): boolean {
  const requiredFields = [
    '项目名称', '项目编号', '投标截止时间', '开标时间', '投标地点',
    '采购人', '代理机构', '预算金额',
  ];
  return requiredFields.includes(fieldName);
}
```

### 4.2 Prompt 模板

```typescript
const PROMPT_TEMPLATE = `你是一个招标文件信息抽取专家。

目标字段：
{{fieldSchemaList}}

已知结果（规则抽取，请校验/补全）：
{{preExtract}}

文档片段：
{{chunkText}}

要求：
1. 保留原文，不编造
2. 缺失字段填空字符串 ""
3. 只输出JSON，无其他文字`;
```

**fieldSchemaList 渲染**：
```
- 项目名称 (string, 必填): 招标项目的全称
- 投标截止时间 (date, 必填): 投标文件递交的截止时间
- 预算金额 (amount, 选填): 采购预算金额
```

**渲染函数**：

```typescript
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

### 4.3 Few-shot 示例（从纠错历史学习）

```typescript
function buildFewShotExamples(
  correctionHistory: CorrectionHistory[],
  bizType: string
): string {
  // 取最近 3 条同类别纠错记录作为示例
  const recent = correctionHistory
    .filter(c => c.groupName === bizType)
    .slice(-3);
  
  if (recent.length === 0) return '';
  
  return `\n示例：\n${recent.map(c => 
    `原文: ${c.paragraphText}\n正确值: ${c.correctedValue}`
  ).join('\n')}`;
}

// 查询纠错历史
function getCorrectionHistory(db: Database, bizType: string) {
  return db.prepare(
    'SELECT * FROM correction_history WHERE group_name = ? ORDER BY created_at DESC LIMIT 10'
  ).all(bizType);
}
```

### 4.4 JSON 提取改进

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

---

## 5. LLM 语义增强（Phase 4 合并策略）

### 5.1 合并规则

```typescript
function mergeWithConfidence(
  ruleExtracts: Record<string, FieldExtract>,
  llmExtracts: Record<string, string>,
): Record<string, FieldExtract> {
  for (const [field, llmValue] of Object.entries(llmExtracts)) {
    if (!llmValue) continue;
    
    const ruleExtract = ruleExtracts[field];
    
    // 规则置信度 >= 7 时，LLM 不覆盖
    if (ruleExtract && ruleExtract.confidence >= 7) {
      // 标记为 LLM 确认
      ruleExtract.sourceText = (ruleExtract.sourceText || '') + ' | LLM确认';
      continue;
    }
    
    // 规则置信度 < 5 且 LLM 有值时，LLM 覆盖
    if (!ruleExtract || ruleExtract.confidence < 5) {
      ruleExtracts[field] = {
        value: llmValue,
        confidence: 7,  // LLM 默认置信度
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

### 5.2 调用流程

```typescript
async function runLLMExtraction(
  skill: LLMSkillRow,
  paras: FlatParagraph[],
  chapters: Chapter[],
  ruleResult: Record<string, FieldExtract>,
): Promise<Record<string, string>> {
  // 1. 按分类分组段落
  const chunksByType: Record<string, string> = {};
  for (const p of paras) {
    const type = classifyChapter(p.chapterPath);
    if (!chunksByType[type]) chunksByType[type] = '';
    chunksByType[type] += p.text + '\n';
  }
  
  // 2. 只调用命中率低的分类
  const lowHitGroups = shouldCallLlm(ruleResult);
  
  // 3. 构建字段 Schema
  const rules = loadFieldRules();
  const fieldSchema = buildFieldSchema(rules.filter(r => 
    lowHitGroups.includes(r.group)
  ));
  
  // 4. 加载纠错历史作为 Few-shot 示例
  const correctionHistory = getCorrectionHistory(db, lowHitGroups[0]);
  const fewShot = buildFewShotExamples(correctionHistory, lowHitGroups[0]);
  
  // 5. 对每个低命中率分类调用 LLM
  const allResults: Record<string, string> = {};
  for (const group of lowHitGroups) {
    const chunkText = chunksByType[group] || '';
    if (!chunkText) continue;
    
    const prompt = skill.prompt_template
      .replace('{{fieldSchemaList}}', renderFieldSchemaList(fieldSchema))
      .replace('{{preExtract}}', JSON.stringify(ruleResult))
      .replace('{{fewShot}}', fewShot)
      .replace('{{chunkText}}', chunkText.slice(0, 3000));
    
    // 调用 LLM
    const raw = await callLLM(
      skill.llm_api_config_id,
      prompt,
      skill.temperature,
      skill.top_p,
      skill.max_tokens
    );
    const jsonStr = extractJSONFromResponse(raw);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      Object.assign(allResults, parsed);
    }
  }
  
  return allResults;
}
```

---

## 6. 数据流全景

```
前端上传 .docx
    ↓
POST /api/upload
    ↓
parseDocument()
    ├─ Phase 1: 文档解析 (§2)
    │   ├─ officeparser.parseOffice()
    │   ├─ flattenContent() → RichParagraph[] (带 chapterPath)
    │   ├─ collectTables() → TableMeta[]
    │   └─ buildChapters() → Chapter[] (带 path)
    │
    ├─ Phase 2: 规则抽取 (§3)
    │   ├─ loadFieldRules() → FieldRule[]
    │   ├─ applyRuleExtraction() → extracts (带 confidence + source)
    │   ├─ calculateConfidence() → 置信度打分
    │   └─ businessValidate() → checks
    │
    ├─ Phase 3: LLM 按需增强 (§4, 可选)
    │   ├─ shouldCallLlm() → lowHitGroups
    │   ├─ buildFieldSchema() → schema
    │   ├─ renderFieldSchemaList() → prompt 片段
    │   ├─ 对每个 lowHitGroup 调用 LLM
    │   └─ extractJSONFromResponse() → llmExtracts
    │
    └─ Phase 4: 合并 (§5)
        ├─ mergeWithConfidence() → finalExtracts
        └─ return ExtractOutput
```

---

## 7. 数据库变更

### 7.1 extraction_rules 表

无需变更，保持兼容。

### 7.2 llm_prompt_templates 表

```sql
-- 新增字段
ALTER TABLE llm_prompt_templates ADD COLUMN field_schema TEXT DEFAULT '[]';
```

### 7.3 doc_results 表

```sql
-- result_json 中新增 confidence 和 source 字段，无需 schema 变更
```

---

## 8. 错误处理

| 场景 | 处理策略 |
|------|----------|
| officeparser 解析失败 | 返回空结果 + warningList |
| LLM API 超时 | 降级为 rule_only，记录日志 |
| LLM JSON 解析失败 | 跳过该分类，继续其他分类 |
| 规则表为空 | 降级为纯 LLM 模式 |
| 章节分类失败 | 默认归为 'other'，不参与 LLM 调用 |

---

## 9. 测试策略

### 9.1 单元测试

- `flattenContent`: 验证 chapterPath 构建正确
- `classifyChapter`: 验证路径匹配准确率
- `shouldCallLlm`: 验证阈值判断
- `mergeWithConfidence`: 验证合并逻辑

### 9.2 集成测试

- 上传测试文档，验证完整流水线
- 模拟 LLM 超时，验证降级逻辑
- 模拟 LLM 返回非法 JSON，验证容错

### 9.3 对比测试

- 规则只有 vs 规则+LLM，对比字段准确率
- 记录命中率提升数据

---

## 10. 前端个性设置改造

> 注：主题管理、模板管理、技能管理、模型管理、导出管理、关于 6 个模块保持不变，仅改造"个性设置"模块。

### 10.1 ProfileSettingsView 新布局

个性设置将整合以下内容：

```typescript
const TABS = [
  { key: 'profile', label: '通用', icon: 'ri-settings-4-line' },        // 原有界面设置
  { key: 'llm', label: '智能增强', icon: 'ri-brain-line' },              // LLM 配置 + 技能
  { key: 'prompts', label: '提示词模板', icon: 'ri-chat-3-line' },      // 提示词模板管理
  { key: 'rules', label: '规则管理', icon: 'ri-list-settings-line' },    // 提取规则管理
];
```

### 10.2 Tab 1: 通用（原有功能保留）

保留现有个性设置功能：
- 界面密度
- 行为偏好
- 提取后跳转设置

### 10.3 Tab 2: 智能增强（新增 LLM 配置）

整合原有"技能管理"内容 + 新增 LLM 增强配置：

**顶部配置区**（新增）：
```typescript
// LLM 增强配置
const llmEnhanceConfig = {
  enabled: true,              // 是否启用 LLM 增强
  hitRateThreshold: 0.6,      // 命中率阈值
  modelId: '',                // 使用的模型配置 ID
};
```

**UI 布局**：
```
┌─────────────────────────────────────────────────────────┐
│  [开关] LLM 智能增强                                      │
│  ─────────────────────────────────────────────────────    │
│  命中率阈值：[slider] 60%  （低于此值触发 LLM 增强）        │
│  模型配置：  [下拉选择模型]                                │
│  ─────────────────────────────────────────────────────    │
│  提取技能列表（卡片形式）                                   │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 项目名称：项目信息抽取技能                          │    │
│  │ 分类：项目信息 | 版本：v1                          │    │
│  │ [开关] LLM增强  [开关] 启用                        │    │
│  │ 编辑 | 删除                                       │    │
│  └──────────────────────────────────────────────────┘    │
│  [+ 新建技能]                                            │
└─────────────────────────────────────────────────────────┘
```

### 10.4 Tab 3: 提示词模板（原有功能）

保持现有提示词模板管理功能不变。

### 10.5 Tab 4: 规则管理（原有功能 + 置信度展示）

原有规则管理功能，增加置信度信息展示：

```typescript
interface RuleItem {
  id: string;
  fieldName: string;
  pattern: string;
  groupName: string;
  aliasFor: string;
  category: string;
  confidenceLevel: 'high' | 'medium' | 'low';  // 新增：规则置信度等级
}
```

**UI 改动**：
- 规则卡片增加置信度标签
- 低置信度规则可以一键删除（LLM 兜底后不需要）

### 10.6 后端 API 变更

新增 LLM 增强配置接口：

```typescript
// GET /api/settings/llm-enhance
interface LlmEnhanceConfig {
  enabled: boolean;
  hitRateThreshold: number;
  modelId: string;
}

// PUT /api/settings/llm-enhance
```

### 10.7 SettingsModal 菜单

保持不变，7 个菜单项不变：

```typescript
const menuItems = [
  { key: 'theme', label: '主题管理', icon: 'ri-palette-line', component: ThemeSettingsView },
  { key: 'template', label: '模板管理', icon: 'ri-file-list-2-line', component: TemplateSettingsView },
  { key: 'skill', label: '技能管理', icon: 'ri-git-branch-line', component: SkillSettingsView },
  { key: 'model', label: '模型管理', icon: 'ri-cpu-line', component: ApiKeySettingsView },
  { key: 'export', label: '导出管理', icon: 'ri-download-2-line', component: ExportSettingsView },
  { key: 'profile', label: '个性设置', icon: 'ri-vip-crown-line', component: ProfileSettingsView },
  { key: 'about', label: '关于', icon: 'ri-information-line', component: AboutSettingsView },
];
```

---

## 11. 前端步骤条优化

### 11.1 StepStrip 步骤文字

当前步骤文字：
```typescript
const steps = [
  { key: 0, label: '文档解析' },
  { key: 1, label: '规则抽取' },
  { key: 2, label: 'LLM 增强' },
];
```

**优化为**（更符合用户理解）：
```typescript
const steps = [
  { key: 0, label: '文档解析' },
  { key: 1, label: '规则抽取' },
  { key: 2, label: '智能增强' },
];
```

### 11.2 步骤进度映射

StepStrip 的 `loadingProgress` 需要与后端实际执行阶段对应：

| 阶段 | 对应步骤 | loadingProgress |
|------|----------|-----------------|
| Phase 1: 文档解析 | step 0 | 0 |
| Phase 2: 规则抽取 | step 1 | 1 |
| Phase 3: LLM 增强（如需） | step 2 | 2 |

**实现方式**：后端在 `jobStore` 中更新 `progress` 字段：

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

前端轮询时读取 `progress` 字段更新 StepStrip：

```typescript
// 前端轮询逻辑
const pollJob = async (jobId: string) => {
  const res = await apiClient.get(`/upload/${jobId}/status`);
  const data = res.data;
  loadingProgress.value = data.result?.progress ?? -1;
  if (data.status === 'parsed') {
    loading.value = false;
    currentResult.value = data.result;
  }
};
```

---

## 12. 配置项

在 `profile_settings` 表新增：

```sql
ALTER TABLE profile_settings ADD COLUMN llm_enhance_enabled INTEGER DEFAULT 1;
ALTER TABLE profile_settings ADD COLUMN llm_hit_rate_threshold REAL DEFAULT 0.6;
ALTER TABLE profile_settings ADD COLUMN llm_model_id TEXT DEFAULT '';
```

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| llm_enhance_enabled | 是否启用 LLM 增强 | 1 |
| llm_hit_rate_threshold | 命中率阈值（低于此值调用 LLM） | 0.6 |
| llm_model_id | 使用的 LLM 模型配置 ID | 空 |
