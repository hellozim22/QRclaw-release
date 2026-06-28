package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
	hostws "github.com/qrclaw/qrclaw-agent-host/internal/ws"
	"nhooyr.io/websocket"
)

type memoryTokenStore map[string]string

func (s memoryTokenStore) Load(name string) (string, error) { return s[name], nil }
func (s memoryTokenStore) Save(name, token string) error {
	s[name] = token
	return nil
}
func (s memoryTokenStore) Delete(name string) error {
	delete(s, name)
	return nil
}

func TestCmdRunExecutesProviderForRunRequest(t *testing.T) {
	openclawPath := writeFakeOpenClaw(t)
	t.Setenv("QRCLAW_PROVIDER_OPENCLAW_PATH", openclawPath)
	t.Setenv("QRCLAW_PROVIDER_CLAUDE_CODE_PATH", filepath.Join(t.TempDir(), "missing-claude"))
	t.Setenv("QRCLAW_PROVIDER_CURSOR_AGENT_PATH", filepath.Join(t.TempDir(), "missing-cursor"))
	t.Setenv("QRCLAW_PROVIDER_CODEX_PATH", filepath.Join(t.TempDir(), "missing-codex"))

	frames := make(chan hostws.Frame, 8)
	completed := make(chan hostws.Frame, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				return
			}
			var frame hostws.Frame
			if err := json.Unmarshal(data, &frame); err != nil {
				continue
			}
			frames <- frame
			if frame.Type == "host_register" {
				request := hostws.Frame{
					Type:      "owner_agent_run_request",
					ID:        "run-request-1",
					Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
					Payload: json.RawMessage(`{
						"run_id":"run-1",
						"conversation_id":"conv-1",
						"agent_id":"agent-1",
						"provider":"openclaw",
						"correlation_id":"run-1",
						"owner_message_id":"msg-1",
						"content":"say hello in one line",
						"content_type":"text"
					}`),
				}
				payload, _ := json.Marshal(request)
				_ = conn.Write(ctx, websocket.MessageText, payload)
			}
			if frame.Type == "owner_agent_run_completed" {
				completed <- frame
				return
			}
		}
	}))
	defer server.Close()

	wsURL := "ws" + server.URL[len("http"):]
	done := make(chan error, 1)
	go func() {
		done <- cmdRun(
			[]string{"--name", "e2e", "--host-id", "host-1", "--ws", wsURL},
			memoryTokenStore{"e2e": "token"},
			io.Discard,
		)
	}()

	select {
	case frame := <-completed:
		var payload struct {
			FinalMessage string `json:"final_message"`
		}
		if err := json.Unmarshal(frame.Payload, &payload); err != nil {
			t.Fatal(err)
		}
		if payload.FinalMessage != "hello from fake provider" {
			t.Fatalf("final_message = %q", payload.FinalMessage)
		}
	case err := <-done:
		t.Fatalf("cmdRun returned before completing run: %v", err)
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for owner_agent_run_completed")
	}

	seenAccepted := false
	for {
		select {
		case frame := <-frames:
			if frame.Type == "owner_agent_run_accepted" {
				seenAccepted = true
			}
		default:
			if !seenAccepted {
				t.Fatal("host did not send owner_agent_run_accepted")
			}
			return
		}
	}
}

func TestCmdRunDoesNotFabricateDemoReplyWhenProviderFails(t *testing.T) {
	providerPath := filepath.Join(t.TempDir(), "openclaw")
	content := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then\n  echo 'openclaw 1.2.3'\n  exit 0\nfi\necho 'provider exploded' >&2\nexit 42\n"
	if err := os.WriteFile(providerPath, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("QRCLAW_DEMO_PROVIDER_FALLBACK", "1")
	t.Setenv("QRCLAW_PROVIDER_OPENCLAW_PATH", providerPath)
	t.Setenv("QRCLAW_PROVIDER_CLAUDE_CODE_PATH", filepath.Join(t.TempDir(), "missing-claude"))
	t.Setenv("QRCLAW_PROVIDER_CURSOR_AGENT_PATH", filepath.Join(t.TempDir(), "missing-cursor"))
	t.Setenv("QRCLAW_PROVIDER_CODEX_PATH", filepath.Join(t.TempDir(), "missing-codex"))

	failed := make(chan hostws.Frame, 1)
	completed := make(chan hostws.Frame, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				return
			}
			var frame hostws.Frame
			if err := json.Unmarshal(data, &frame); err != nil {
				continue
			}
			if frame.Type == "host_register" {
				request := hostws.Frame{
					Type:      "owner_agent_run_request",
					ID:        "run-request-1",
					Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
					Payload: json.RawMessage(`{
						"run_id":"run-1",
						"conversation_id":"conv-1",
						"agent_id":"agent-1",
						"provider":"openclaw",
						"correlation_id":"run-1",
						"owner_message_id":"msg-1",
						"content":"你好",
						"content_type":"text"
					}`),
				}
				payload, _ := json.Marshal(request)
				_ = conn.Write(ctx, websocket.MessageText, payload)
			}
			if frame.Type == "owner_agent_run_failed" {
				failed <- frame
				return
			}
			if frame.Type == "owner_agent_run_completed" {
				completed <- frame
				return
			}
		}
	}))
	defer server.Close()

	wsURL := "ws" + server.URL[len("http"):]
	done := make(chan error, 1)
	go func() {
		done <- cmdRun(
			[]string{"--name", "e2e", "--host-id", "host-1", "--ws", wsURL},
			memoryTokenStore{"e2e": "token"},
			io.Discard,
		)
	}()

	select {
	case <-failed:
		// expected: provider failure must surface instead of a fabricated success reply.
	case frame := <-completed:
		var payload struct {
			FinalMessage string `json:"final_message"`
		}
		_ = json.Unmarshal(frame.Payload, &payload)
		t.Fatalf("unexpected completed frame with final_message = %q", payload.FinalMessage)
	case err := <-done:
		t.Fatalf("cmdRun returned before reporting provider failure: %v", err)
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for owner_agent_run_failed")
	}
}

