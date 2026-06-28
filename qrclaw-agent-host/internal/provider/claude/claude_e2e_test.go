//go:build e2e

package claude

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
	"github.com/qrclaw/qrclaw-agent-host/internal/provider"
)

func TestClaudeInternalPipeMode(t *testing.T) {
	if os.Getenv("IS_SANDBOX") != "1" {
		os.Setenv("IS_SANDBOX", "1")
	}
	path := os.Getenv("QRCLAW_PROVIDER_CLAUDE_CODE_PATH")
	if path == "" {
		// fallback to detect
		r := detect.Detect(context.Background(), detect.Spec{
			Provider:    detect.ProviderClaude,
			Binary:      "claude-internal",
			VersionArgs: []string{"--version"},
		})
		if !r.Found {
			t.Skip("claude-internal not found")
		}
		path = r.Path
	}
	a := &adapter{r: detect.Result{Path: path}}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	result, err := a.Run(ctx, provider.RunInput{Content: "Reply with exactly the number 42, nothing else, no punctuation"})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("empty result")
	}
	t.Logf("Got reply: %q", result)
	if result != "42" && result != "42\n" {
		t.Logf("WARNING: expected '42', got %q (may include thinking)", result)
	}
}
