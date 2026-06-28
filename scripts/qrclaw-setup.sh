#!/usr/bin/env bash
# qrclaw-setup.sh — Multica `setup self-host` equivalent for QRClaw local dev.
#
# Detect CLIs → write ~/.qrclaw/config.json → mint host token → daemon start (:19515/health)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_BIN=${QRCLAW_HOST_BIN:-/tmp/qrclaw-host}
GATEWAY_ENV="$REPO_ROOT/gateway/.env"
LOCAL_OWNER_FILE="$REPO_ROOT/.local-dev-owner.json"

log() { printf '\033[1;36m[qrclaw-setup]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[qrclaw-setup:err]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$GATEWAY_ENV" ]] || die "缺少 gateway/.env — 先运行: bash scripts/setup-local-env.sh"

GATEWAY_PORT=$(grep -E '^PORT=' "$GATEWAY_ENV" | head -n1 | cut -d= -f2- | tr -d '\r')
GATEWAY_PORT=${GATEWAY_PORT:-3100}

if command -v node >/dev/null 2>&1 && [[ -f "$REPO_ROOT/scripts/seed-local-owner.mjs" ]]; then
  log "seed 本地用户 (local-dev@localhost)"
  node "$REPO_ROOT/scripts/seed-local-owner.mjs" >/dev/null 2>&1 \
    || log "seed 跳过（使用已有 .local-dev-owner.json）"
fi

USER_ID=${QRCLAW_ATTACH_USER_ID:-}
if [[ -z "$USER_ID" && -r "$LOCAL_OWNER_FILE" ]]; then
  USER_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("user_id",""))' "$LOCAL_OWNER_FILE" 2>/dev/null || true)"
fi
[[ -n "$USER_ID" ]] || die "无法解析 user_id — 先运行 seed-local-owner.mjs"

if [[ ! -x "$HOST_BIN" ]]; then
  command -v go >/dev/null 2>&1 || die "需要 Go 编译 agent-host"
  log "编译 agent-host → $HOST_BIN"
  (cd "$REPO_ROOT/qrclaw-agent-host" && go build -o "$HOST_BIN" ./cmd/qrclaw-agent-host)
fi

export QRCLAW_REPO_ROOT="$REPO_ROOT"
export QRCLAW_GATEWAY_HTTP="http://127.0.0.1:${GATEWAY_PORT}"
export QRCLAW_WS_URL="ws://127.0.0.1:${GATEWAY_PORT}/ws"
export QRCLAW_WEB_URL="http://localhost:3000"

log "setup self-host (user_id=${USER_ID})"
"$HOST_BIN" setup self-host \
  --repo-root "$REPO_ROOT" \
  --user-id "$USER_ID" \
  --gateway-http "$QRCLAW_GATEWAY_HTTP" \
  --gateway-ws "$QRCLAW_WS_URL" \
  --web-url "$QRCLAW_WEB_URL"

log "daemon status:"
"$HOST_BIN" daemon status || true

log "health probe:"
curl -fsS "http://127.0.0.1:19515/health" 2>/dev/null | python3 -m json.tool || log "health 尚未就绪（daemon 可能仍在注册）"
