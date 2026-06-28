package codex

import (
	"testing"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
)

func TestNew(t *testing.T) {
	a, err := New(detect.Result{Provider: detect.ProviderCodex, Path: "/x/codex", Version: "0.1"})
	if err != nil {
		t.Fatal(err)
	}
	if a.Name() != "codex" {
		t.Errorf("bad name: %s", a.Name())
	}
}
