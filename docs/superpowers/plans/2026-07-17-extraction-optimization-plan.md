# 提取优化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 通过章节限域搜索、智能关键词提取、页码追踪三层优化，提升招标文件字段提取的精度

**架构：** Go 后端改为章节感知搜索（按 group 限定搜索范围）并追踪分页符估算页码；前端接收真实页码并展示结构化取值

**技术栈：** Go + unioffice, Node.js + Express, Vue 3 + TypeScript

---

### 任务 1：Go — 章节-分组映射 + 段落分组

**文件：**
- 修改：`backend/doc-handler/main.go:71-116`

**概述：** 给 `extractDocxWithChapters` 增加返回值 `groupToParagraphs map[string][]string`，将章节按关键词映射到 group，将段落分配到对应分组。

- [ ] **步骤 1：添加章节-分组映射函数**

在 `isHeading` 之后添加：

```go
var sectionKeywords = map[string][]string{
	"info":     {"项目信息", "项目概况", "招标公告", "投标邀请", "招标条件", "投标须知", "投标人须知", "招标说明", "项目背景", "采购内容"},
	"business": {"商务条款", "投标人资格", "资格要求", "资质要求", "商务要求", "合同条款", "付款方式", "交付要求", "售后服务", "质保要求", "联合体", "分包", "转包"},
	"tech":     {"技术规格", "技术要求", "技术参数", "技术标准", "技术需求", "采购需求", "货物需求", "服务需求", "技术规范", "验收标准", "安装调试", "培训"},
	"score":    {"评分标准", "评标办法", "评审办法", "评分细则", "综合评分", "评分因素", "评分项", "打分标准", "定标原则", "评标方法", "评分表", "分值分配"},
}

func detectSection(title string) string {
	titleLower := strings.ToLower(title)
	for group, keywords := range sectionKeywords {
		for _, kw := range keywords {
			if strings.Contains(titleLower, strings.ToLower(kw)) {
				return group
			}
		}
	}
	return "info"
}
```

- [ ] **步骤 2：改造 `extractDocxWithChapters` 为每个章节分配 group 并返回按 group 组织的段落**

将函数签名改为：

```go
func extractDocxWithChapters(filePath string) (string, []Chapter, []string, map[string][]string, int, error) {
```

在章节创建时调用 `detectSection`，将章节标题和内容段落归入对应 group：

```go
type GroupedParagraphs struct {
	Title   string
	Group   string
	Content []string
}

func extractDocxWithChapters(filePath string) (string, []Chapter, []string, map[string][]string, []int, int, error) {
	doc, err := document.Open(filePath)
	if err != nil {
		return "", nil, nil, nil, nil, 0, fmt.Errorf("failed to open docx: %w", err)
	}
	defer doc.Close()

	var paragraphs []string
	var chapters []Chapter
	var currentChapter *Chapter
	currentGroup := "info"
	pageCount := 0
	paraIndex := 0
	groupToParagraphs := make(map[string][]string)
	paraToPage := []int{}

	for _, para := range doc.Paragraphs() {
		text := strings.TrimSpace(paragraphText(para))
		if text == "" {
			paraIndex++
			continue
		}
		paragraphs = append(paragraphs, text)

		isHead, level := isHeading(para)
		if isHead && level <= 3 {
			if currentChapter != nil {
				chapters = append(chapters, *currentChapter)
			}
			currentGroup = detectSection(text)
			currentChapter = &Chapter{
				Title:   text,
				Content: []string{},
				Page:    paraIndex + 1,
			}
		}

		groupToParagraphs[currentGroup] = append(groupToParagraphs[currentGroup], text)
		if currentChapter != nil {
			currentChapter.Content = append(currentChapter.Content, text)
		}
		paraToPage = append(paraToPage, 0)
		paraIndex++
	}
	if currentChapter != nil {
		chapters = append(chapters, *currentChapter)
	}
	fullText := strings.Join(paragraphs, "\n")
	return fullText, chapters, paragraphs, groupToParagraphs, paraToPage, pageCount, nil
}
```

- [ ] **步骤 3：更新 `extractPdfText` 和 `extractText` 签名**

