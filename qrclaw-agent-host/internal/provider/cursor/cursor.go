// Package cursor is the Cursor Agent CLI adapter.
package cursor

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
	"github.com/qrclaw/qrclaw-agent-host/internal/provider"
)

type adapter struct{ r detect.Result }

// New builds a Cursor adapter from a detect.Result.
func New(r detect.Result) (provider.Adapter, error) {
	if r.Path == "" {
		return nil, fmt.Errorf("cursor: empty path")
	}
	return &adapter{r: r}, nil
}

func (a *adapter) Name() string    { return string(detect.ProviderCursor) }
func (a *adapter) Path() string    { return a.r.Path }
func (a *adapter) Version() string { return a.r.Version }

// Run executes `cursor-agent --yolo -p <prompt>` and returns stdout.
func (a *adapter) Run(ctx context.Context, input provider.RunInput) (string, error) {
	cmd := exec.CommandContext(ctx, a.r.Path, "--yolo", "-p", input.Prompt())
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("cursor run: %w: %s", err, errb.String())
	}
	return out.String(), nil
}

func init() {
	provider.Register(detect.ProviderCursor, New)
}