func TestBuildProviderCapabilitiesUsesDetectStatus(t *testing.T) {
	results := []detect.Result{
		{Provider: detect.ProviderClaude, Path: "/usr/local/bin/claude", Version: "1.2.3", Found: true, Status: detect.StatusOnline},
		{Provider: detect.ProviderCursor, Found: true, Status: detect.StatusNeedsLogin},
		{Provider: detect.ProviderCodex, Status: detect.StatusNotInstalled},
	}

	caps := buildProviderCapabilities(results)
	if len(caps) != 3 {
		t.Fatalf("len(caps) = %d, want 3", len(caps))
	}
	if caps[0].Status != "online" || caps[0].ProviderVersion != "1.2.3" {
		t.Fatalf("online cap mismatch: %+v", caps[0])
	}
	if caps[0].BinaryPath == nil || *caps[0].BinaryPath != "/usr/local/bin/claude" {
		t.Fatalf("binary path = %v, want /usr/local/bin/claude", caps[0].BinaryPath)
	}
	if caps[1].Status != "needs_login" {
		t.Fatalf("needs_login cap mismatch: %+v", caps[1])
	}
	if caps[2].BinaryPath != nil {
		t.Fatalf("not_installed binary path = %v, want nil", caps[2].BinaryPath)
	}
	if caps[2].Status != "not_installed" {
		t.Fatalf("not_installed cap mismatch: %+v", caps[2])
	}
}

func TestBuildProviderCapabilitiesIncludesConfiguredModels(t *testing.T) {
	t.Setenv("QRCLAW_PI_MODEL", "deepseek-v4-flash")
	t.Setenv("QRCLAW_CODEX_MODEL", "gpt-5.5-medium")

	caps := buildProviderCapabilities([]detect.Result{
		{Provider: detect.ProviderPi, Found: true, Status: detect.StatusOnline},
		{Provider: detect.ProviderCodex, Found: true, Status: detect.StatusOnline},
		{Provider: detect.ProviderClaude, Found: true, Status: detect.StatusOnline},
	})

	if got := caps[0].Capabilities.Models; len(got) != 1 || got[0] != "deepseek-v4-flash" {
		t.Fatalf("pi models = %#v, want deepseek-v4-flash", got)
	}
	if got := caps[1].Capabilities.Models; len(got) != 1 || got[0] != "gpt-5.5-medium" {
		t.Fatalf("codex models = %#v, want gpt-5.5-medium", got)
	}
	if got := caps[2].Capabilities.Models; len(got) != 0 {
		t.Fatalf("claude models = %#v, want empty", got)
	}
}

func TestRunCapabilityDetectLoopSendsUpdates(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	updates := make(chan []hostws.ProviderCapability, 2)
	cli := &capabilityUpdateRecorder{updates: updates}
	calls := 0

	go runCapabilityDetectLoop(ctx, cli, time.Millisecond, func(context.Context) []detect.Result {
		calls++
		return []detect.Result{{
			Provider: detect.ProviderClaude,
			Version:  "1.2.3",
			Found:    true,
			Status:   detect.StatusOnline,
		}}
	})

	select {
	case caps := <-updates:
		if len(caps) != 1 || caps[0].Status != "online" {
			t.Fatalf("bad capabilities update: %+v", caps)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for capabilities update")
	}
	if calls == 0 {
		t.Fatal("detect function was not called")
	}
}

type capabilityUpdateRecorder struct {
	updates chan<- []hostws.ProviderCapability
}

func (r *capabilityUpdateRecorder) UpdateCapabilities(ctx context.Context, providers []hostws.ProviderCapability) error {
	select {
	case r.updates <- providers:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func writeFakeOpenClaw(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "openclaw")
	content := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then\n  echo 'openclaw 1.2.3'\n  exit 0\nfi\nprintf '%s\\n' '{\"reply\":\"hello from fake provider\"}'\n"
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}