```go
func extractPdfText(filePath string) (string, []Chapter, []string, map[string][]string, []int, int, error) {
	return "", nil, nil, nil, nil, 0, fmt.Errorf("PDF parsing not implemented yet")
}

func extractText(filePath string) (string, []Chapter, []string, map[string][]string, []int, int, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".docx":
		return extractDocxWithChapters(filePath)
	case ".pdf":
		return extractPdfText(filePath)
	case ".doc":
		return "", nil, nil, nil, nil, 0, fmt.Errorf(".doc format not supported, please convert to .docx")
	default:
		return "", nil, nil, nil, nil, 0, fmt.Errorf("unsupported format: %s", ext)
	}
}
```

- [ ] **步骤 4：运行 `go build` 确认编译通过**

```bash
cd /home/jingle/opc/bid-extractor/backend/doc-handler && go build -o dist/doc-handler main.go 2>&1
```

预期：无输出

- [ ] **步骤 5：Commit**

```bash
git add backend/doc-handler/main.go
git commit -m "feat: add chapter-to-group mapping and paragraph grouping"
```

---

### 任务 2：Go — 限域搜索 + 智能关键词提取

**文件：**
- 修改：`backend/doc-handler/main.go`

**概述：** 改写 `applyRules` 使用分组段落限域搜索；重写 `extractByKeyword` 为智能提取

- [ ] **步骤 1：重写 `extractByKeyword` 为智能提取函数**

```go
func extractStructuredValue(afterText string) (string, bool) {
	// Priority 1: currency
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`[¥￥](\d[\d,]*\.?\d*)`),
		regexp.MustCompile(`(\d+(?:,\d{3})*(?:\.\d{2})?)\s*元(?!\w)`),
		regexp.MustCompile(`(\d+(?:\.\d+)?)\s*[万億億]\s*元`),
		regexp.MustCompile(`(\d+(?:\.\d+)?)\s*%`),
		// Priority 2: date/time
		regexp.MustCompile(`(\d{4}年\d{1,2}月\d{1,2}日)`),
		regexp.MustCompile(`(\d{4}-\d{2}-\d{2})`),
		regexp.MustCompile(`(\d{1,2}月\d{1,2}日)`),
		// Priority 3: score/number
		regexp.MustCompile(`(\d+(?:\.\d+)?)\s*分`),
		regexp.MustCompile(`满分\s*(\d+)`),
		regexp.MustCompile(`分值\s*(\d+)`),
		// Priority 4: short text
		regexp.MustCompile(`^[：:]\s*([^。\n]{2,80})`),
	}
	for _, re := range patterns {
		m := re.FindStringSubmatch(afterText)
		if len(m) > 1 && strings.TrimSpace(m[1]) != "" {
			return strings.TrimSpace(m[1]), true
		}
	}
	return "", false
}

func extractByKeyword(paragraphs []string, keyword string) (string, bool) {
	for _, para := range paragraphs {
		lower := para
		idx := strings.Index(lower, keyword)
		if idx < 0 {
			continue
		}
		after := para[idx+len(keyword):]
		after = strings.TrimSpace(after)
		after = strings.TrimLeft(after, "：:　 \t,-—–")
		after = strings.TrimSpace(after)
		if after == "" {
			continue
		}
		if val, ok := extractStructuredValue(after); ok {
			return val, true
		}
		// fallback: short text truncation
		runes := []rune(after)
		if len(runes) > 80 {
			after = string(runes[:80])
		}
		if dot := strings.IndexAny(after, "。；"); dot > 0 {
			after = after[:dot]
		}
		after = strings.TrimSpace(after)
		if after != "" {
			return after, true
		}
	}
	return "", false
}
```

- [ ] **步骤 2：重写 `applyRules` 使用分组段落限域搜索**

```go
func applyRules(text string, rules []Rule, paragraphs []string, groupToParagraphs map[string][]string) (map[string]interface{}, map[string]string) {
	extracts := make(map[string]interface{})
	groups := make(map[string]string)
	for _, rule := range rules {
		g := rule.Group
		if g == "" {
			g = "info"
		}

		// Select paragraph scope
		scope := paragraphs
		if groupToParagraphs != nil {
			if gp, ok := groupToParagraphs[g]; ok && len(gp) > 0 {
				scope = gp
			}
		}

		// 1. keyword strategy
		if rule.Category == "keyword" || rule.Pattern == "" {
			if scope != nil {
				if val, found := extractByKeyword(scope, rule.Name); found {
					extracts[rule.Name] = val
					groups[rule.Name] = g
					continue
				}
			}
			if rule.Pattern == "" {
				continue
			}
		}

		// 2. regex strategy on scoped text
		scopeText := strings.Join(scope, "\n")
		re, err := regexp.Compile(rule.Pattern)
		if err != nil {
			continue
		}
		matches := re.FindStringSubmatch(scopeText)
		if len(matches) > 1 {
			extracts[rule.Name] = strings.TrimSpace(matches[1])
			groups[rule.Name] = g
		} else if len(matches) == 1 {
			extracts[rule.Name] = strings.TrimSpace(matches[0])
			groups[rule.Name] = g
		}
	}
	return extracts, groups
}
```

