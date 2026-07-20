package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/unidoc/unioffice/v3/common/license"
	"github.com/unidoc/unioffice/v3/document"
)

func init() {
	// Trial mode: empty license key. For production, set UNIDOC_LICENSE_KEY env var
	// to your paid unidoc metered license key. Without a valid key, documents may
	// carry a watermark and the service is for evaluation only.
	lk := os.Getenv("UNIDOC_LICENSE_KEY")
	if lk == "" {
		lk = "" // leave empty for trial/evaluation
	}
	license.SetMeteredKey(lk)
}

type ParseRequest struct {
	FilePath string `json:"file_path"`
	Rules    []Rule `json:"rules,omitempty"`
}

type Rule struct {
	Name     string `json:"name"`
	Pattern  string `json:"pattern"`
	Category string `json:"category"`
	Group    string `json:"group"`
}

type Chapter struct {
	Title   string   `json:"title"`
	Content []string `json:"content"`
	Page    int      `json:"page"`
}

type TableRow struct {
	Cells []string `json:"cells"`
}

type DocTable struct {
	Rows []TableRow `json:"rows"`
}

type MarkedItem struct {
	Symbol string `json:"symbol"`
	Text   string `json:"text"`
	Page   int    `json:"page"`
}

type ParseResponse struct {
	Status       string                 `json:"status"`
	Text         string                 `json:"text,omitempty"`
	Extracts     map[string]interface{} `json:"extracts,omitempty"`
	Groups       map[string]string      `json:"groups,omitempty"`
	Chapters     []Chapter              `json:"chapters,omitempty"`
	Tables       []DocTable             `json:"tables,omitempty"`
	MarkedItems  []MarkedItem           `json:"markedItems,omitempty"`
	FieldParaMap map[string]int         `json:"fieldParaMap,omitempty"`
	FieldGroups  map[string]string      `json:"fieldGroups,omitempty"`
	PageCount    int                    `json:"pageCount,omitempty"`
	ParaToPage   []int                  `json:"paraToPage,omitempty"`
	Error        string                 `json:"error,omitempty"`
}

func paragraphText(p document.Paragraph) string {
	var sb strings.Builder
	for _, r := range p.Runs() {
		sb.WriteString(r.Text())
	}
	return sb.String()
}

func isHeading(para document.Paragraph) (bool, int) {
	props := para.X().PPr
	if props != nil && props.PStyle != nil {
		styleVal := props.PStyle.ValAttr
		for i := 1; i <= 9; i++ {
			if styleVal == fmt.Sprintf("Heading%d", i) || styleVal == fmt.Sprintf("heading%d", i) ||
				styleVal == fmt.Sprintf("Heading %d", i) || styleVal == fmt.Sprintf("heading %d", i) ||
				styleVal == fmt.Sprintf("标题%d", i) || styleVal == fmt.Sprintf("标题 %d", i) {
				return true, i
			}
		}
	}
	return false, 0
}

func hasPageBreak(para document.Paragraph) bool {
	for _, run := range para.Runs() {
		runBytes, err := xml.Marshal(run.X())
		if err != nil {
			continue
		}
		xmlStr := string(runBytes)
		if strings.Contains(xmlStr, `w:type="page"`) ||
			strings.Contains(xmlStr, `lastRenderedPageBreak`) {
			return true
		}
	}
	return false
}

var sectionKeywords = map[string][]string{
	"info":     {"项目信息", "项目概况", "招标公告", "投标邀请", "招标条件", "投标须知", "投标人须知", "招标说明", "项目背景", "采购内容"},
	"business": {"商务条款", "投标人资格", "资格要求", "资质要求", "商务要求", "合同条款", "付款方式", "交付要求", "售后服务", "质保要求", "联合体", "分包", "转包"},
	"tech":     {"技术规格", "技术要求", "技术参数", "技术标准", "技术需求", "采购需求", "货物需求", "服务需求", "技术规范", "验收标准", "安装调试", "培训"},
	"score":    {"评分标准", "评标办法", "评审办法", "评分细则", "综合评分", "评分因素", "评分项", "打分标准", "定标原则", "评标方法", "评分表", "分值分配"},
}

