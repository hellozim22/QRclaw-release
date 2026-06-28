#!/usr/bin/env bash
# build-deliverable-dmg.sh — Loop 10 one-shot: resources → .app → .dmg
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\033[1;32m[deliverable]\033[0m %s\n' "$*"; }

log "Stopping stray QRClaw / port listeners…"
pkill -x QRClaw 2>/dev/null || true
lsof -nP -iTCP:3000 -iTCP:3100 -iTCP:19515 -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
sleep 0.5

log "Building desktop runtime (--deliverable)…"
bash "$REPO_ROOT/scripts/build-desktop-resources.sh" --deliverable

log "Building QRClaw.app…"
bash "$REPO_ROOT/script/build_and_run.sh" build

log "Packaging DMG…"
bash "$REPO_ROOT/apps/macos/packaging/make-dmg.sh"

log "Static verify…"
node "$REPO_ROOT/tests/ecc-local-verify-macos-desktop.mjs"

log "Done: $REPO_ROOT/dist/QRClaw.dmg"