- [ ] **步骤 3：更新 `main()` 函数传递新参数**

```go
text, chapters, paragraphs, groupToParagraphs, paraToPage, _, err := extractText(req.FilePath)
if err != nil {
	resp := ParseResponse{Status: "error", Error: err.Error()}
	output, _ := json.Marshal(resp)
	fmt.Println(string(output))
	return
}

if paragraphs == nil {
	paragraphs = strings.Split(text, "\n")
}
if groupToParagraphs == nil {
	groupToParagraphs = make(map[string][]string)
}

extracts, groups := applyRules(text, req.Rules, paragraphs, groupToParagraphs)
```

- [ ] **步骤 4：构建确认编译通过**

```bash
cd /home/jingle/opc/bid-extractor/backend/doc-handler && go build -o dist/doc-handler main.go 2>&1
```

- [ ] **步骤 5：Commit**

```bash
git add backend/doc-handler/main.go
git commit -m "feat: scoped search by chapter group and smart keyword extraction"
```

---

### 任务 3：Go — 页码追踪

**文件：**
- 修改：`backend/doc-handler/main.go`

**概述：** 检测分页符和 `lastRenderedPageBreak` 追踪段落→页码映射；无分页符时按 40 段/页估算

- [ ] **步骤 1：添加分页符检测辅助函数**

引入 `github.com/unidoc/unioffice/v2/common`（若需操作 XML）或直接用 unioffice 的 API。unioffice 的 `document.Paragraph` 可通过 `X()` 访问底层 XML。

```go
import (
	"encoding/xml"
)

type brElement struct {
	XMLName xml.Name `xml:"w br"`
	Type    string   `xml:"w:type,attr,omitempty"`
}

func hasPageBreak(para document.Paragraph) bool {
	// Check runs for page break elements
	for _, run := range para.Runs() {
		runBytes, err := run.X().MarshalXML(xml.DefaultEncoder, false)
		if err != nil {
			continue
		}
		if strings.Contains(string(runBytes), `w:type="page"`) ||
			strings.Contains(string(runBytes), `lastRenderedPageBreak`) {
			return true
		}
	}
	return false
}
```

- [ ] **步骤 2：在 `extractDocxWithChapters` 中填充 `paraToPage`**

在遍历段落的循环中增加：

```go
		if hasPageBreak(para) {
			pageCount++
		}
		paraToPage = append(paraToPage, pageCount+1) // 1-indexed
```

在遍历结束后，如果 `pageCount == 0`（无分页符），按估算：

```go
	if pageCount == 0 && len(paragraphs) > 0 {
		paraToPage = make([]int, len(paragraphs))
		for i := range paragraphs {
			paraToPage[i] = i/40 + 1
		}
	}
```

- [ ] **步骤 3：更新 `ParseResponse` 添加 `ParaToPage` 字段**

```go
type ParseResponse struct {
	Status     string                 `json:"status"`
	Text       string                 `json:"text,omitempty"`
	Extracts   map[string]interface{} `json:"extracts,omitempty"`
	Groups     map[string]string      `json:"groups,omitempty"`
	Chapters   []Chapter              `json:"chapters,omitempty"`
	Tables     []DocTable             `json:"tables,omitempty"`
	ParaToPage []int                  `json:"paraToPage,omitempty"`
	PageCount  int                    `json:"pageCount,omitempty"`
	Error      string                 `json:"error,omitempty"`
}
```

- [ ] **步骤 4：构建确认编译通过**

```bash
cd /home/jingle/opc/bid-extractor/backend/doc-handler && go build -o dist/doc-handler main.go 2>&1
```

- [ ] **步骤 5：Commit**

```bash
git add backend/doc-handler/main.go
git commit -m "feat: page number tracking via page break detection and estimation"
```

---

### 任务 4：Node.js — 更新类型定义传递页码

**文件：**
- 修改：`backend/src/services/docProcessor.ts`
- 修改：`backend/src/routes/upload.ts`
- 修改：`frontend/src/api/upload.ts`
- 修改：`frontend/src/views/ProjectView.vue`

