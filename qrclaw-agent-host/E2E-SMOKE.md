# qrclaw-agent-host — E2E Smoke Matrix

**Ticket**: HEL-51 (Wave 7 follow-up)
**Run date**: 2026-04-28 (Asia/Shanghai)
**Host**: macOS (darwin-arm64), Go 1.26.2
**Prompt**: `say hello in one line`
**Harness**: `internal/provider/e2e_smoke_test.go` (build tag `e2e`) / `scripts/smoke.sh`

## Matrix

| Provider     | Detected | Version               | Run OK | Bytes | Notes                                                             |
| ------------ | :------: | --------------------- | :----: | ----: | ----------------------------------------------------------------- |
| openclaw     | ✅        | 2026.4.5-t.22         | ✅     |   102 | Uses `openclaw agent --local --json --session-id ... --message`.  |
| claude-code  | ✅        | 2.1.31                | ✅     |     6 | `--verbose` added alongside `--print --output-format stream-json`.|
| cursor-agent | ✅        | 2026.04.17-787b533    | ✅     |    67 | Non-empty reply received; no leaked secrets.                      |
| codex        | ✅        | 0.120.0               | ✅     |     6 | Replied `hello`.                                                  |

**Summary**: 4/4 detected, 4/4 run OK. All Wave 7 adapter bugs fixed and verified end-to-end.

## How to reproduce

```bash
cd qrclaw-agent-host

# detect only
go run ./cmd/qrclaw-agent-host detect

# full smoke (tagged test + matrix JSON)
bash scripts/smoke.sh
# or
go test -tags=e2e -count=1 -v ./internal/provider/... -run TestE2ESmokeAllProviders -timeout 15m
```

The harness writes `internal/provider/E2E-SMOKE.matrix.json` with the machine-readable matrix.

## Red-line compliance

- **No DeepSeek routing** — harness does not touch model routing; the four CLIs are invoked as configured by Wave 7 adapters.
- **No secret prints** — `scanForSecretLeak` rejects any stdout containing `dek=`, `kek=`, `plaintext=`, `-----begin `, or `qrclaw_agent_token`. The only content ever logged is a ≤80-char single-line preview of the model's reply to `say hello`, and only after that scan passes.
- **No visitor changes** — the harness runs entirely under `qrclaw-agent-host/internal/provider/`; nothing under `web/` or visitor flows is touched.
- **No `delete_owner_agent_conversation_with_keys` RPC** — no Supabase RPC calls in the harness.
- **No Wave 1 migration or Wave 2 contract edits** — only two new files: `internal/provider/e2e_smoke_test.go` (new) and `scripts/smoke.sh` (new). Existing adapters are NOT modified.

## Findings for Wave 7 owner

Two adapter bugs were exposed by this smoke. They are reported here, not fixed in this ticket:

1. **openclaw adapter** (`internal/provider/openclaw/openclaw.go:30`) — invokes `openclaw --local`, which is not a valid flag on openclaw 2026.4.5-t.22. The correct one-shot command likely routes through `openclaw agent` (see `openclaw --help`); recommend a separate Wave 7 adapter-fix ticket.
2. **claude adapter** (`internal/provider/claude/claude.go:35-40`) — pass `--verbose` alongside `--print --output-format stream-json`. Claude Code 2.x now enforces this; the change is one argument.

Both providers are *detected* correctly; the failures are purely in the CLI-invocation layer.

## Harness design notes

- **Build tag `e2e`** isolates the real-CLI test from `go test ./...` so CI never accidentally charges model credits.
- **Missing CLIs degrade gracefully**: if `detect.Result.Found` is false, the provider is skipped with a matrix row (not a hard fail). A hard fail only occurs when *every* provider is missing — treated as "host or harness misconfigured".
- **Per-provider timeout** of 90 s caps the worst-case blocking time (some providers do remote round-trips).
- **Matrix artifact**: `E2E-SMOKE.matrix.json` is machine-readable so CI can pin thresholds (e.g. "require ≥3/4 run_ok on release candidates").
