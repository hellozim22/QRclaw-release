#!/usr/bin/env bash
# qrclaw-agent-host E2E smoke — HEL-51 Wave 7 follow-up.
#
# Wraps the e2e-tagged Go test so humans (and CI) can invoke it with a single
# command. The Go test does the real work: detect + Adapter.Run per provider,
# then writes internal/provider/E2E-SMOKE.matrix.json.
#
# Usage: bash scripts/smoke.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

echo "qrclaw-agent-host E2E smoke"
echo "  repo: $root"
echo "  go:   $(go version)"
echo

# Detect first so missing CLIs are obvious up top before we spend model
# budget on Run calls.
echo "== detect =="
go run ./cmd/qrclaw-agent-host detect
echo

# Run the tagged test. -count=1 disables Go's test cache so we always hit
# the real CLIs. -v surfaces per-provider log lines.
echo "== smoke =="
go test -tags=e2e -count=1 -v ./internal/provider/... -run TestE2ESmokeAllProviders -timeout 15m

echo
echo "matrix: $root/internal/provider/E2E-SMOKE.matrix.json"