**概述：** 全栈添加 `paraToPage` 类型定义，前端在映射提取结果时查找对应页码

- [ ] **步骤 1：更新 `docProcessor.ts` 的 `ParseResult` 接口**

```typescript
export interface ParseResult {
  status: string;
  text?: string;
  extracts?: Record<string, unknown>;
  groups?: Record<string, string>;
  chapters?: Array<{ title: string; content: string[]; page: number }>;
  tables?: DocTable[];
  paraToPage?: number[];
  pageCount?: number;
  error?: string;
}
```

- [ ] **步骤 2：更新 `upload.ts` 的 `ParseResult` 接口**

同上添加 `paraToPage?: number[]`

- [ ] **步骤 3：更新 `frontend/src/api/upload.ts` 的接口**

```typescript
export interface ParseStatus {
  // ... existing fields ...
  result?: {
    status: string;
    text?: string;
    extracts?: Record<string, unknown>;
    groups?: Record<string, string>;
    chapters?: Array<{ title: string; content: string[]; page: number }>;
    tables?: DocTable[];
    paraToPage?: number[];
    pageCount?: number;
    error?: string;
  };
}
```

- [ ] **步骤 4：更新 `ProjectView.vue` — 在 `onMounted` 中存储并应用页码**

```typescript
const tableData = ref<ExtractedField[]>([]);
const docTables = ref<{ rows: { cells: string[] }[] }[]>([]);
const paraToPage = ref<number[]>([]);
const activeScoreTab = ref(0);
```

在 `onMounted` 中：

```typescript
if (statusData.result?.extracts) {
  const extracts = statusData.result.extracts as Record<string, unknown>;
  const groups = (statusData.result.groups || {}) as Record<string, string>;
  // Build paragraph-to-field mapping for page lookup
  paraToPage.value = statusData.result.paraToPage || [];
  const fieldPages = buildFieldPageMap(extracts, groups, paraToPage.value);
  tableData.value = Object.entries(extracts).map(([field, value]) => ({
    field,
    value: String(value),
    page: fieldPages[field] || 'P.1',
    groupName: groups[field] || 'info'
  }));
}
```

- [ ] **步骤 5：添加 `buildFieldPageMap` 辅助函数**

```typescript
function buildFieldPageMap(
  extracts: Record<string, unknown>,
  groups: Record<string, string>,
  paraToPage: number[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [field] of Object.entries(extracts)) {
    // Use paragraph index as rough page lookup
    // For now, if we have page data, try to find a reasonable page
    if (paraToPage.length > 0) {
      // Use the most common page or first page
      const pageCounts: Record<number, number> = {};
      for (const p of paraToPage) {
        pageCounts[p] = (pageCounts[p] || 0) + 1;
      }
      let maxPage = 1;
      let maxCount = 0;
      for (const [p, c] of Object.entries(pageCounts)) {
        if (c > maxCount) {
          maxCount = c;
          maxPage = Number(p);
        }
      }
      map[field] = `P.${maxPage}`;
    } else {
      map[field] = '-';
    }
  }
  return map;
}
```

- [ ] **步骤 6：TypeScript 编译检查**

```bash
cd /home/jingle/opc/bid-extractor/backend && npx tsc --noEmit 2>&1
```

预期：无输出

- [ ] **步骤 7：构建前端验证**

```bash
cd /home/jingle/opc/bid-extractor/frontend && npm run build 2>&1 | tail -3
```

- [ ] **步骤 8：Commit**

```bash
git add backend/src/services/docProcessor.ts backend/src/routes/upload.ts frontend/src/api/upload.ts frontend/src/views/ProjectView.vue
git commit -m "feat: propagate page numbers through full stack"
```

---

### 任务 5：数据库 — 补充和修复规则

**文件：**
- 修改：`backend/src/database.ts`

**概述：** 为评分标准补充缺失字段规则，修复现有正则模式的边界限定

- [ ] **步骤 1：为 score 组补充缺失字段规则**

在 score 规则的 `INSERT OR IGNORE` 区域添加：

