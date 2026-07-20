package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/unidoc/unioffice/v2/common/license"
	"github.com/unidoc/unioffice/v2/document"
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
	"info":     {"项目信息", "项目概况", "招标公告", "投标邀请", "招标条件", "投标须知", "投标人须知", "招标说明", "项目背景", "采购内容", "项目概述", "采购公告", "项目简介", "招标范围", "项目来源", "资金来源"},
	"business": {"商务条款", "投标人资格", "资格要求", "资质要求", "商务要求", "合同条款", "付款方式", "交付要求", "售后服务", "质保要求", "联合体", "分包", "转包", "合同范本", "履约担保", "合同生效", "合同解除", "违约责任", "合同价款", "付款条件", "质保期", "保修期", "售后服务要求", "培训要求", "验收要求", "验收标准", "知识产权", "保密条款", "不可抗力", "争议解决", "诉讼", "仲裁"},
	"tech":     {"技术规格", "技术要求", "技术参数", "技术标准", "技术需求", "采购需求", "货物需求", "服务需求", "技术规范", "验收标准", "安装调试", "培训", "技术方案", "技术路线", "技术架构", "设备清单", "配置清单", "功能需求", "性能要求", "性能指标", "技术指标", "运行环境", "系统要求", "接口要求", "数据安全", "网络安全", "兼容要求", "可扩展性"},
	"score":    {"评分标准", "评标办法", "评审办法", "评分细则", "综合评分", "评分因素", "评分项", "打分标准", "定标原则", "评标方法", "评分表", "分值分配", "评标标准", "评审标准", "评分方法", "价格分", "技术分", "商务分", "客观评分", "主观评分", "加分项", "扣分项"},
	"seal":     {"封标", "密封", "封装", "正本", "副本", "电子文件", "密封袋", "密封条", "盖章", "签字", "递交", "邮寄", "现场递交", "封标要求", "密封要求", "封装方式", "密封处", "骑缝章", "外包装", "内包装", "密封袋标识", "外层信封", "内层信封", "密封截止时间", "递交方式", "纸质文件", "电子标书", "U盘", "光盘", "加密", "解密", "开标时", "拆封", "封条", "密封章", "签章", "法人章", "公章"},
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
	"seal":     {"封标", "密封", "封装", "正本", "副本", "电子文件", "密封袋", "密封条", "盖章", "递交", "邮寄", "现场递交", "封标要求", "密封要求", "封装方式", "密封处", "骑缝章", "外包装", "内包装", "密封袋标识", "外层信封", "内层信封", "密封截止时间", "递交方式", "纸质文件", "电子标书", "U盘", "光盘", "加密", "拆封", "封条", "密封章"},
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
		// Estimate pages based on average paragraph length
		// Typical A4 page holds ~800-1200 Chinese characters
		totalChars := 0
		for _, p := range paragraphs {
			totalChars += len([]rune(p))
		}
		avgCharsPerPage := 1000.0
		estimatedPages := int(math.Ceil(float64(totalChars) / avgCharsPerPage))
		if estimatedPages < 1 {
			estimatedPages = 1
		}
		// Distribute paragraphs across estimated pages proportionally
		charsPerPage := float64(totalChars) / float64(estimatedPages)
		accumulated := 0
		paraToPage = make([]int, len(paragraphs))
		currentPage := 1
		for i, p := range paragraphs {
			accumulated += len([]rune(p))
			paraToPage[i] = currentPage
			if float64(accumulated) >= charsPerPage*float64(currentPage) {
				currentPage++
			}
		}
		pageCount = estimatedPages
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

	// Also build a field-to-group mapping from extracts
	fieldToGroup := make(map[string]string)
	for field, grp := range extracts {
		if g, ok := grp.(string); ok {
			fieldToGroup[field] = g
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

		// Priority 1: Match by value sample (most reliable)
		for i, para := range paragraphs {
			score := 0
			if strings.Contains(para, valSample) {
				score += 100
			}
			// Bonus for exact value match
			if strings.Contains(para, valStr) {
				score += 50
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

		// Priority 2: If value-based search failed, search by field name only
		if bestIdx < 0 {
			for i, para := range paragraphs {
				if strings.Contains(para, field) {
					bestIdx = i
					break
				}
			}
		}

		// Priority 3: Group-scoped fallback
		if bestIdx < 0 {
			if targetGroup, ok := fieldToGroup[field]; ok {
				if gp, ok2 := groupToParagraphs[targetGroup]; ok2 {
					for _, gpText := range gp {
						if strings.Contains(gpText, field) {
							// Find the index in all paragraphs
							for i, p := range paragraphs {
								if p == gpText {
									bestIdx = i
									break
								}
							}
							if bestIdx >= 0 {
								break
							}
						}
					}
				}
			}
		}

		if bestIdx >= 0 {
			result[field] = bestIdx
			paraText := paragraphs[bestIdx]
			if g, ok := paraToGroup[paraText]; ok {
				fieldGroups[field] = g
			} else {
				// Use the known field group as fallback
				if g, ok := fieldToGroup[field]; ok {
					fieldGroups[field] = g
				} else {
					fieldGroups[field] = "info"
				}
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
		// Money amounts (most common in bidding docs)
		`[¥￥](\d[\d,]*\.?\d*)`,
		`(\d+(?:,\d{3})*(?:\.\d{2})?)\s*元`,
		`(?:人民币\s*)?[¥￥]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*元`,
		`(\d+(?:\.\d+)?)\s*[万億億]\s*元`,
		// Percentages
		`(\d+(?:\.\d+)?)\s*%`,
		// Dates
		`(\d{4}年\d{1,2}月\d{1,2}日)`,
		`(\d{4}-\d{2}-\d{2})`,
		`(\d{1,2}月\d{1,2}日)`,
		// Scores/points
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

func extractFromTableCells(tables []DocTable, keyword string) (string, bool) {
	for _, tbl := range tables {
		if len(tbl.Rows) < 2 {
			continue
		}
		headerSet := make(map[string]bool)
		for _, cell := range tbl.Rows[0].Cells {
			headerSet[strings.TrimSpace(cell)] = true
		}

		// Strategy 1: Same row, adjacent cell (ci+1) — existing
		// Strategy 2: Same row, text after keyword in same cell — existing
		// Strategy 3: Same column, next row (vertical key-value)
		// Strategy 4: Any cell contains keyword (not just starts with), then grab adjacent cell value
		// Strategy 5: If keyword found in header row, find the value in ALL data rows for that column

		// Strategy 5 first: find keyword in header, then scan all data rows for that column
		colIdx := -1
		for ci, cell := range tbl.Rows[0].Cells {
			trimmed := strings.TrimSpace(cell)
			if trimmed == keyword || strings.HasPrefix(trimmed, keyword+":") || strings.HasPrefix(trimmed, keyword+"：") {
				colIdx = ci
				break
			}
		}
		if colIdx >= 0 {
			for ri := 1; ri < len(tbl.Rows); ri++ {
				row := tbl.Rows[ri]
				if len(row.Cells) <= colIdx {
					continue
				}
				val := strings.TrimSpace(row.Cells[colIdx])
				if val != "" && !headerSet[val] {
					return val, true
				}
			}
		}

		// Strategies 1-4: iterate data rows
		for ri := 1; ri < len(tbl.Rows); ri++ {
			row := tbl.Rows[ri]
			for ci, cell := range row.Cells {
				trimmed := strings.TrimSpace(cell)
				matchesKeyword := trimmed == keyword || strings.HasPrefix(trimmed, keyword+":") || strings.HasPrefix(trimmed, keyword+"：")
				containsKeyword := strings.Contains(trimmed, keyword)

				if matchesKeyword || containsKeyword {
					// Strategy 1: same row, adjacent cell (ci+1)
					if ci+1 < len(row.Cells) {
						val := strings.TrimSpace(row.Cells[ci+1])
						if val != "" && !headerSet[val] {
							return val, true
						}
					}

					// Strategy 2: text after keyword in same cell
					after := ""
					if matchesKeyword {
						after = trimmed[len(keyword):]
					} else {
						ki := strings.Index(trimmed, keyword)
						after = trimmed[ki+len(keyword):]
					}
					after = strings.TrimLeft(after, "：: \t,-—–")
					after = strings.TrimSpace(after)
					if after != "" && !headerSet[after] {
						return after, true
					}

					// Strategy 4: check ALL other cells in the row for value
					bestVal := ""
					bestSc := 0
					for ci2 := range row.Cells {
						if ci2 == ci {
							continue
						}
						candidate := strings.TrimSpace(row.Cells[ci2])
						if candidate == "" {
							continue
						}
						if headerSet[candidate] {
							continue
						}
						sc := matchSpecificity(candidate)
						if sc > bestSc {
							bestSc = sc
							bestVal = candidate
						}
					}
					if bestVal != "" {
						return bestVal, true
					}

					// Strategy 3: same column, next row (vertical key-value)
					if ri+1 < len(tbl.Rows) {
						nextRow := tbl.Rows[ri+1]
						if len(nextRow.Cells) > ci {
							val := strings.TrimSpace(nextRow.Cells[ci])
							if val != "" && !headerSet[val] {
								return val, true
							}
						}
					}
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

	// --- Extract text AFTER keyword (existing logic) ---
	after := para[idx+len(keyword):]
	after = strings.TrimSpace(after)
	after = strings.TrimLeft(after, "：: \t,-—–")
	after = strings.TrimSpace(after)

	afterVal := ""
	if len([]rune(after)) >= 2 {
		if val, ok := extractStructuredValue(after); ok {
			afterVal = val
		} else {
			// Multi-paragraph concatenation: if value ends with colon or is short,
			// look at the next paragraphs and append them
			runes := []rune(after)
			lastRune := string(runes[len(runes)-1:])
			if lastRune == "：" || lastRune == ":" || len(runes) < 6 {
				for j := i + 1; j < len(paragraphs) && j <= i+8; j++ {
					nextPara := strings.TrimSpace(paragraphs[j])
					if nextPara == "" {
						continue
					}
					// Stop early at section boundaries or strong delimiters
					if strings.HasPrefix(nextPara, "一、") || strings.HasPrefix(nextPara, "二、") ||
						strings.HasPrefix(nextPara, "三、") || strings.HasPrefix(nextPara, "四、") ||
						strings.HasPrefix(nextPara, "五、") || strings.HasPrefix(nextPara, "六、") ||
						strings.HasPrefix(nextPara, "（一）") || strings.HasPrefix(nextPara, "（二）") ||
						strings.HasPrefix(nextPara, "（三）") || strings.HasPrefix(nextPara, "（四）") ||
						strings.HasPrefix(nextPara, "（五）") ||
						strings.HasPrefix(nextPara, "第") && strings.Contains(nextPara, "章") ||
						strings.HasPrefix(nextPara, "第") && strings.Contains(nextPara, "节") {
						break
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
			if len(runes) > 120 {
				after = string(runes[:120])
			}
			if dot := strings.IndexAny(after, "。；\n"); dot > 0 {
				after = after[:dot]
			}
			after = strings.TrimSpace(after)
			if len([]rune(after)) >= 2 {
				afterVal = after
			}
		}
	}

	// --- Extract text BEFORE keyword (existing logic + lookbehind) ---
	beforeVal := ""
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
			beforeVal = before
		}
	}

	// Lookbehind: check 1-2 paragraphs BEFORE the keyword in case value starts earlier
	if i > 0 {
		for lb := 1; lb <= 2 && i-lb >= 0; lb++ {
			lbPara := strings.TrimSpace(paragraphs[i-lb])
			if lbPara == "" {
				continue
			}
			// Stop at section boundaries
			if strings.HasPrefix(lbPara, "一、") || strings.HasPrefix(lbPara, "二、") ||
				strings.HasPrefix(lbPara, "三、") || strings.HasPrefix(lbPara, "四、") ||
				strings.HasPrefix(lbPara, "（一）") || strings.HasPrefix(lbPara, "（二）") ||
				strings.HasPrefix(lbPara, "（三）") || strings.HasPrefix(lbPara, "（四）") ||
				strings.HasPrefix(lbPara, "第") && strings.Contains(lbPara, "章") {
				break
			}
			lbRunes := []rune(lbPara)
			if len(lbRunes) > 80 {
				lbPara = string(lbRunes[:80])
			}
			combinedBefore := lbPara + " " + beforeVal
			if beforeVal == "" {
				combinedBefore = lbPara
			}
			if dot := strings.IndexAny(combinedBefore, "。；"); dot > 0 {
				combinedBefore = combinedBefore[:dot]
			}
			combinedBefore = strings.TrimSpace(combinedBefore)
			if len([]rune(combinedBefore)) >= 2 {
				beforeVal = combinedBefore
			}
			break // only check first non-empty preceding paragraph
		}
	}

	// --- Pick the better result by scoring ---
	if afterVal != "" && beforeVal != "" {
		afterSc := matchSpecificity(afterVal)
		beforeSc := matchSpecificity(beforeVal)
		if afterSc >= beforeSc {
			return afterVal, true
		}
		return beforeVal, true
	}
	if afterVal != "" {
		return afterVal, true
	}
	if beforeVal != "" {
		return beforeVal, true
	}
	return "", false
}

const (
	priorityTable       = 1000
	priorityRegexExact  = 800
	priorityKeyword     = 500
	priorityFallback    = 100
)

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

func scoreWithPriority(val string, methodPriority int) int {
	base := matchSpecificity(val)
	return methodPriority + base
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

		// Change 3: Try global scope first, then group-scoped as fallback
		// Build full-scope paragraph lists from all groups
		allParagraphs := paragraphs
		if allParagraphs == nil {
			allParagraphs = []string{}
			for _, gp := range groupToParagraphs {
				allParagraphs = append(allParagraphs, gp...)
			}
		}

		if rule.Category == "keyword" || rule.Pattern == "" {
			// Change 4: Apply table extraction to ALL groups, not just score
			if tables != nil {
				if val, found := extractFromTableCells(tables, rule.Name); found {
					sc := scoreWithPriority(val, priorityTable)
					if prev, exists := bestScore[rule.Name]; !exists || sc > prev {
						extracts[rule.Name] = val
						groups[rule.Name] = g
						bestScore[rule.Name] = sc
					}
					continue
				}
			}
			if tables != nil {
				if val, found := extractFromTables(tables, rule.Name); found {
					sc := scoreWithPriority(val, priorityTable)
					if prev, exists := bestScore[rule.Name]; !exists || sc > prev {
						extracts[rule.Name] = val
						groups[rule.Name] = g
						bestScore[rule.Name] = sc
					}
					continue
				}
			}
			// Change 3: Search ALL paragraphs first (global scope)
			if val, found := extractByKeyword(allParagraphs, rule.Name, g == "score"); found {
				sc := scoreWithPriority(val, priorityKeyword)
				if prev, exists := bestScore[rule.Name]; !exists || sc > prev {
					extracts[rule.Name] = val
					groups[rule.Name] = g
					bestScore[rule.Name] = sc
				}
			} else if groupToParagraphs != nil {
				// Fallback: try group-scoped search
				if gp, ok := groupToParagraphs[g]; ok && len(gp) > 0 {
					if val, found := extractByKeyword(gp, rule.Name, g == "score"); found {
						sc := scoreWithPriority(val, priorityKeyword)
						if prev, exists := bestScore[rule.Name]; !exists || sc > prev {
							extracts[rule.Name] = val
							groups[rule.Name] = g
							bestScore[rule.Name] = sc
						}
					}
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

	// Change 1: Try matching each paragraph individually first (local precision),
	// then fall back to full-text matching (global coverage)
	found := false
	val := ""
	sc := 0

	if allParagraphs != nil {
		for _, para := range allParagraphs {
			paraMatches := re.FindStringSubmatch(para)
				if len(paraMatches) > 1 {
					paraVal := strings.TrimSpace(paraMatches[1])
					paraSc := scoreWithPriority(paraVal, priorityRegexExact)
					if paraSc > sc {
						val = paraVal
						sc = paraSc
						found = true
						break
					}
				} else if len(paraMatches) == 1 {
					paraVal := strings.TrimSpace(paraMatches[0])
					paraSc := scoreWithPriority(paraVal, priorityRegexExact)
				if paraSc > sc {
					val = paraVal
					sc = paraSc
					found = true
					break
				}
			}
		}
	}

	// Fallback: if paragraph-level matching found nothing, try full text
	if !found && text != "" {
		matches := re.FindStringSubmatch(text)
		if len(matches) > 1 {
			val = strings.TrimSpace(matches[1])
			sc = scoreWithPriority(val, priorityRegexExact)
			found = true
		} else if len(matches) == 1 {
			val = strings.TrimSpace(matches[0])
			sc = scoreWithPriority(val, priorityRegexExact)
			found = true
		}
	}

		if found {
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
