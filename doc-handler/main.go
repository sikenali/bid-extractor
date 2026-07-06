package main

import (
	"encoding/json"
	"fmt"
	"os"
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

func main() {
	var req ParseRequest
	decoder := json.NewDecoder(os.Stdin)
	if err := decoder.Decode(&req); err != nil {
		resp := ParseResponse{Status: "error", Error: err.Error()}
		output, _ := json.Marshal(resp)
		fmt.Println(string(output))
		return
	}

	resp := ParseResponse{Status: "ok", Extracts: make(map[string]interface{})}
	output, _ := json.Marshal(resp)
	fmt.Println(string(output))
}