func detectSection(title string) string {
	for group, keywords := range sectionKeywords {
		for _, kw := range keywords {
			if strings.Contains(title, kw) {
				return group
			}
		}
	}
	return "info"
}

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
	return false, "info"
}

var contentGroupKeywords = map[string][]string{
	"score":    {"评分", "分值", "得分", "打分", "评审", "权重"},
	"business": {"付款", "质保", "售后", "交付", "验收", "培训", "合同", "保险", "责任", "保密", "履约", "保证金"},
	"tech":     {"技术参数", "技术指标", "技术规格", "技术规范", "安装调试", "性能指标", "性能参数", "配置要求", "功能要求", "测试", "总体要求", "信号", "接口", "眼图", "抖动", "扩频", "时域", "国产", "验证", "系统配置", "时钟芯片", "基准测试", "部署", "监控", "功能验证", "高阻负载", "上升时间", "下降时间"},
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

func extractDocxWithChapters(filePath string) (string, []Chapter, []string, map[string][]string, []int, int, []DocTable, error) {
	doc, err := document.Open(filePath)
	if err != nil {
		return "", nil, nil, nil, nil, 0, nil, fmt.Errorf("failed to open docx: %w", err)
	}
	defer doc.Close()

	var paragraphs []string
	var chapters []Chapter
	var currentChapter *Chapter
	pageCount := 0
	paraIndex := 0
	groupToParagraphs := make(map[string][]string)
	paraToPage := []int{}
	currentGroup := "info"
	sectionStructured := false

	for _, para := range doc.Paragraphs() {
		text := strings.TrimSpace(paragraphText(para))
		if text == "" {
			paraIndex++
			continue
		}

		paragraphs = append(paragraphs, text)

		isHead, level := isHeading(para)
		if isHead && level <= 3 {
			sectionStructured = true
			if currentChapter != nil {
				chapters = append(chapters, *currentChapter)
			}
			currentChapter = &Chapter{
				Title:   text,
				Content: []string{},
				Page:    pageCount + 1,
			}
			currentGroup = detectSection(text)
		} else {
			if isStart, sg := isSectionStart(text); isStart {
				sectionStructured = true
				if currentChapter != nil {
					chapters = append(chapters, *currentChapter)
				}
				currentGroup = sg
				currentChapter = &Chapter{
					Title:   text,
					Content: []string{},
					Page:    pageCount + 1,
				}
			} else if currentChapter != nil {
				currentChapter.Content = append(currentChapter.Content, text)
			}
		}

		usedGroup := currentGroup
		if usedGroup == "info" && sectionStructured {
			if cg := detectContentGroup(text); cg != "info" {
				usedGroup = cg
			}
		}
		groupToParagraphs[usedGroup] = append(groupToParagraphs[usedGroup], text)
		if hasPageBreak(para) {
			pageCount++
		}
		paraToPage = append(paraToPage, pageCount+1)
		paraIndex++
	}

	if currentChapter != nil {
		chapters = append(chapters, *currentChapter)
	}

	if pageCount == 0 && len(paragraphs) > 0 {
		paraToPage = make([]int, len(paragraphs))
		for i := range paragraphs {
			paraToPage[i] = i/40 + 1
		}
	}

	fullText := strings.Join(paragraphs, "\n")

	// Extract tables in the same opened document (no second file open)
	var tables []DocTable
	for _, tbl := range doc.Tables() {
		var dt DocTable
		for _, row := range tbl.Rows() {
			var tr TableRow
			for _, cell := range row.Cells() {
				var cellText string
				for _, para := range cell.Paragraphs() {
					t := strings.TrimSpace(paragraphText(para))
					if t != "" {
						if cellText != "" {
							cellText += "\n"
						}
						cellText += t
					}
				}
				tr.Cells = append(tr.Cells, cellText)
			}
			dt.Rows = append(dt.Rows, tr)
		}
		tables = append(tables, dt)
	}

	return fullText, chapters, paragraphs, groupToParagraphs, paraToPage, pageCount, tables, nil
}

func extractMarkedItems(paragraphs []string, paraToPage []int) []MarkedItem {
	starSymbols := []string{"★", "☆", "▲", "△", "●", "○", "◆", "◇", "※", "⚠", "♦", "▸", "▹", "►", "▻", "★", "✦", "✧", "⬤", "🔴", "⭐", "❗"}
	var items []MarkedItem
	for i, para := range paragraphs {
		for _, sym := range starSymbols {
			if strings.Contains(para, sym) {
				page := 1
				if i < len(paraToPage) {
					page = paraToPage[i]
				}
				text := strings.TrimSpace(para)
				if len([]rune(text)) > 120 {
					text = string([]rune(text)[:120]) + "..."
				}
				items = append(items, MarkedItem{Symbol: sym, Text: text, Page: page})
				break
			}
		}
	}
	return items
}

func findFieldParagraphs(extracts map[string]interface{}, paragraphs []string, groupToParagraphs map[string][]string) (map[string]int, map[string]string) {
	result := make(map[string]int)
	fieldGroups := make(map[string]string)

	// Build reverse map: paragraph text -> group name for O(1) lookup
	paraToGroup := make(map[string]string)
	for gName, gParas := range groupToParagraphs {
		for _, gp := range gParas {
			paraToGroup[gp] = gName
		}
	}

	for field, val := range extracts {
		valStr := strings.TrimSpace(fmt.Sprintf("%v", val))
		if valStr == "" {
			continue
		}
		valSample := string([]rune(valStr)[:min(len([]rune(valStr)), 30)])
		bestIdx := -1
		bestScore := 0

		for i, para := range paragraphs {
			score := 0
			if strings.Contains(para, valSample) {
				score += 100
			}
			fi := strings.Index(para, field)
			if fi >= 0 {
				score += 50 - fi
			}
			if score > bestScore {
				bestScore = score
				bestIdx = i
			}
		}

		if bestIdx < 0 {
			for i, para := range paragraphs {
				if strings.Contains(para, field) {
					bestIdx = i
					break
				}
			}
		}
		if bestIdx >= 0 {
			result[field] = bestIdx
			paraText := paragraphs[bestIdx]
			if g, ok := paraToGroup[paraText]; ok {
				fieldGroups[field] = g
			} else {
				fieldGroups[field] = "info"
			}
		}
	}
	return result, fieldGroups
}

func extractPdfText(filePath string) (string, []Chapter, []string, map[string][]string, []int, int, []DocTable, error) {
	return "", nil, nil, nil, nil, 0, nil, fmt.Errorf("PDF parsing not implemented yet")
}

func extractText(filePath string) (string, []Chapter, []string, map[string][]string, []int, int, []DocTable, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".docx":
		return extractDocxWithChapters(filePath)
	case ".pdf":
		return extractPdfText(filePath)
	case ".doc":
		return "", nil, nil, nil, nil, 0, nil, fmt.Errorf(".doc format not supported, please convert to .docx")
	default:
		return "", nil, nil, nil, nil, 0, nil, fmt.Errorf("unsupported format: %s", ext)
	}
}

