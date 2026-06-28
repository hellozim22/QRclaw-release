package main

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/qrclaw/qrclaw-agent-host/internal/config"
	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
)

// cmdSetup — Multica `setup self-host` equivalent for QRClaw local dev.
func cmdSetup(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("setup", flag.ContinueOnError)
	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}
	gatewayHTTP := fs.String("gateway-http", envOr("QRCLAW_GATEWAY_HTTP", "http://127.0.0.1:3100"), "gateway HTTP URL")
	gatewayWS := fs.String("gateway-ws", envOr("QRCLAW_WS_URL", "ws://127.0.0.1:3100/ws"), "gateway WS URL")
	webURL := fs.String("web-url", envOr("QRCLAW_WEB_URL", "http://localhost:3000"), "web app URL")
	repoRoot := fs.String("repo-root", envOr("QRCLAW_REPO_ROOT", ""), "repo root for mint-host script")
	userID := fs.String("user-id", "", "Supabase auth user id")
	if sub == "self-host" {
		_ = fs.Parse(args[1:])
	} else {
		_ = fs.Parse(args)
	}

	results := detect.All(context.Background())
	found := 0
	for _, r := range results {
		if r.Found {
			found++
			fmt.Fprintf(stdout, "  ✓ %s (%s)\n", r.Provider, r.Path)
		}
	}
	if found == 0 {
		return fmt.Errorf("no agent CLI found on PATH — install claude/cursor/codex/openclaw first")
	}

	uid := strings.TrimSpace(*userID)
	if uid == "" {
		uid = readLocalDevUserID(*repoRoot)
	}
	if uid == "" {
		return fmt.Errorf("user-id required — run: node scripts/seed-local-owner.mjs")
	}

	hostID := ensureHostID(uid)
	if hostID == "" {
		return fmt.Errorf("failed to derive host_id for user %s", uid)
	}

	cfg := config.Config{
		GatewayHTTPURL: strings.TrimRight(*gatewayHTTP, "/"),
		GatewayWSURL:   *gatewayWS,
		WebURL:         strings.TrimRight(*webURL, "/"),
		UserID:         uid,
		HostID:         hostID,
		HealthPort:     config.DefaultHealthPort(),
	}
	if err := config.Save(cfg); err != nil {
		return fmt.Errorf("save config: %w", err)
	}
	fmt.Fprintf(stdout, "wrote %s\n", mustConfigPath())

	root := *repoRoot
	if root == "" {
		root = guessRepoRoot()
	}
	mint := filepath.Join(root, "scripts/mint-host-token-and-run.sh")
	if _, err := os.Stat(mint); err != nil {
		return fmt.Errorf("mint script not found: %s", mint)
	}
	fmt.Fprintf(stdout, "minting host token for user %s…\n", uid)
	cmd := exec.Command("bash", mint, uid)
	cmd.Stdout = stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(),
		"QRCLAW_MINT_ONLY=1",
		"QRCLAW_HOST_ID="+hostID,
		"QRCLAW_REPO_ROOT="+root,
	)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("mint-host: %w", err)
	}

	fmt.Fprintln(stdout, "starting daemon…")
	return cmdDaemon([]string{"start"}, stdout)
}

func readLocalDevUserID(repoRoot string) string {
	if repoRoot == "" {
		repoRoot = guessRepoRoot()
	}
	p := filepath.Join(repoRoot, ".local-dev-owner.json")
	data, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	var payload struct {
		UserID string `json:"user_id"`
	}
	if json.Unmarshal(data, &payload) != nil {
		return ""
	}
	return payload.UserID
}

func ensureHostID(userID string) string {
	cfg, _ := config.Load()
	if cfg.HostID != "" && isUUID(cfg.HostID) {
		return cfg.HostID
	}
	dir, err := config.Dir()
	if err != nil {
		return deterministicHostID(userID)
	}
	idPath := filepath.Join(dir, "host.id")
	if data, err := os.ReadFile(idPath); err == nil {
		id := strings.TrimSpace(string(data))
		if id != "" && isUUID(id) {
			return id
		}
	}
	id := deterministicHostID(userID)
	_ = os.MkdirAll(dir, 0o755)
	_ = os.WriteFile(idPath, []byte(id), 0o600)
	return id
}

func isUUID(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) != 36 {
		return false
	}
	for i, ch := range value {
		switch i {
		case 8, 13, 18, 23:
			if ch != '-' {
				return false
			}
		default:
			if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') && (ch < 'A' || ch > 'F') {
				return false
			}
		}
	}
	return true
}

func deterministicHostID(userID string) string {
	if userID == "" {
		return ""
	}
	host, err := os.Hostname()
	if err != nil {
		host = "qrclaw-host"
	}
	short := strings.Split(host, ".")[0]
	return uuidV5DNS("qrclaw-host-" + short + "-" + userID)
}

func uuidV5DNS(name string) string {
	ns, err := hex.DecodeString("6ba7b8109dad11d180b400c04fd430c8")
	if err != nil {
		return ""
	}
	h := sha1.New()
	_, _ = h.Write(ns)
	_, _ = h.Write([]byte(name))
	sum := h.Sum(nil)
	u := sum[:16]
	u[6] = (u[6] & 0x0f) | 0x50
	u[8] = (u[8] & 0x3f) | 0x80
	return fmt.Sprintf(
		"%x-%x-%x-%x-%x",
		u[0:4],
		u[4:6],
		u[6:8],
		u[8:10],
		u[10:16],
	)
}

func guessRepoRoot() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	// .../qrclaw-agent-host/cmd/qrclaw-agent-host/binary → repo root
	dir := filepath.Dir(exe)
	for i := 0; i < 5; i++ {
		if _, err := os.Stat(filepath.Join(dir, "scripts", "mint-host-token-and-run.sh")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	cwd, _ := os.Getwd()
	return cwd
}

func mustConfigPath() string {
	p, _ := config.Path()
	return p
}