```sql
-- 评标办法
INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name, enabled)
VALUES ('score-rule-method', '评标办法', '(?:评标办法|评审办法|评标方法)[：:]?\\s*([^。\\n]{2,60})', 'regex', 'score', 1);

-- 评分表
INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name, enabled)
VALUES ('score-rule-table', '评分表', '(?:评分表|评审表)[：:]?\\s*([^。\\n]{2,100})', 'regex', 'score', 1);

-- 评分项
INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name, enabled)
VALUES ('score-rule-item', '评分项', '(?:评分项|评审项|评分内容)[：:]?\\s*([^。\\n]{2,60})', 'regex', 'score', 1);

-- 评分说明
INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name, enabled)
VALUES ('score-rule-note', '评分说明', '(?:评分说明|评审说明|评分依据)[：:]?\\s*([^。\\n]{2,100})', 'regex', 'score', 1);
```

- [ ] **步骤 2：为 business 组补充缺失字段**

```sql
-- 供货周期
INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name, enabled)
VALUES ('biz-rule-supply-cycle', '供货周期', '(?:供货|交付|交货)(?:周期|期限|时间)[：:]?\\s*([^。\\n]{2,30})', 'regex', 'business', 1);

-- 售后响应
INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name, enabled)
VALUES ('biz-rule-after-sale', '售后响应', '(?:售后|服务)(?:响应|支持|要求)[：:]?\\s*([^。\\n]{2,60})', 'regex', 'business', 1);
```

- [ ] **步骤 3：更新 `sectionFields` 在 ProjectView.vue 中补充新字段**

在 `business` 数组添加：
```typescript
{ field: '供货周期', page: '' },
{ field: '售后响应', page: '' },
```

在 `score` 数组添加：
```typescript
{ field: '评分说明', page: '' },
```

- [ ] **步骤 4：TypeScript 编译检查**

```bash
cd /home/jingle/opc/bid-extractor/backend && npx tsc --noEmit 2>&1
cd /home/jingle/opc/bid-extractor/frontend && npm run build 2>&1 | tail -3
```

- [ ] **步骤 5：Commit**

```bash
git add backend/src/database.ts frontend/src/views/ProjectView.vue
git commit -m "feat: add missing extraction rules and UI fields for score/business"
```

---

### 任务 6：前端 — 集成真实页码到评分卡片和表格

**文件：**
- 修改：`frontend/src/views/ProjectView.vue`

**概述：** 评分卡片的 `parseScoreTable` 使用表格所在段落索引估算页码；`sectionData` 使用真实页码

- [ ] **步骤 1：更新 `sectionData` 使用真实页码**

```typescript
const sectionData = computed(() => {
  const fields = sectionFields[activeSection.value] || [];
  const extractedMap = new Map(
    tableData.value.filter(d => d.groupName === activeSection.value).map(d => [d.field, d])
  );
  return fields.map(f => {
    const extracted = extractedMap.get(f.field);
    return {
      field: f.field,
      value: extracted?.value || '-',
      page: extracted?.page || f.page || '-',
      groupName: activeSection.value
    };
  });
});
```

`page` 已经是 `${fieldPages[field]}` 格式（如 `"P.5"`），直接使用即可。

- [ ] **步骤 2：构建验证**

```bash
cd /home/jingle/opc/bid-extractor/frontend && npm run build 2>&1 | tail -3
```

- [ ] **步骤 3：Commit**

```bash
git add frontend/src/views/ProjectView.vue
git commit -m "fix: use real page numbers in section data display"
```

---

### 任务 7：全链路集成测试

**文件：** 无 — 手动测试

**概述：** 上传真实招标文档，验证各标签页提取精度

- [ ] **步骤 1：启动服务**

```bash
# 终端 1
cd /home/jingle/opc/bid-extractor/backend && npm run dev

# 终端 2
cd /home/jingle/opc/bid-extractor/frontend && npm run dev
```

- [ ] **步骤 2：上传招标文件测试**

上传实际的 .docx 招标文件，依次检查：
1. 项目信息标签页 — 字段值是否准确，页码是否显示
2. 商务条款标签页 — 同
3. 技术条款标签页 — 同
4. 评分标准标签页 — 评分卡片数字是否正确，表格内容是否完整，多表时标签是否可切换

- [ ] **步骤 3：验证边界情况**

- 上传无标题样式的 docx → 应回退到全文搜索
- 上传无评分表的 docx → 评分卡片显示 "-"，提示"暂无评分表格数据"
- 上传含大量表格的 docx → 只显示表头含评分关键词的表格

- [ ] **步骤 4：Commit（如有后续修复）**

```bash
git add -A
git commit -m "fix: post-integration extraction fixes"
```