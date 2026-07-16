package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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

func extractDocxText(filePath string) (string, error) {
	r, err := zip.OpenReader(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open docx: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		if f.Name == "word/document.xml" {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			defer rc.Close()

			data, err := io.ReadAll(rc)
			if err != nil {
				return "", err
			}

			content := string(data)
			re := regexp.MustCompile(`<w:t[^>]*>([^<]+)</w:t>`)
			matches := re.FindAllStringSubmatch(content, -1)
			var parts []string
			for _, m := range matches {
				parts = append(parts, m[1])
			}
			return strings.Join(parts, ""), nil
		}
	}
	return "", fmt.Errorf("word/document.xml not found in docx")
}

func extractPdfText(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	content := string(data)
	re := regexp.MustCompile(`\((.*?)\)`)
	matches := re.FindAllStringSubmatch(content, -1)
	var parts []string
	for _, m := range matches {
		if len(m[1]) > 2 {
			parts = append(parts, m[1])
		}
	}
	if len(parts) == 0 {
		re2 := regexp.MustCompile(`BT([\s\S]*?)ET`)
		btMatches := re2.FindAllStringSubmatch(content, -1)
		for _, m := range btMatches {
			tRe := regexp.MustCompile(`Td\s*\(([^)]*)\)`)
			tMatches := tRe.FindAllStringSubmatch(m[1], -1)
			for _, t := range tMatches {
				parts = append(parts, t[1])
			}
		}
	}
	return strings.Join(parts, "\n"), nil
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
			extracts[rule.Name] = fmt.Sprintf("invalid pattern: %s", err.Error())
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
	var req ParseRequest
	decoder := json.NewDecoder(os.Stdin)
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