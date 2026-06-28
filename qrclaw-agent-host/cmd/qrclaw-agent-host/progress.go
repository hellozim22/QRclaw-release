package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultProgressAPIURL = "http://127.0.0.1:3000/api/local/progress"

func progressAPIURL() string {
	if v := strings.TrimSpace(os.Getenv("QRCLAW_PROGRESS_API_URL")); v != "" {
		return v
	}
	return defaultProgressAPIURL
}

func cmdProgress(args []string, stdout io.Writer) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: qrclaw-agent-host progress [list|get|create|update|comment|delete]")
	}

	switch args[0] {
	case "list":
		return progressList(stdout)
	case "get":
		return progressGet(args[1:], stdout)
	case "create":
		return progressCreate(args[1:], stdout)
	case "update":
		return progressUpdate(args[1:], stdout)
	case "comment":
		return progressComment(args[1:], stdout)
	case "delete":
		return progressDelete(args[1:], stdout)
	default:
		return fmt.Errorf("unknown progress command %q", args[0])
	}
}

func progressList(stdout io.Writer) error {
	body, err := progressRequest("GET", nil)
	if err != nil {
		return err
	}
	_, err = stdout.Write(body)
	return err
}

func progressGet(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("progress get", flag.ContinueOnError)
	id := fs.String("id", "", "task id")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*id) == "" {
		return fmt.Errorf("--id is required")
	}
	body, err := progressRequest("GET", nil)
	if err != nil {
		return err
	}
	var decoded struct {
		Data struct {
			Tasks []map[string]any `json:"tasks"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return err
	}
	for _, task := range decoded.Data.Tasks {
		if task["id"] == *id || task["identifier"] == *id {
			enc := json.NewEncoder(stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(task)
		}
	}
	return fmt.Errorf("task %q not found", *id)
}

func progressCreate(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("progress create", flag.ContinueOnError)
	title := fs.String("title", "", "task title")
	description := fs.String("description", "", "task description")
	status := fs.String("status", "todo", "task status")
	priority := fs.String("priority", "medium", "task priority")
	agentName := fs.String("agent-name", "", "agent display name")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*title) == "" {
		return fmt.Errorf("--title is required")
	}
	return progressPost(map[string]any{
		"action": "create_task",
		"input": map[string]any{
			"title":       *title,
			"description": *description,
			"status":      *status,
			"priority":    *priority,
			"agentName":   nilIfEmpty(*agentName),
		},
	}, stdout)
}

func progressUpdate(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("progress update", flag.ContinueOnError)
	id := fs.String("id", "", "task id")
	title := fs.String("title", "", "task title")
	description := fs.String("description", "", "task description")
	status := fs.String("status", "", "task status")
	priority := fs.String("priority", "", "task priority")
	agentName := fs.String("agent-name", "Agent", "activity actor name")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*id) == "" {
		return fmt.Errorf("--id is required")
	}
	patch := map[string]any{}
	if strings.TrimSpace(*title) != "" {
		patch["title"] = *title
	}
	if strings.TrimSpace(*description) != "" {
		patch["description"] = *description
	}
	if strings.TrimSpace(*status) != "" {
		patch["status"] = *status
	}
	if strings.TrimSpace(*priority) != "" {
		patch["priority"] = *priority
	}
	if len(patch) == 0 {
		return fmt.Errorf("no fields to update")
	}
	return progressPost(map[string]any{
		"action":    "update_task",
		"taskId":    *id,
		"patch":     patch,
		"actorName": *agentName,
		"actorType": "agent",
	}, stdout)
}

func progressComment(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("progress comment", flag.ContinueOnError)
	id := fs.String("id", "", "task id")
	content := fs.String("content", "", "comment content")
	author := fs.String("author", "Agent", "comment author")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*id) == "" {
		return fmt.Errorf("--id is required")
	}
	if strings.TrimSpace(*content) == "" {
		return fmt.Errorf("--content is required")
	}
	return progressPost(map[string]any{
		"action":     "add_comment",
		"taskId":     *id,
		"content":    *content,
		"authorName": *author,
	}, stdout)
}

func progressDelete(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("progress delete", flag.ContinueOnError)
	id := fs.String("id", "", "task id")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*id) == "" {
		return fmt.Errorf("--id is required")
	}
	return progressPost(map[string]any{
		"action": "delete_task",
		"taskId": *id,
	}, stdout)
}

func progressPost(payload map[string]any, stdout io.Writer) error {
	body, err := progressRequest("POST", payload)
	if err != nil {
		return err
	}
	_, err = stdout.Write(body)
	return err
}

func progressRequest(method string, payload any) ([]byte, error) {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, progressAPIURL(), body)
	if err != nil {
		return nil, err
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("progress api: %w", err)
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("progress api status %d: %s", res.StatusCode, strings.TrimSpace(string(data)))
	}
	if len(data) == 0 || data[len(data)-1] != '\n' {
		data = append(data, '\n')
	}
	return data, nil
}

func nilIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
