package openclaw

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
	"github.com/qrclaw/qrclaw-agent-host/internal/provider"
)

func TestAdapterBasics(t *testing.T) {
	a, err := New(detect.Result{Provider: detect.ProviderOpenClaw, Path: "/usr/local/bin/openclaw", Version: "1.0"})
	if err != nil {
		t.Fatal(err)
	}
	if a.Name() != "openclaw" || a.Path() != "/usr/local/bin/openclaw" || a.Version() != "1.0" {
		t.Errorf("bad adapter: %+v", a)
	}
}

func TestParseAgentJSONExtractsPayloadTextAfterStatusLog(t *testing.T) {
	got, err := parseAgentJSON([]byte("[openclaw-wecom-bot] Loaded bot state from file: {}\n{\"payloads\":[{\"text\":\"Hello!\",\"mediaUrl\":null}],\"meta\":{\"durationMs\":12}}"))
	if err != nil {
		t.Fatal(err)
	}
	if got != "Hello!" {
		t.Fatalf("got %q", got)
	}
}

func TestRunWithFakeBinary(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell fixture")
	}
	if os.Getenv("QRCLAW_PROVIDER_E2E") == "" {
		t.Skip("set QRCLAW_PROVIDER_E2E=1 to run")
	}
	dir := t.TempDir()
	fake := filepath.Join(dir, "openclaw")
	// Echo back "OK: " + stdin content.
	script := "#!/bin/sh\nif [ \"$1\" = \"--local\" ]; then IN=$(cat); printf 'OK: %s' \"$IN\"; else echo 'no-local'; exit 2; fi\n"
	if err := os.WriteFile(fake, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	a, err := New(detect.Result{Provider: detect.ProviderOpenClaw, Path: fake})
	if err != nil {
		t.Fatal(err)
	}
	got, err := a.Run(context.Background(), provider.RunInput{Content: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	if got != "OK: hello" {
		t.Errorf("got %q", got)
	}
}
