# 无标题文档章节分界设计方案

## 背景

当前章节检测依赖 Word 标题样式（Heading 1-3），但许多招标文档不使用标题样式，而是直接用中文序号（"一、" "二、"）或纯文本段落（"评分标准" "商务条款"）作为章节分界。当文档无标题样式时，`groupToParagraphs` 只有 "info" 一个组，章节限域搜索退化为全文搜索，导致价格/技术/商务评分匹配到方法论段落而非评分表格。

## 方案

三层章节分界架构，按优先级依次尝试：

### 第 1 层：标题样式检测（已有）

检测 Heading 1-3 样式，检测到则使用 `detectSection` 确定 group。

### 第 2 层：文本关键词分界（新增）

当第 1 层检测到 0 章节时（或同时启用），扫描段落文本寻找分界标记：

- **中文序号标题**：`一、` `二、` `三、` / `（一）` `（二）` / `第一章` `第二章` / `第1章` `第2章`
- **章节关键词**：段落文本中匹配 `sectionKeywords` 的段落（如含"评分标准"的段落标记为 score 组起点）
- 找到分界后切换 `currentGroup`，后续段落归入该组
- 分界关键词匹配使用 `detectSection` 已有的 `sectionKeywords` 映射

### 第 3 层：内容关键词归类（fallback）

如果前两层都没找到分界，按段落内容关键词做段落级别的 group 归属：

- 含 `评分` `分值` `得分` `打分` `评审` `权重` 的段落 → score
- 含 `付款` `质保` `售后` `交付` `验收` `培训` `合同` `保险` `责任` `保密` 的段落 → business
- 含 `技术` `规格` `参数` `标准` `规范` `性能` `指标` `配置` `功能` 的段落 → tech
- 其余 → info

此层不改变章节结构，只影响 `groupToParagraphs` 映射，使 `applyRules` 的限域搜索能更精确。

## 实现

### 修改文件

`backend/doc-handler/main.go`

### 新增函数

```go
func isSectionStart(text string) (bool, string) {
    // 检查中文序号前缀
    starters := []string{"一、", "二、", "三、", "四、", "五、", "六、", "七、", "八、",
        "（一）", "（二）", "（三）", "（四）", "（五）",
        "第一章", "第二章", "第三章", "第四章", "第五章",
        "第1章", "第2章", "第3章", "第4章", "第5章"}
    for _, s := range starters {
        if strings.HasPrefix(text, s) {
            return true, detectSection(text)
        }
    }
    // 直接匹配章节关键词
    g := detectSection(text)
    if g != "info" {
        return true, g
    }
    return false, "info"
}
```

### 修改 `extractDocxWithChapters`

在段落遍历循环中，在 heading 检测之后，增加：

```go
if !isHead {
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

### 第 3 层内容关键词映射

```go
var contentGroupKeywords = map[string][]string{
    "score":    {"评分", "分值", "得分", "打分", "评审", "权重"},
    "business": {"付款", "质保", "售后", "交付", "验收", "培训", "合同", "保险", "责任", "保密"},
    "tech":     {"技术", "规格", "参数", "标准", "规范", "性能", "指标", "配置", "功能"},
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

在段落分配 `groupToParagraphs` 时，如果当前组是 "info" 且段落内容匹配关键词，使用 `detectContentGroup` 的结果。

## 不做的功能

- 不重新解析 docx 文档结构（仅基于段落文本判断）
- 不处理嵌套章节（扁平化处理）
- 不修改已有标题样式检测逻辑