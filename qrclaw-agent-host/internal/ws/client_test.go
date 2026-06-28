package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"nhooyr.io/websocket"
)

// startTestServer spins up a WS echo server capturing the first N frames.
func startTestServer(t *testing.T, capture chan<- Frame, push []Frame) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			http.Error(w, "no auth", http.StatusUnauthorized)
			return
		}
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close(websocket.StatusNormalClosure, "")
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		// Push frames to client.
		for _, f := range push {
			b, _ := json.Marshal(f)
			_ = c.Write(ctx, websocket.MessageText, b)
		}

		for {
			_, data, err := c.Read(ctx)
			if err != nil {
				return
			}
			var f Frame
			if err := json.Unmarshal(data, &f); err == nil {
				select {
				case capture <- f:
				default:
				}
			}
		}
	}))
	return srv
}

func TestRegisterAndHeartbeat(t *testing.T) {
	capture := make(chan Frame, 8)
	srv := startTestServer(t, capture, nil)
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	cli := NewClient(Config{
		URL:               wsURL,
		Token:             "tkn",
		HostID:            "host-1",
		DisplayName:       "test",
		Providers:         []ProviderCapability{{Provider: "openclaw", Available: true}},
		HeartbeatInterval: 50 * time.Millisecond,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := cli.Dial(ctx); err != nil {
		t.Fatal(err)
	}
	defer cli.Close()
	if err := cli.Register(ctx); err != nil {
		t.Fatal(err)
	}

	runCtx, runCancel := context.WithCancel(ctx)
	defer runCancel()
	go cli.Run(runCtx)

	// Expect host_register, then at least one host_heartbeat.
	var sawReg, sawHB bool
	deadline := time.After(2 * time.Second)
	for !(sawReg && sawHB) {
		select {
		case <-deadline:
			t.Fatalf("timeout; reg=%v hb=%v", sawReg, sawHB)
		case f := <-capture:
			switch f.Type {
			case "host_register":
				sawReg = true
				var p HostRegisterPayload
				if err := json.Unmarshal(f.Payload, &p); err != nil {
					t.Fatal(err)
				}
				if p.HostID != "host-1" || len(p.Providers) != 1 {
					t.Errorf("bad register payload: %+v", p)
				}
				var raw struct {
					Providers []map[string]any `json:"providers"`
				}
				if err := json.Unmarshal(f.Payload, &raw); err != nil {
					t.Fatal(err)
				}
				provider := raw.Providers[0]
				if _, ok := provider["provider_version"]; ok {
					t.Fatal("host_register must not send legacy provider_version field")
				}
				if _, ok := provider["available"]; ok {
					t.Fatal("host_register must not send legacy available field")
				}
				if provider["version"] == nil {
					t.Fatal("host_register provider must include version")
				}
				if provider["status"] != "online" {
					t.Fatalf("host_register provider status = %v, want online", provider["status"])
				}
				caps, ok := provider["capabilities"].(map[string]any)
				if !ok {
					t.Fatalf("host_register provider capabilities missing: %#v", provider["capabilities"])
				}
				if _, ok := caps["streaming"].(bool); !ok {
					t.Fatalf("host_register provider capabilities.streaming missing: %#v", caps)
				}
				if _, ok := caps["full_access"].(bool); !ok {
					t.Fatalf("host_register provider capabilities.full_access missing: %#v", caps)
				}
			case "host_heartbeat":
				sawHB = true
			}
		}
	}
}

func TestUpdateCapabilitiesSendsFrame(t *testing.T) {
	capture := make(chan Frame, 8)
	srv := startTestServer(t, capture, nil)
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	cli := NewClient(Config{
		URL:         wsURL,
		Token:       "tkn",
		HostID:      "host-1",
		DisplayName: "test",
	})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := cli.Dial(ctx); err != nil {
		t.Fatal(err)
	}
	defer cli.Close()
	if err := cli.UpdateCapabilities(ctx, []ProviderCapability{{
		Provider:        "claude",
		ProviderVersion: "1.2.3",
		Status:          "needs_login",
	}}); err != nil {
		t.Fatal(err)
	}

	select {
	case f := <-capture:
		if f.Type != "host_capabilities_updated" {
			t.Fatalf("frame type = %q, want host_capabilities_updated", f.Type)
		}
		var payload struct {
			HostID    string               `json:"host_id"`
			Providers []ProviderCapability `json:"providers"`
		}
		if err := json.Unmarshal(f.Payload, &payload); err != nil {
			t.Fatal(err)
		}
		if payload.HostID != "host-1" || len(payload.Providers) != 1 {
			t.Fatalf("bad payload: %+v", payload)
		}
		if payload.Providers[0].Status != "needs_login" {
			t.Fatalf("provider status = %q, want needs_login", payload.Providers[0].Status)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for host_capabilities_updated")
	}
}

func TestReceivesRunRequest(t *testing.T) {
	push := []Frame{{
		Type:      "owner_agent_run_request",
		ID:        "run-1",
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Payload:   json.RawMessage(`{"run_id":"run-1"}`),
	}}
	capture := make(chan Frame, 4)
	srv := startTestServer(t, capture, push)
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	cli := NewClient(Config{URL: wsURL, Token: "tkn", HostID: "h", HeartbeatInterval: time.Hour})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := cli.Dial(ctx); err != nil {
		t.Fatal(err)
	}
	defer cli.Close()
	runCtx, runCancel := context.WithCancel(ctx)
	defer runCancel()
	go cli.Run(runCtx)

	select {
	case f := <-cli.Runs:
		if f.ID != "run-1" {
			t.Errorf("got %+v", f)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no run request received")
	}
}

func TestDialRequiresAuth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no", http.StatusUnauthorized)
	}))
	defer srv.Close()
	cli := NewClient(Config{URL: "ws" + strings.TrimPrefix(srv.URL, "http")})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := cli.Dial(ctx); err == nil {
		t.Errorf("expected dial to fail without auth")
	}
}