func extractStructuredValue(afterText string) (string, bool) {
	patterns := []string{
		`[¥￥](\d[\d,]*\.?\d*)`,
		`(\d+(?:,\d{3})*(?:\.\d{2})?)\s*元`,
		`(\d+(?:\.\d+)?)\s*[万億億]\s*元`,
		`(\d+(?:\.\d+)?)\s*%`,
		`(\d{4}年\d{1,2}月\d{1,2}日)`,
		`(\d{4}-\d{2}-\d{2})`,
		`(\d{1,2}月\d{1,2}日)`,
		`(\d+(?:\.\d+)?)\s*分`,
		`满分\s*(\d+)`,
		`分值\s*(\d+)`,
	}
	for _, p := range patterns {
		re, err := regexp.Compile(p)
		if err != nil {
			continue
		}
		m := re.FindStringSubmatch(afterText)
		if len(m) > 1 && strings.TrimSpace(m[1]) != "" {
			return strings.TrimSpace(m[1]), true
		}
	}
	return "", false
}

func extractFromTables(tables []DocTable, keyword string) (string, bool) {
	for _, tbl := range tables {
		// Find which column index contains the keyword in the header row
		colIdx := -1
		if len(tbl.Rows) == 0 {
			continue
		}
		for ci, cell := range tbl.Rows[0].Cells {
			if strings.Contains(cell, keyword) {
				colIdx = ci
				break
			}
		}
		if colIdx < 0 {
			continue
		}
		// Search data rows for the keyword in the first column (e.g. "分值")
		for ri := 1; ri < len(tbl.Rows); ri++ {
			row := tbl.Rows[ri]
			if len(row.Cells) <= colIdx {
				continue
			}
			firstCell := strings.TrimSpace(row.Cells[0])
			if firstCell == "分值" || firstCell == "分数" || firstCell == "得分" ||
				strings.Contains(firstCell, "分值") || strings.Contains(firstCell, "得分") {
				val := strings.TrimSpace(row.Cells[colIdx])
				if val != "" {
					m := regexp.MustCompile(`(\d+(?:\.\d+)?)`).FindStringSubmatch(val)
					if len(m) > 1 {
						return m[1] + "分", true
					}
					return val, true
				}
			}
		}
	}
	return "", false
}

