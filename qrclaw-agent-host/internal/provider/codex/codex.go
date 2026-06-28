// Package codex is the OpenAI Codex CLI adapter.
//
// The adapter uses `codex exec --skip-git-repo-check -` so stdin carries the
// prompt and the daemon can run from a neutral working directory.
package codex

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
	"github.com/qrclaw/qrclaw-agent-host/internal/provider"
)

type adapter struct{ r detect.Result }

// New builds a Codex adapter from a detect.Result.
func New(r detect.Result) (provider.Adapter, error) {
	if r.Path == "" {
		return nil, fmt.Errorf("codex: empty path")
	}
	return &adapter{r: r}, nil
}

func (a *adapter) Name() string    { return string(detect.ProviderCodex) }
func (a *adapter) Path() string    { return a.r.Path }
func (a *adapter) Version() string { return a.r.Version }

// Run executes Codex non-interactively with input on stdin. Returns stdout.
func (a *adapter) Run(ctx context.Context, input provider.RunInput) (string, error) {
	args := []string{"exec", "--skip-git-repo-check"}
	if model := os.Getenv("QRCLAW_CODEX_MODEL"); model != "" {
		args = append(args, "-m", model)
	}
	args = append(args, "-")
	cmd := exec.CommandContext(ctx, a.r.Path, args...)
	cmd.Dir = os.TempDir()
	cmd.Stdin = bytes.NewBufferString(input.Prompt())
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("codex run: %w: %s", err, errb.String())
	}
	return out.String(), nil
}

func init() {
	provider.Register(detect.ProviderCodex, New)
}
