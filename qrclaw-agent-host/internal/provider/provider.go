// Package provider defines the adapter interface and registry for local AI
// provider CLIs detected on the host.
package provider

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
)

// RunInput carries the user message plus QRClaw runtime instructions injected
// by the local host.
type RunInput struct {
	Content      string
	Instructions string
	WorkDir      string
	Env          map[string]string
}

// Prompt returns a single text prompt for provider CLIs that do not expose a
// separate system-prompt flag.
func (input RunInput) Prompt() string {
	parts := []string{}
	if strings.TrimSpace(input.Instructions) != "" {
		parts = append(parts, strings.TrimSpace(input.Instructions))
	}
	parts = append(parts, strings.TrimSpace(input.Content))
	return strings.Join(parts, "\n\n---\n\n")
}

// Adapter wraps a local AI provider for the agent host.
type Adapter interface {
	Name() string
	// Path is the resolved executable path.
	Path() string
	// Version is the detected version string, if any.
	Version() string
	// Run executes the provider with the given input and returns stdout.
	Run(ctx context.Context, input RunInput) (string, error)
}

// Factory builds an Adapter from a detect.Result.
type Factory func(detect.Result) (Adapter, error)

var (
	mu        sync.RWMutex
	factories = map[detect.Provider]Factory{}
)

// Register installs a Factory for a provider.
func Register(p detect.Provider, f Factory) {
	mu.Lock()
	defer mu.Unlock()
	factories[p] = f
}

// FactoryFor returns the registered factory for p.
func FactoryFor(p detect.Provider) (Factory, bool) {
	mu.RLock()
	defer mu.RUnlock()
	f, ok := factories[p]
	return f, ok
}

// BuildAll detects providers and constructs adapters for those that are both
// present and have a registered factory. Missing/errored entries are skipped.
func BuildAll(ctx context.Context) ([]Adapter, []detect.Result) {
	results := detect.All(ctx)
	out := make([]Adapter, 0, len(results))
	for _, r := range results {
		if r.Status != detect.StatusOnline {
			continue
		}
		f, ok := FactoryFor(r.Provider)
		if !ok {
			continue
		}
		a, err := f(r)
		if err != nil {
			continue
		}
		out = append(out, a)
	}
	return out, results
}

// ErrNotImplemented is returned by stub adapters whose Run is not yet wired up.
var ErrNotImplemented = fmt.Errorf("provider adapter: Run not implemented")
