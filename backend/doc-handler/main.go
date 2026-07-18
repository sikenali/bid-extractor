package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/unidoc/unioffice/v2/common/license"
	"github.com/unidoc/unioffice/v2/document"
)

func init() {
	// Set unioffice license key (empty = trial mode)
	license.SetMeteredKey("")
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

type ParseResponse struct {
	Status    string                 `json:"status"`
	Text      string                 `json:"text,omitempty"`
	Extracts  map[string]interface{} `json:"extracts,omitempty"`
	Groups    map[string]string      `json:"groups,omitempty"`
	Chapters  []Chapter              `json:"chapters,omitempty"`
	Tables    []DocTable             `json:"tables,omitempty"`
	PageCount int                    `json:"pageCount,omitempty"`
	ParaToPage []int                 `json:"paraToPage,omitempty"`
	Error     string                 `json:"error,omitempty"`
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

func extractDocxWithChapters(filePath string) (string, []Chapter, []string, map[string][]string, []int, int, error) {
	doc, err := document.Open(filePath)
	if err != nil {
		return "", nil, nil, nil, nil, 0, fmt.Errorf("failed to open docx: %w", err)
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
			currentChapter = &Chapter{
				Title:   text,
				Content: []string{},
				Page:    paraIndex + 1,
			}
			currentGroup = detectSection(text)
		} else if currentChapter != nil {
			currentChapter.Content = append(currentChapter.Content, text)
		}

		groupToParagraphs[currentGroup] = append(groupToParagraphs[currentGroup], text)
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
	return fullText, chapters, paragraphs, groupToParagraphs, paraToPage, pageCount, nil
}

func extractDocxTables(filePath string) []DocTable {
	doc, err := document.Open(filePath)
	if err != nil {
		return nil
	}
	defer doc.Close()

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
	return tables
}

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
		`^[：:]\s*([^。\n]{2,80})`,
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

func applyRules(text string, rules []Rule, paragraphs []string, groupToParagraphs map[string][]string) (map[string]interface{}, map[string]string) {
	extracts := make(map[string]interface{})
	groups := make(map[string]string)
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

func main() {
	decoder := json.NewDecoder(os.Stdin)
	var req ParseRequest
	if err := decoder.Decode(&req); err != nil {
		resp := ParseResponse{Status: "error", Error: "invalid input: " + err.Error()}
		output, _ := json.Marshal(resp)
		fmt.Println(string(output))
		return
	}

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

	if chapters == nil {
		chapters = []Chapter{}
	}

	tables := extractDocxTables(req.FilePath)
	if tables == nil {
		tables = []DocTable{}
	}

	resp := ParseResponse{
		Status:     "ok",
		Text:       text,
		Extracts:   extracts,
		Groups:     groups,
		Chapters:   chapters,
		Tables:     tables,
		PageCount:  len(chapters),
		ParaToPage: paraToPage,
	}
	output, _ := json.Marshal(resp)
	fmt.Println(string(output))
}
