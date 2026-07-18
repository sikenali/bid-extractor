# 无标题文档章节分界 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 当文档无标题样式时，通过文本关键词检测章节分界，使章节限域搜索对无标题文档生效

**架构：** 在 `extractDocxWithChapters` 中新增 `isSectionStart` 文本分界检测和 `detectContentGroup` 内容关键词归类，作为 heading 检测的备选

**技术栈：** Go + unioffice

---

### 任务 1：新增 `isSectionStart` 和 `detectContentGroup` 函数

**文件：**
- 修改：`backend/doc-handler/main.go`

- [ ] **步骤 1：在 `detectSection` 之后添加 `isSectionStart` 函数**

```go
var sectionStarters = []string{
	"一、", "二、", "三、", "四、", "五、", "六、", "七、", "八、",
	"（一）", "（二）", "（三）", "（四）", "（五）",
	"第一章", "第二章", "第三章", "第四章", "第五章",
	"第1章", "第2章", "第3章", "第4章", "第5章",
}

func isSectionStart(text string) (bool, string) {
	for _, s := range sectionStarters {
		if strings.HasPrefix(text, s) {
			return true, detectSection(text)
		}
	}
	g := detectSection(text)
	if g != "info" {
		return true, g
	}
	return false, "info"
}
```

- [ ] **步骤 2：在 `isSectionStart` 之后添加 `detectContentGroup` 函数**

```go
var contentGroupKeywords = map[string][]string{
	"score":    {"评分", "分值", "得分", "打分", "评审", "权重"},
	"business": {"付款", "质保", "售后", "交付", "验收", "培训", "合同", "保险", "责任", "保密", "履约", "保证金"},
	"tech":     {"技术", "规格", "参数", "标准", "规范", "性能", "指标", "配置", "功能", "安装", "调试"},
}

func detectContentGroup(text string) string {
	for group, keywords := range contentGroupKeywords {
		for _, kw := range keywords {
			if strings.Contains(text, kw) {
				return group
			}
		}
	}
	return "info"
}
```

- [ ] **步骤 3：go build 确认编译通过**

```bash
cd /home/jingle/opc/bid-extractor/backend/doc-handler && go build -o dist/doc-handler main.go 2>&1
```

预期：无输出

- [ ] **步骤 4：Commit**

```bash
git add backend/doc-handler/main.go && git commit -m "feat: add isSectionStart and detectContentGroup functions"
```

---

### 任务 2：集成到 `extractDocxWithChapters`

**文件：**
- 修改：`backend/doc-handler/main.go`

- [ ] **步骤 1：在段落循环中集成文本分界检测**

在 `extractDocxWithChapters` 的段落遍历循环中，heading 检测之后添加：

```go
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
} else {
	// 文本分界检测（备选）
	if isStart, sg := isSectionStart(text); isStart {
		if currentChapter != nil {
			chapters = append(chapters, *currentChapter)
		}
		currentGroup = sg
		currentChapter = &Chapter{
			Title:   text,
			Content: []string{},
			Page:    paraIndex + 1,
		}
	}
}
```

- [ ] **步骤 2：在段落分配时加入内容关键词归类**

在 `groupToParagraphs[currentGroup]` 分配之前，添加内容关键词修正：

```go
// 如果当前组是 info，尝试内容关键词归类
usedGroup := currentGroup
if usedGroup == "info" {
	if cg := detectContentGroup(text); cg != "info" {
		usedGroup = cg
	}
}
groupToParagraphs[usedGroup] = append(groupToParagraphs[usedGroup], text)
```

注意：`currentGroup` 保持不变（只影响 `groupToParagraphs`，不影响章节结构）。

- [ ] **步骤 3：go build 确认编译通过**

```bash
cd /home/jingle/opc/bid-extractor/backend/doc-handler && go build -o dist/doc-handler main.go 2>&1
```

- [ ] **步骤 4：Commit**

```bash
git add backend/doc-handler/main.go && git commit -m "feat: integrate text-based section detection into extractDocxWithChapters"
```

---

### 任务 3：集成测试

**文件：** 无

- [ ] **步骤 1：用测试文档验证**

```bash
cat /tmp/test_rules.json | timeout 30 /home/jingle/opc/bid-extractor/backend/doc-handler/dist/doc-handler 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
ex = d.get('extracts',{})
print('Status:', d.get('status'))
print('Extracts:', len(ex))
for k in ['项目名称','项目编号','投标截止时间','投标地点','价格评分','技术评分','商务评分','分值','满分','评标办法','评分表']:
    v = ex.get(k,'[NOT FOUND]')
    print(f'  {k}: {str(v)[:70]}')
print('Chapters:', len(d.get('chapters',[])))
groups = d.get('groups',{})
from collections import Counter
print('Group distribution:', dict(Counter(groups.values())))
"
```

- [ ] **步骤 2：启动后端，通过 API 上传测试**

```bash
cd /home/jingle/opc/bid-extractor/backend && npx tsx src/index.ts &
sleep 3
curl -s --max-time 180 -X POST http://localhost:3000/api/upload -F "file=@/home/jingle/opc/工业和信息化部电子第五研究所高性能时钟芯片服务器基准测试系统服务项目发售稿.docx" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ex = d.get('result',{}).get('extracts',{})
for k in ['项目名称','项目编号','投标截止时间','价格评分','技术评分','商务评分','分值','满分','评标办法']:
    v = ex.get(k,'[NOT FOUND]')
    print(f'{k}: {str(v)[:70]}')
"
```

- [ ] **步骤 3：Commit（如有修复）**

```bash
git add -A && git commit -m "fix: post-test extraction adjustments"
```