func extractByKeyword(paragraphs []string, keyword string, reverse bool) (string, bool) {
	type scoredMatch struct {
		index int     // character index of keyword in paragraph (lower = better)
		pos   int     // paragraph index
		para  string  // the paragraph text
	}

	var candidates []scoredMatch
	start := 0
	step := 1
	if reverse {
		start = len(paragraphs) - 1
		step = -1
	}
	for i := start; i >= 0 && i < len(paragraphs); i += step {
		para := paragraphs[i]
		idx := strings.Index(para, keyword)
		if idx < 0 {
			continue
		}
		candidates = append(candidates, scoredMatch{index: idx, pos: i, para: para})
	}

	if len(candidates) == 0 {
		return "", false
	}

	// Prefer matches near the beginning of the paragraph (lower idx = higher priority)
	best := candidates[0]
	for _, c := range candidates[1:] {
		if c.index < best.index {
			best = c
		}
	}

	idx := best.index
	i := best.pos
	para := best.para

	after := para[idx+len(keyword):]
	after = strings.TrimSpace(after)
	after = strings.TrimLeft(after, "：: \t,-—–")
	after = strings.TrimSpace(after)

	if len([]rune(after)) >= 2 {
		if val, ok := extractStructuredValue(after); ok {
			return val, true
		}
		// Multi-paragraph concatenation: if value ends with colon or is short,
		// look at the next paragraphs and append them
		runes := []rune(after)
		lastRune := string(runes[len(runes)-1:])
		if lastRune == "：" || lastRune == ":" || len(runes) < 6 {
			for j := i + 1; j < len(paragraphs) && j <= i+3; j++ {
				nextPara := strings.TrimSpace(paragraphs[j])
				if nextPara == "" {
					continue
				}
				combined := after + "\n" + nextPara
				if len([]rune(combined)) > 500 {
					after = after + "\n" + string([]rune(nextPara)[:200])
					break
				}
				after = combined
			}
		}
		runes = []rune(after)
		if len(runes) > 80 {
			after = string(runes[:80])
		}
		if dot := strings.IndexAny(after, "。；"); dot > 0 {
			after = after[:dot]
		}
		after = strings.TrimSpace(after)
		if len([]rune(after)) >= 2 {
			return after, true
		}
	}

	before := strings.TrimSpace(para[:idx])
	if before != "" {
		runes := []rune(before)
		if len(runes) > 80 {
			before = string(runes[:80])
		}
		if dot := strings.IndexAny(before, "。；"); dot > 0 {
			before = before[:dot]
		}
		before = strings.TrimSpace(before)
		if len([]rune(before)) >= 2 {
			return before, true
		}
	}
	return "", false
}

func matchSpecificity(match string) int {
	digits := 0
	runes := 0
	for _, r := range match {
		if r >= '0' && r <= '9' {
			digits++
		}
		runes++
	}
	if runes == 0 {
		return 0
	}
	if digits > 0 {
		return 100 + digits*10 - runes
	}
	return 50 - runes
}

var compiledRulesCache sync.Map

