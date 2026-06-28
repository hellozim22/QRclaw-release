//go:build e2e

// Package provider_test contains the end-to-end smoke harness that runs the
// real provider CLIs end-to-end. Gated behind the `e2e` build tag because it
// invokes external binaries that may be billable.
//
// Run with:
//
//	go test -tags=e2e ./internal/provider/...
//
// Each provider is detected first; if the CLI is missing, the run step is
// skipped for that provider (not failed), so the matrix still reports
// gracefully on hosts where not all 4 are installed. HEL-51 Wave 7 follow-up.
package provider_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/qrclaw/qrclaw-agent-host/internal/detect"
	"github.com/qrclaw/qrclaw-agent-host/internal/provider"

	// Register the four adapters.
	_ "github.com/qrclaw/qrclaw-agent-host/internal/provider/claude"
	_ "github.com/qrclaw/qrclaw-agent-host/internal/provider/codex"
	_ "github.com/qrclaw/qrclaw-agent-host/internal/provider/cursor"
	_ "github.com/qrclaw/qrclaw-agent-host/internal/provider/openclaw"
)

// smokePrompt is intentionally tiny and deterministic across providers.
const smokePrompt = "say hello in one line"

// providerTimeout caps any single provider Run call. Some CLIs do model
// round-trips, so give them breathing room but never block the harness.
const providerTimeout = 90 * time.Second

// smokeRow captures per-provider outcome for the matrix.
type smokeRow struct {
	Provider string `json:"provider"`
	Detected bool   `json:"detected"`
	Version  string `json:"version"`
	RunOK    bool   `json:"run_ok"`
	Bytes    int    `json:"bytes"`
	Notes    string `json:"notes"`
}

// TestE2ESmokeAllProviders detects every registered provider and, for each one
// that is present on the host, executes a one-shot Run with the canonical
// prompt. Results are written to E2E-SMOKE.matrix.json for artifact capture.
// The test is intentionally tolerant: missing CLIs are skipped (t.Skip-style
// entries in the matrix) but a detected CLI that returns an error, empty
// output, or looks like it leaked secrets fails the test.
func TestE2ESmokeAllProviders(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	results := detect.All(ctx)
	if len(results) == 0 {
		t.Fatal("detect.All returned no results; provider specs missing")
	}

	rows := make([]smokeRow, 0, len(results))
	for _, r := range results {
		rows = append(rows, runOne(t, ctx, r))
	}

	writeMatrix(t, rows)

	// Fail if every provider was missing — that almost certainly means the
	// harness is wrong, not the host.
	anyPresent := false
	for _, row := range rows {
		if row.Detected {
			anyPresent = true
			break
		}
	}
	if !anyPresent {
		t.Fatal("no providers detected on this host; smoke cannot report anything useful")
	}
}

// runOne exercises a single provider. Name intentionally avoids t.Run subtests
// so the matrix stays linear in CI logs.
func runOne(t *testing.T, ctx context.Context, r detect.Result) smokeRow {
	t.Helper()
	row := smokeRow{Provider: string(r.Provider), Detected: r.Found, Version: r.Version}

	if !r.Found {
		row.Notes = "cli not on PATH; skipped"
		t.Logf("[%s] SKIP — %s", r.Provider, row.Notes)
		return row
	}
	factory, ok := provider.FactoryFor(r.Provider)
	if !ok {
		row.Notes = "no adapter factory registered"
		t.Errorf("[%s] FAIL — %s", r.Provider, row.Notes)
		return row
	}
	adapter, err := factory(r)
	if err != nil {
		row.Notes = "factory error: " + err.Error()
		t.Errorf("[%s] FAIL — %s", r.Provider, row.Notes)
		return row
	}

	cctx, cancel := context.WithTimeout(ctx, providerTimeout)
	defer cancel()
	out, err := adapter.Run(cctx, provider.RunInput{Content: smokePrompt})
	if err != nil {
		row.Notes = "run error: " + err.Error()
		t.Errorf("[%s] FAIL — %s", r.Provider, row.Notes)
		return row
	}
	trimmed := strings.TrimSpace(out)
	if trimmed == "" {
		row.Notes = "empty stdout"
		t.Errorf("[%s] FAIL — %s", r.Provider, row.Notes)
		return row
	}
	if s := scanForSecretLeak(out); s != "" {
		// Do not log the offending content — just the label.
		row.Notes = "possible secret leak: " + s
		t.Errorf("[%s] FAIL — %s", r.Provider, row.Notes)
		return row
	}

	row.RunOK = true
	row.Bytes = len(out)
	row.Notes = "ok; " + clipPreview(trimmed)
	t.Logf("[%s] OK — %d bytes, preview=%q", r.Provider, len(out), clipPreview(trimmed))
	return row
}

// scanForSecretLeak looks for tokens the red-line policy prohibits from ever
// appearing in provider output. Returns a short label, never the secret.
func scanForSecretLeak(s string) string {
	l := strings.ToLower(s)
	markers := []string{"dek=", "kek=", "plaintext=", "-----begin ", "qrclaw_agent_token"}
	for _, m := range markers {
		if strings.Contains(l, m) {
			return "marker:" + m
		}
	}
	return ""
}

// clipPreview returns a short, single-line preview of s. Safe to log because
// it's provider output for "say hello" — no secrets expected, and we've
// already scanned above.
func clipPreview(s string) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > 80 {
		s = s[:80] + "…"
	}
	return s
}

// writeMatrix persists the matrix JSON next to the test so CI artifact upload
// can pick it up by a stable path.
func writeMatrix(t *testing.T, rows []smokeRow) {
	t.Helper()
	path := filepath.Join(".", "E2E-SMOKE.matrix.json")
	data, err := json.MarshalIndent(rows, "", "  ")
	if err != nil {
		t.Fatalf("marshal matrix: %v", err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		t.Fatalf("write matrix: %v", err)
	}
	fmt.Printf("\n=== E2E SMOKE MATRIX ===\n")
	for _, row := range rows {
		fmt.Printf("  %-14s detected=%-5v run_ok=%-5v version=%-20s notes=%s\n",
			row.Provider, row.Detected, row.RunOK, row.Version, row.Notes)
	}
	fmt.Printf("wrote %s\n", path)
}
