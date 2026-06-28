// Package openclaw is the OpenClaw CLI adapter.
package openclaw

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
	"github.com/qrclaw/qrclaw-agent-host/internal/provider"
)

var jsonUnmarshal = json.Unmarshal

type adapter struct{ r detect.Result }

// New builds an OpenClaw adapter from a detect.Result.
func New(r detect.Result) (provider.Adapter, error) {
	if r.Path == "" {
		return nil, fmt.Errorf("openclaw: empty path")
	}
	return &adapter{r: r}, nil
}

func (a *adapter) Name() string    { return string(detect.ProviderOpenClaw) }
func (a *adapter) Path() string    { return a.r.Path }
func (a *adapter) Version() string { return a.r.Version }

// Run executes `openclaw agent --local --json --message <input>` and extracts
// the reply text from JSON output. Falls back to raw stdout if JSON parse fails.
func (a *adapter) Run(ctx context.Context, input provider.RunInput) (string, error) {
	sid := fmt.Sprintf("qrclaw-host-smoke-%d", os.Getpid())
	cmd := exec.CommandContext(ctx, a.r.Path, "agent", "--local", "--json",
		"--session-id", sid, "--message", input.Prompt())
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("openclaw run: %w: %s", err, errb.String())
	}
	return parseAgentJSON(out.Bytes())
}

func parseAgentJSON(b []byte) (string, error) {
	if text, ok := parseAgentJSONObject(b); ok {
		return text, nil
	}

	// Some OpenClaw builds write status lines before the final JSON object.
	// Scan for an object boundary and parse from there instead of forwarding
	// the whole diagnostic blob back through the 4 KB run-event frame.
	for i, c := range b {
		if c != '{' {
			continue
		}
		if text, ok := parseAgentJSONObject(b[i:]); ok {
			return text, nil
		}
	}

	return string(b), nil
}

func parseAgentJSONObject(b []byte) (string, bool) {
	var m map[string]any
	if err := jsonUnmarshal(b, &m); err == nil {
		for _, k := range []string{"reply", "message", "text", "output"} {
			if s, ok := m[k].(string); ok && s != "" {
				return s, true
			}
		}
		if payloads, ok := m["payloads"].([]any); ok {
			for _, item := range payloads {
				payload, ok := item.(map[string]any)
				if !ok {
					continue
				}
				if s, ok := payload["text"].(string); ok && s != "" {
					return s, true
				}
			}
		}
	}
	return "", false
}

func init() {
	provider.Register(detect.ProviderOpenClaw, New)
}
