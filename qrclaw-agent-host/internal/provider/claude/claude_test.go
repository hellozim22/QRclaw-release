package claude

import (
	"strings"
	"testing"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
)

func TestParseStreamJSON(t *testing.T) {
	in := `{"type":"system","subtype":"init"}
{"type":"assistant","message":{"content":[{"type":"text","text":"Hello "}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"world."}]}}
{"type":"result","subtype":"success"}`
	out, err := ParseStreamJSON(strings.NewReader(in))
	if err != nil {
		t.Fatal(err)
	}
	if out != "Hello world." {
		t.Errorf("got %q", out)
	}
}

func TestAdapterNew(t *testing.T) {
	a, err := New(detect.Result{Provider: detect.ProviderClaude, Path: "/x/claude", Version: "2.1.112"})
	if err != nil {
		t.Fatal(err)
	}
	if a.Name() != "claude" {
		t.Errorf("bad name: %s", a.Name())
	}
}
