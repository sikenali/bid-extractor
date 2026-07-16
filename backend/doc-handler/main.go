package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/unidoc/unioffice/v2/document"
)

type ParseRequest struct {
	FilePath string `json:"file_path"`
	Rules    []Rule `json:"rules,omitempty"`
}

type Rule struct {
	Name    string `json:"name"`
	Pattern string `json:"pattern"`
}

type ParseResponse struct {
	Status   string                 `json:"status"`
	Text     string                 `json:"text,omitempty"`
	Extracts map[string]interface{} `json:"extracts,omitempty"`
	Error    string                 `json:"error,omitempty"`
}

func paragraphText(p document.Paragraph) string {
	var sb strings.Builder
	for _, r := range p.Runs() {
		sb.WriteString(r.Text())
	}
	return sb.String()
}

func extractDocxText(filePath string) (string, error) {
	doc, err := document.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open docx: %w", err)
	}
	defer doc.Close()

	var parts []string
	for _, para := range doc.Paragraphs() {
		text := strings.TrimSpace(paragraphText(para))
		if text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n"), nil
}

func extractPdfText(filePath string) (string, error) {
	return "", fmt.Errorf("PDF parsing not yet implemented, please convert to .docx")
}

func extractText(filePath string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".docx":
		return extractDocxText(filePath)
	case ".pdf":
		return extractPdfText(filePath)
	case ".doc":
		return "", fmt.Errorf(".doc format not supported, please convert to .docx")
	default:
		return "", fmt.Errorf("unsupported format: %s", ext)
	}
}

func applyRules(text string, rules []Rule) map[string]interface{} {
	extracts := make(map[string]interface{})
	for _, rule := range rules {
		if rule.Pattern == "" {
			continue
		}
		re, err := regexp.Compile(rule.Pattern)
		if err != nil {
			continue
		}
		matches := re.FindStringSubmatch(text)
		if len(matches) > 1 {
			extracts[rule.Name] = matches[1]
		} else if len(matches) == 1 {
			extracts[rule.Name] = matches[0]
		}
	}
	return extracts
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

	text, err := extractText(req.FilePath)
	if err != nil {
		resp := ParseResponse{Status: "error", Error: err.Error()}
		output, _ := json.Marshal(resp)
		fmt.Println(string(output))
		return
	}

	extracts := applyRules(text, req.Rules)

	resp := ParseResponse{
		Status:   "ok",
		Text:     text,
		Extracts: extracts,
	}
	output, _ := json.Marshal(resp)
	fmt.Println(string(output))
}
