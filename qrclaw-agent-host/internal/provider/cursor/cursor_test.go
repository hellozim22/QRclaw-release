package cursor

import (
	"testing"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
)

func TestNew(t *testing.T) {
	a, err := New(detect.Result{Provider: detect.ProviderCursor, Path: "/x/cursor", Version: "1.0"})
	if err != nil {
		t.Fatal(err)
	}
	if a.Name() != "cursor" {
		t.Errorf("bad name: %s", a.Name())
	}
	if _, err := New(detect.Result{Path: ""}); err == nil {
		t.Error("expected error on empty path")
	}
}
