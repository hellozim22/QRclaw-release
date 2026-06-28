// Package claude is the Claude Code CLI adapter.
package claude

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
	"github.com/qrclaw/qrclaw-agent-host/internal/provider"
)

type adapter struct{ r detect.Result }

// New builds a Claude adapter from a detect.Result.
func New(r detect.Result) (provider.Adapter, error) {
	if r.Path == "" {
		return nil, fmt.Errorf("claude: empty path")
	}
	return &adapter{r: r}, nil
}

func (a *adapter) Name() string    { return string(detect.ProviderClaude) }
func (a *adapter) Path() string    { return a.r.Path }
func (a *adapter) Version() string { return a.r.Version }

// Run executes `claude --permission-mode bypassPermissions --print
// --output-format stream-json --input-format text` with input on stdin, and
// extracts the final assistant text from the stream-json output.
func (a *adapter) Run(ctx context.Context, input provider.RunInput) (string, error) {
	cmd := exec.CommandContext(ctx, a.r.Path,
		"--dangerously-skip-permissions",
		"--print",
		"--output-format", "stream-json",
		"--input-format", "text",
		"--verbose",
	)
	cmd.Env = append(os.Environ(), "IS_SANDBOX=1")
	// Run from /tmp to avoid loading .claude/ hooks from project directories
	// which would blow up the context window and cause timeouts.
	cmd.Dir = os.TempDir()
	cmd.Stdin = bytes.NewBufferString(input.Prompt())
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("claude run: %w: %s", err, errb.String())
	}
	return ParseStreamJSON(&out)
}

// ParseStreamJSON scans newline-delimited Claude stream-json and returns the
// concatenated final assistant text. Unknown entries are ignored.
func ParseStreamJSON(r io.Reader) (string, error) {
	dec := json.NewDecoder(r)
	var final strings.Builder
	for {
		var ev map[string]any
		if err := dec.Decode(&ev); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return "", fmt.Errorf("decode: %w", err)
		}
		// Claude Code stream-json: { "type": "assistant", "message": { "content": [ { "type":"text", "text":"..." } ] } }
		t, _ := ev["type"].(string)
		if t != "assistant" {
			continue
		}
		msg, _ := ev["message"].(map[string]any)
		if msg == nil {
			continue
		}
		content, _ := msg["content"].([]any)
		for _, c := range content {
			cm, _ := c.(map[string]any)
			if cm == nil {
				continue
			}
			if tt, _ := cm["type"].(string); tt == "text" {
				if s, _ := cm["text"].(string); s != "" {
					final.WriteString(s)
				}
			}
		}
	}
	return final.String(), nil
}

func init() {
	provider.Register(detect.ProviderClaude, New)
}
