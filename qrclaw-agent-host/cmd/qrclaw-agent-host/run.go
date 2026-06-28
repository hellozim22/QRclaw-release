package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/qrclaw/qrclaw-agent-host/internal/auth"
	"github.com/qrclaw/qrclaw-agent-host/internal/config"
	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
	"github.com/qrclaw/qrclaw-agent-host/internal/health"
	"github.com/qrclaw/qrclaw-agent-host/internal/provider"
	"github.com/qrclaw/qrclaw-agent-host/internal/version"
	"github.com/qrclaw/qrclaw-agent-host/internal/ws"
)

type ownerAgentRunPayloadBase struct {
	RunID          string `json:"run_id"`
	ConversationID string `json:"conversation_id"`
	AgentID        string `json:"agent_id"`
	Provider       string `json:"provider"`
	CorrelationID  string `json:"correlation_id"`
}

type ownerAgentRunRequestPayload struct {
	ownerAgentRunPayloadBase
	OwnerMessageID    string  `json:"owner_message_id"`
	Content           string  `json:"content"`
	ContentType       string  `json:"content_type"`
	Instructions      *string `json:"instructions,omitempty"`
	RequestedModel    *string `json:"requested_model,omitempty"`
	ProviderSessionID *string `json:"provider_session_id,omitempty"`
	ProviderWorkDir   *string `json:"provider_work_dir,omitempty"`
}

const capabilityDetectInterval = 5 * time.Second

type capabilityUpdater interface {
	UpdateCapabilities(context.Context, []ws.ProviderCapability) error
}

func cmdDetect(stdout io.Writer) error {
	results := detect.All(context.Background())
	for _, r := range results {
		fmt.Fprintf(stdout, "%-15s %-14s path=%s version=%s\n", r.Provider, r.Status, r.Path, r.Version)
	}
	return nil
}