func getCompiledRules(rules []Rule) map[string]*regexp.Regexp {
	cache := make(map[string]*regexp.Regexp)
	for _, rule := range rules {
		if rule.Pattern == "" {
			continue
		}
		if _, loaded := cache[rule.Name]; loaded {
			continue
		}
		if re, ok := compiledRulesCache.Load(rule.Pattern); ok {
			cache[rule.Name] = re.(*regexp.Regexp)
		} else {
			re, err := regexp.Compile(rule.Pattern)
			if err != nil {
				continue
			}
			compiledRulesCache.Store(rule.Pattern, re)
			cache[rule.Name] = re
		}
	}
	return cache
}

func applyRules(text string, rules []Rule, paragraphs []string, groupToParagraphs map[string][]string, tables []DocTable) (map[string]interface{}, map[string]string) {
	extracts := make(map[string]interface{})
	groups := make(map[string]string)
	bestScore := make(map[string]int)

	// Pre-compile all regex patterns once
	preCompiled := getCompiledRules(rules)

	for _, rule := range rules {
		g := rule.Group
		if g == "" {
			g = "info"
		}

		scope := paragraphs
		if groupToParagraphs != nil {
			if gp, ok := groupToParagraphs[g]; ok && len(gp) > 0 {
				scope = gp
			}
		}

		if rule.Category == "keyword" || rule.Pattern == "" {
			if g == "score" && tables != nil {
				if val, found := extractFromTables(tables, rule.Name); found {
					sc := matchSpecificity(val)
					if prev, exists := bestScore[rule.Name]; !exists || sc > prev {
						extracts[rule.Name] = val
						groups[rule.Name] = g
						bestScore[rule.Name] = sc
					}
					continue
				}
			}
			if scope != nil {
				if val, found := extractByKeyword(scope, rule.Name, g == "score"); found {
					sc := matchSpecificity(val)
					if prev, exists := bestScore[rule.Name]; !exists || sc > prev {
						extracts[rule.Name] = val
						groups[rule.Name] = g
						bestScore[rule.Name] = sc
					}
					continue
				}
			}
			if rule.Pattern == "" {
				continue
			}
		}

		// Use pre-compiled regex
		re, hasPreCompiled := preCompiled[rule.Name]
		if !hasPreCompiled {
			var err error
			re, err = regexp.Compile(rule.Pattern)
			if err != nil {
				continue
			}
		}

		matches := re.FindStringSubmatch(text)
		if len(matches) > 1 {
			val := strings.TrimSpace(matches[1])
			sc := matchSpecificity(val)
			if prev, exists := bestScore[rule.Name]; !exists || sc > prev {
				extracts[rule.Name] = val
				groups[rule.Name] = g
				bestScore[rule.Name] = sc
			}
		} else if len(matches) == 1 {
			val := strings.TrimSpace(matches[0])
			sc := matchSpecificity(val)
			if prev, exists := bestScore[rule.Name]; !exists || sc > prev {
				extracts[rule.Name] = val
				groups[rule.Name] = g
				bestScore[rule.Name] = sc
			}
		}
	}
	return extracts, groups
}

func main() {
	decoder := json.NewDecoder(os.Stdin)
	var req ParseRequest
	if err := decoder.Decode(&req); err != nil {
		resp := ParseResponse{Status: "error", Error: "invalid input: " + err.Error()}
		output, _ := json.Marshal(resp)
		fmt.Println(string(output))
		return
	}

	text, chapters, paragraphs, groupToParagraphs, paraToPage, pageCount, tables, err := extractText(req.FilePath)
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

	if tables == nil {
		tables = []DocTable{}
	}

	extracts, groups := applyRules(text, req.Rules, paragraphs, groupToParagraphs, tables)

	if chapters == nil {
		chapters = []Chapter{}
	}

	markedItems := extractMarkedItems(paragraphs, paraToPage)
	if markedItems == nil {
		markedItems = []MarkedItem{}
	}

	fieldParaMap, fieldGroups := findFieldParagraphs(extracts, paragraphs, groupToParagraphs)

	resp := ParseResponse{
		Status:       "ok",
		Text:         text,
		Extracts:     extracts,
		Groups:       groups,
		Chapters:     chapters,
		Tables:       tables,
		MarkedItems:  markedItems,
		FieldParaMap: fieldParaMap,
		FieldGroups:  fieldGroups,
		PageCount:   pageCount,
		ParaToPage:  paraToPage,
	}
	output, _ := json.Marshal(resp)
	fmt.Println(string(output))
}
