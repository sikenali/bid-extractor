package main

import (
	"encoding/json"
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

func extractDocxWithChapters(filePath string) (string, []Chapter, []string, int, error) {
	doc, err := document.Open(filePath)
	if err != nil {
		return "", nil, nil, 0, fmt.Errorf("failed to open docx: %w", err)
	}
	defer doc.Close()

	var paragraphs []string
	var chapters []Chapter
	var currentChapter *Chapter
	pageCount := 0
	paraIndex := 0

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
		} else if currentChapter != nil {
			currentChapter.Content = append(currentChapter.Content, text)
		}

		paraIndex++
	}

	if currentChapter != nil {
		chapters = append(chapters, *currentChapter)
	}

	fullText := strings.Join(paragraphs, "\n")
	return fullText, chapters, paragraphs, pageCount, nil
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

func extractPdfText(filePath string) (string, []Chapter, []string, int, error) {
	return "", nil, nil, 0, fmt.Errorf("PDF parsing not implemented yet")
}

func extractText(filePath string) (string, []Chapter, []string, int, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".docx":
		return extractDocxWithChapters(filePath)
	case ".pdf":
		return extractPdfText(filePath)
	case ".doc":
		return "", nil, nil, 0, fmt.Errorf(".doc format not supported, please convert to .docx")
	default:
		return "", nil, nil, 0, fmt.Errorf("unsupported format: %s", ext)
	}
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
		if len([]rune(after)) > 0 {
			return after, true
		}
	}
	return "", false
}

func applyRules(text string, rules []Rule, paragraphs []string) (map[string]interface{}, map[string]string) {
	extracts := make(map[string]interface{})
	groups := make(map[string]string)
	for _, rule := range rules {
		g := rule.Group
		if g == "" {
			g = "info"
		}

		// 1. keyword strategy  —  paragraph-level field name lookup
		if rule.Category == "keyword" || rule.Pattern == "" {
			if paragraphs != nil {
				if val, found := extractByKeyword(paragraphs, rule.Name); found {
					extracts[rule.Name] = val
					groups[rule.Name] = g
					continue
				}
			}
			// fallback — try regex on full text if pattern exists
			if rule.Pattern == "" {
				continue
			}
		}

		// 2. regex strategy
		re, err := regexp.Compile(rule.Pattern)
		if err != nil {
			continue
		}
		matches := re.FindStringSubmatch(text)
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

	text, chapters, paragraphs, _, err := extractText(req.FilePath)
	if err != nil {
		resp := ParseResponse{Status: "error", Error: err.Error()}
		output, _ := json.Marshal(resp)
		fmt.Println(string(output))
		return
	}

	if paragraphs == nil {
		paragraphs = strings.Split(text, "\n")
	}

	extracts, groups := applyRules(text, req.Rules, paragraphs)

	if chapters == nil {
		chapters = []Chapter{}
	}

	tables := extractDocxTables(req.FilePath)
	if tables == nil {
		tables = []DocTable{}
	}

	resp := ParseResponse{
		Status:    "ok",
		Text:      text,
		Extracts:  extracts,
		Groups:    groups,
		Chapters:  chapters,
		Tables:    tables,
		PageCount: len(chapters),
	}
	output, _ := json.Marshal(resp)
	fmt.Println(string(output))
}
