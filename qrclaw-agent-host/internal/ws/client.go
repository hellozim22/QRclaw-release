// Package ws is the QRClaw Gateway WebSocket client for the Go agent host.
//
// Wave 6 scope: dialer, host_register frame, heartbeat ticker, run request
// receive channel, and event stream writer. Provider execution is wired in
// by higher layers; this package only moves JSON frames on the wire.
package ws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"nhooyr.io/websocket"
)

// Frame is a generic JSON envelope matching shared/contracts/ws/types.ts.
type Frame struct {
	Type      string          `json:"type"`
	ID        string          `json:"id,omitempty"`
	Timestamp string          `json:"timestamp"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

// ProviderCapability mirrors HostProviderCapability on the TS side.
type ProviderCapability struct {
	Provider        string               `json:"provider"`
	ProviderVersion string               `json:"version"`
	Available       bool                 `json:"-"`
	Status          string               `json:"status"`
	BinaryPath      *string              `json:"binary_path,omitempty"`
	Capabilities    ProviderCapabilities `json:"capabilities"`
}

type ProviderCapabilities struct {
	Streaming  bool     `json:"streaming"`
	FullAccess bool     `json:"full_access"`
	Models     []string `json:"models,omitempty"`
}

// HostRegisterPayload is the payload for the host_register frame.
type HostRegisterPayload struct {
	HostID      string               `json:"host_id"`
	HostType    string               `json:"host_type"`
	DisplayName string               `json:"display_name"`
	Providers   []ProviderCapability `json:"providers"`
}

// HostCapabilitiesUpdatedPayload is the payload for host_capabilities_updated.
type HostCapabilitiesUpdatedPayload struct {
	HostID    string               `json:"host_id"`
	Providers []ProviderCapability `json:"providers"`
}

// HostHeartbeatPayload is the payload for host_heartbeat.
type HostHeartbeatPayload struct {
	HostID       string   `json:"host_id"`
	ActiveRunIDs []string `json:"active_run_ids,omitempty"`
}

// Config configures Client.Dial.
type Config struct {
	URL               string
	Token             string
	HostID            string
	HostType          string
	DisplayName       string
	Providers         []ProviderCapability
	HeartbeatInterval time.Duration
}

// Client is the QRClaw Gateway WebSocket client.
type Client struct {
	cfg    Config
	conn   *websocket.Conn
	now    func() time.Time
	mu     sync.Mutex
	closed bool

	// Runs is the channel of incoming owner_agent_run_request frames.
	Runs chan Frame
	// Cancels is the channel of incoming owner_agent_run_cancel frames.
	Cancels chan Frame
}

// NewClient constructs a Client with default clock.
func NewClient(cfg Config) *Client {
	if cfg.HeartbeatInterval == 0 {
		cfg.HeartbeatInterval = 20 * time.Second
	}
	if cfg.HostType == "" {
		cfg.HostType = "local"
	}
	return &Client{
		cfg:     cfg,
		now:     time.Now,
		Runs:    make(chan Frame, 16),
		Cancels: make(chan Frame, 4),
	}
}

// Dial opens the WebSocket connection using cfg.Token as the URL ticket
// (gateway Method A). A Bearer header is also sent for forward-compat.
func (c *Client) Dial(ctx context.Context) error {
	hdr := http.Header{}
	dialURL := c.cfg.URL
	if c.cfg.Token != "" {
		hdr.Set("Authorization", "Bearer "+c.cfg.Token)
		sep := "?"
		if strings.Contains(dialURL, "?") {
			sep = "&"
		}
		dialURL = dialURL + sep + "ticket=" + url.QueryEscape(c.cfg.Token)
	}
	conn, _, err := websocket.Dial(ctx, dialURL, &websocket.DialOptions{HTTPHeader: hdr})
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()
	return nil
}

// Register sends the host_register frame.
func (c *Client) Register(ctx context.Context) error {
	payload := HostRegisterPayload{
		HostID:      c.cfg.HostID,
		HostType:    c.cfg.HostType,
		DisplayName: c.cfg.DisplayName,
		Providers:   normalizeProviders(c.cfg.Providers),
	}
	return c.send(ctx, "host_register", c.cfg.HostID, payload)
}

func normalizeProviders(providers []ProviderCapability) []ProviderCapability {
	normalized := make([]ProviderCapability, 0, len(providers))
	for _, provider := range providers {
		if provider.Status == "" {
			if provider.Available {
				provider.Status = "online"
			} else {
				provider.Status = "not_installed"
			}
		}
		normalized = append(normalized, provider)
	}
	return normalized
}

// UpdateCapabilities sends the latest runtime inventory to Gateway.
func (c *Client) UpdateCapabilities(ctx context.Context, providers []ProviderCapability) error {
	return c.send(ctx, "host_capabilities_updated", c.cfg.HostID, HostCapabilitiesUpdatedPayload{
		HostID:    c.cfg.HostID,
		Providers: normalizeProviders(providers),
	})
}

// Heartbeat sends one host_heartbeat frame with the given active run ids.
func (c *Client) Heartbeat(ctx context.Context, active []string) error {
	return c.send(ctx, "host_heartbeat", c.cfg.HostID, HostHeartbeatPayload{
		HostID:       c.cfg.HostID,
		ActiveRunIDs: active,
	})
}

// SendRaw writes a pre-built frame onto the wire.
func (c *Client) SendRaw(ctx context.Context, f Frame) error {
	if f.Timestamp == "" {
		f.Timestamp = c.now().UTC().Format(time.RFC3339Nano)
	}
	b, err := json.Marshal(f)
	if err != nil {
		return err
	}
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()
	if conn == nil {
		return errors.New("not connected")
	}
	return conn.Write(ctx, websocket.MessageText, b)
}

func (c *Client) send(ctx context.Context, kind, id string, payload any) error {
	pb, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return c.SendRaw(ctx, Frame{
		Type:      kind,
		ID:        id,
		Timestamp: c.now().UTC().Format(time.RFC3339Nano),
		Payload:   pb,
	})
}

// Run starts the read loop + heartbeat ticker. Blocks until ctx is done or
// the connection errors. Incoming frames are classified into c.Runs /
// c.Cancels; unknown frame types are dropped.
func (c *Client) Run(ctx context.Context) error {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()
	if conn == nil {
		return errors.New("not connected")
	}

	// Heartbeat goroutine.
	hbCtx, hbCancel := context.WithCancel(ctx)
	defer hbCancel()
	go func() {
		t := time.NewTicker(c.cfg.HeartbeatInterval)
		defer t.Stop()
		for {
			select {
			case <-hbCtx.Done():
				return
			case <-t.C:
				_ = c.Heartbeat(hbCtx, nil)
			}
		}
	}()

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return err
		}
		var f Frame
		if err := json.Unmarshal(data, &f); err != nil {
			continue
		}
		switch f.Type {
		case "owner_agent_run_request":
			select {
			case c.Runs <- f:
			default:
			}
		case "owner_agent_run_cancel":
			select {
			case c.Cancels <- f:
			default:
			}
		}
	}
}

// Close tears down the connection.
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed || c.conn == nil {
		return nil
	}
	c.closed = true
	return c.conn.Close(websocket.StatusNormalClosure, "bye")
}
