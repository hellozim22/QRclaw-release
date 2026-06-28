// Package pi is the Pi AI coding assistant CLI adapter.
package pi

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

// New builds a Pi adapter from a detect.Result.
func New(r detect.Result) (provider.Adapter, error) {
	if r.Path == "" {
		return nil, fmt.Errorf("pi: empty path")
	}
	return &adapter{r: r}, nil
}

func (a *adapter) Name() string    { return string(detect.ProviderPi) }
func (a *adapter) Path() string    { return a.r.Path }
func (a *adapter) Version() string { return a.r.Version }

// Run executes pi non-interactively. Provider/model come from QRCLAW_PI_PROVIDER /
// QRCLAW_PI_MODEL (see ~/.pi/agent/models.json + DEEPSEEK_API_KEY).
func (a *adapter) Run(ctx context.Context, input provider.RunInput) (string, error) {
	args := []string{"--print", "--no-session"}
	configuredProvider := os.Getenv("QRCLAW_PI_PROVIDER")
	if configuredProvider != "" {
		args = append(args, "--provider", configuredProvider)
	}
	if model := os.Getenv("QRCLAW_PI_MODEL"); model != "" {
		args = append(args, "--model", model)
	}
	thinking := os.Getenv("QRCLAW_PI_THINKING")
	if thinking == "" && configuredProvider == "deepseek" {
		// DeepSeek V4 thinking mode can hang in pi 0.79.x for short non-interactive runs.
		// Default to the stable non-thinking path unless explicitly overridden.
		thinking = "off"
	}
	if thinking != "" {
		args = append(args, "--thinking", thinking)
	}
	args = append(args, input.Prompt())
	cmd := exec.CommandContext(ctx, a.r.Path, args...)
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("pi run: %w: %s", err, errb.String())
	}
	return out.String(), nil
}

func init() {
	provider.Register(detect.ProviderPi, New)
}
