package provider

import (
	"context"
	"testing"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
)

type stubAdapter struct{ r detect.Result }

func (s *stubAdapter) Name() string    { return string(s.r.Provider) }
func (s *stubAdapter) Path() string    { return s.r.Path }
func (s *stubAdapter) Version() string { return s.r.Version }
func (s *stubAdapter) Run(ctx context.Context, input RunInput) (string, error) {
	return "", ErrNotImplemented
}

func TestRegisterAndFactoryFor(t *testing.T) {
	Register(detect.ProviderOpenClaw, func(r detect.Result) (Adapter, error) {
		return &stubAdapter{r: r}, nil
	})
	f, ok := FactoryFor(detect.ProviderOpenClaw)
	if !ok || f == nil {
		t.Fatalf("factory not registered")
	}
	a, err := f(detect.Result{Provider: detect.ProviderOpenClaw, Path: "/x", Version: "1.0"})
	if err != nil {
		t.Fatal(err)
	}
	if a.Name() != "openclaw" || a.Path() != "/x" || a.Version() != "1.0" {
		t.Errorf("bad adapter: %+v", a)
	}
	if _, err := a.Run(context.Background(), RunInput{Content: "hi"}); err == nil {
		t.Errorf("expected ErrNotImplemented")
	}
}

func TestBuildAllSkipsMissing(t *testing.T) {
	// With no providers on PATH (very likely in CI for these names), BuildAll
	// should return empty adapters without error.
	adapters, results := BuildAll(context.Background())
	if len(results) == 0 {
		t.Fatalf("expected detect results")
	}
	for _, a := range adapters {
		if a.Name() == "" {
			t.Errorf("adapter missing name")
		}
	}
}