func cmdRun(args []string, s auth.TokenStore, stdout io.Writer) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	name := fs.String("name", "default", "agent name")
	wsURL := fs.String("ws", "", "gateway WS URL")
	hostID := fs.String("host-id", "", "host id")
	display := fs.String("display-name", hostname(), "display name")
	if err := fs.Parse(args); err != nil {
		return err
	}

	fileCfg, _ := config.Load()
	if *wsURL == "" {
		*wsURL = envOr("QRCLAW_WS_URL", fileCfg.GatewayWSURL)
	}
	if *wsURL == "" {
		*wsURL = "ws://127.0.0.1:3100/ws"
	}
	if *hostID == "" {
		*hostID = envOr("QRCLAW_HOST_ID", fileCfg.HostID)
	}
	if *hostID == "" {
		uid := fileCfg.UserID
		*hostID = ensureHostID(uid)
	}
	if *hostID != "" && !isUUID(*hostID) {
		*hostID = ensureHostID(fileCfg.UserID)
	}
	tok, err := s.Load(*name)
	if err != nil {
		return fmt.Errorf("load token: %w", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	adapters, results := provider.BuildAll(ctx)
	caps := buildProviderCapabilities(results)
	names := make([]string, 0, len(adapters))
	adaptersByName := make(map[string]provider.Adapter, len(adapters))
	for _, a := range adapters {
		names = append(names, a.Name())
		adaptersByName[a.Name()] = a
	}
	fmt.Fprintf(stdout, "detected providers: %s\n", strings.Join(names, ", "))

	healthPort := fileCfg.HealthPort
	if healthPort <= 0 {
		healthPort = health.DefaultPort
	}
	detectedAgents := names
	go func() {
		hs := health.New(healthPort, *hostID, *wsURL, version.Version, func() []string {
			return detectedAgents
		})
		_ = hs.ListenAndServe(ctx)
	}()

	cli := ws.NewClient(ws.Config{
		URL:               *wsURL,
		Token:             tok,
		HostID:            *hostID,
		DisplayName:       *display,
		Providers:         caps,
		HeartbeatInterval: 20 * time.Second,
	})
	if err := cli.Dial(ctx); err != nil {
		return fmt.Errorf("ws dial: %w", err)
	}
	defer cli.Close()
	if err := cli.Register(ctx); err != nil {
		return fmt.Errorf("register: %w", err)
	}
	fmt.Fprintf(stdout, "registered host %s\n", *hostID)
	go runCapabilityDetectLoop(ctx, cli, capabilityDetectInterval, detect.All)

	runErr := make(chan error, 1)
	go func() {
		runErr <- cli.Run(ctx)
	}()

	for {
		select {
		case frame := <-cli.Runs:
			go handleOwnerAgentRunRequest(ctx, cli, adaptersByName, *hostID, frame, stdout)
		case err := <-runErr:
			return err
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func buildProviderCapabilities(results []detect.Result) []ws.ProviderCapability {
	caps := make([]ws.ProviderCapability, 0, len(results))
	for _, r := range results {
		status := r.Status
		if status == "" {
			if r.Found {
				status = detect.StatusOnline
			} else {
				status = detect.StatusNotInstalled
			}
		}
		var binary *string
		if r.Path != "" {
			p := r.Path
			binary = &p
		}
		caps = append(caps, ws.ProviderCapability{
			Provider:        string(r.Provider),
			ProviderVersion: r.Version,
			Status:          string(status),
			BinaryPath:      binary,
			Capabilities: ws.ProviderCapabilities{
				Models: configuredModels(r.Provider),
			},
		})
	}
	return caps
}

func configuredModels(provider detect.Provider) []string {
	var envVar string
	switch provider {
	case detect.ProviderCodex:
		envVar = "QRCLAW_CODEX_MODEL"
	case detect.ProviderPi:
		envVar = "QRCLAW_PI_MODEL"
	default:
		return nil
	}

	model := strings.TrimSpace(os.Getenv(envVar))
	if model == "" {
		return nil
	}
	return []string{model}
}

func runCapabilityDetectLoop(
	ctx context.Context,
	cli capabilityUpdater,
	interval time.Duration,
	detectFn func(context.Context) []detect.Result,
) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = cli.UpdateCapabilities(ctx, buildProviderCapabilities(detectFn(ctx)))
		}
	}
}

func handleOwnerAgentRunRequest(
	ctx context.Context,
	cli *ws.Client,
	adapters map[string]provider.Adapter,
	hostID string,
	frame ws.Frame,
	stdout io.Writer,
) {
	var payload ownerAgentRunRequestPayload
	if err := json.Unmarshal(frame.Payload, &payload); err != nil {
		fmt.Fprintf(stdout, "ignored malformed run request %s\n", frame.ID)
		return
	}
	base := payload.ownerAgentRunPayloadBase
	if base.CorrelationID == "" {
		base.CorrelationID = base.RunID
	}
	fmt.Fprintf(stdout, "run request %s provider=%s\n", payload.RunID, payload.Provider)

	adapter := adapters[payload.Provider]
	if adapter == nil {
		fmt.Fprintf(stdout, "run %s failed: provider unavailable\n", payload.RunID)
		_ = sendRunFailed(ctx, cli, base, 1, "provider_unavailable", "requested provider is not available", false)
		return
	}

	if err := sendHostFrame(ctx, cli, "owner_agent_run_accepted", payload.RunID, map[string]any{
		"run_id":          payload.RunID,
		"conversation_id": payload.ConversationID,
		"agent_id":        payload.AgentID,
		"provider":        payload.Provider,
		"correlation_id":  base.CorrelationID,
		"host_id":         hostID,
		"accepted_at":     time.Now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		fmt.Fprintf(stdout, "failed to accept run %s: %v\n", payload.RunID, err)
		return
	}

	providerTimeout := 2 * time.Minute
	if payload.Provider == "openclaw" {
		providerTimeout = 5 * time.Minute
	}
	providerCtx, cancel := context.WithTimeout(ctx, providerTimeout)
	defer cancel()
	fmt.Fprintf(stdout, "run %s provider start content_len=%d\n", payload.RunID, len(payload.Content))
	reply, err := adapter.Run(providerCtx, provider.RunInput{
		Content:      payload.Content,
		Instructions: buildProgressAwareInstructions(payload.Instructions),
		WorkDir:      stringPtrValue(payload.ProviderWorkDir),
		Env: map[string]string{
			"QRCLAW_PROGRESS_API_URL": progressAPIURL(),
		},
	})
	if err != nil {
		fmt.Fprintf(stdout, "run %s provider failed: %v\n", payload.RunID, err)
		_ = sendRunFailed(ctx, cli, base, 1, "provider_error", err.Error(), true)
		return
	}
	if strings.TrimSpace(reply) == "" {
		fmt.Fprintf(stdout, "run %s provider returned empty reply\n", payload.RunID)
		_ = sendRunFailed(ctx, cli, base, 1, "empty_provider_reply", "provider returned an empty reply", true)
		return
	}
	fmt.Fprintf(stdout, "run %s provider completed (%d bytes)\n", payload.RunID, len(reply))

	if err := sendHostFrame(ctx, cli, "owner_agent_run_completed", payload.RunID, map[string]any{
		"run_id":          payload.RunID,
		"conversation_id": payload.ConversationID,
		"agent_id":        payload.AgentID,
		"provider":        payload.Provider,
		"correlation_id":  base.CorrelationID,
		"seq":             1,
		"final_message":   reply,
		"actual_model":    payload.RequestedModel,
	}); err != nil {
		fmt.Fprintf(stdout, "failed to complete run %s: %v\n", payload.RunID, err)
	}
	fmt.Fprintf(stdout, "run %s completed\n", payload.RunID)
}

func buildProgressAwareInstructions(agentInstructions *string) string {
	parts := []string{}
	if agentInstructions != nil && strings.TrimSpace(*agentInstructions) != "" {
		parts = append(parts, strings.TrimSpace(*agentInstructions))
	}
	parts = append(parts, progressRuntimeInstructions())
	return strings.Join(parts, "\n\n")
}

func progressRuntimeInstructions() string {
	command := "qrclaw-agent-host progress"
	if exe, err := os.Executable(); err == nil && strings.TrimSpace(exe) != "" {
		command = shellQuote(exe) + " progress"
	}
	return fmt.Sprintf(`## QRClaw Progress Task Tools

You can manage the user's local Progress board. When the user mentions "任务", "task", "Progress", "进度", or asks you to create, find, update, comment on, block, or complete work, use the local Progress command instead of only saying you did it.

Command base:
%s

Available commands:
- %s list
- %s get --id TASK_ID_OR_IDENTIFIER
- %s create --title "..." --description "..." --status todo --priority medium --agent-name "YOUR_NAME"
- %s update --id TASK_ID --status in_progress|in_review|done|blocked --title "..." --description "..."
- %s comment --id TASK_ID --content "..."
- %s delete --id TASK_ID

Task descriptions should use these sections when creating or substantially updating a task:
## 任务背景
## 任务详情
## 任务解决进度

Important:
- If the user asks to create a task, actually call the create command.
- If the user asks about an existing task, call list or get first.
- If you make progress, update status or add a comment.
- Keep the final chat reply short and mention the task identifier returned by the command.`, command, command, command, command, command, command, command)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func sendRunFailed(
	ctx context.Context,
	cli *ws.Client,
	base ownerAgentRunPayloadBase,
	seq int,
	code string,
	message string,
	retryable bool,
) error {
	return sendHostFrame(ctx, cli, "owner_agent_run_failed", base.RunID, map[string]any{
		"run_id":          base.RunID,
		"conversation_id": base.ConversationID,
		"agent_id":        base.AgentID,
		"provider":        base.Provider,
		"correlation_id":  base.CorrelationID,
		"seq":             seq,
		"error_code":      code,
		"error_message":   message,
		"retryable":       retryable,
	})
}

func sendHostFrame(ctx context.Context, cli *ws.Client, frameType string, runID string, payload any) error {
	pb, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return cli.SendRaw(ctx, ws.Frame{
		Type:      frameType,
		ID:        fmt.Sprintf("%s-%s", frameType, runID),
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Payload:   pb,
	})
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func hostname() string {
	h, err := os.Hostname()
	if err != nil {
		return "qrclaw-host"
	}
	return h
}
