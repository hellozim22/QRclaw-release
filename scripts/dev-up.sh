#!/usr/bin/env bash
# dev-up.sh — 笔笔省多智能体 Chat 本地一键启动（Web :3000 + Gateway + Redis + Host）
#
# 用法:
#   bash scripts/setup-local-env.sh   # 首次
#   bash scripts/dev-up.sh            # 启动并自动 seed 用户 + attach Host
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

HOST_BIN=${QRCLAW_HOST_BIN:-/tmp/qrclaw-host}
LOG_DIR=${QRCLAW_LOG_DIR:-/tmp/bibisheng-agent-chat-logs}
LOCAL_OWNER_FILE="$REPO_ROOT/.local-dev-owner.json"
mkdir -p "$LOG_DIR"

log() { printf '\033[1;36m[dev-up]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev-up:warn]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[dev-up:err]\033[0m %s\n' "$*" >&2; exit 1; }

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN -P -n 2>/dev/null | tail -n +2 | head -n 1
}

wait_http() {
  local url=$1 label=$2 tries=${3:-45}
  for ((i=1; i<=tries; i++)); do
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then
      log "$label ready ($url)"
      return 0
    fi
    sleep 1
  done
  die "$label 在 ${tries}s 内未就绪: $url"
}

resolve_local_user_id() {
  if [[ -n "${QRCLAW_ATTACH_USER_ID:-}" ]]; then
    printf '%s' "$QRCLAW_ATTACH_USER_ID"
    return 0
  fi
  if [[ -r "$LOCAL_OWNER_FILE" ]]; then
    local id=""
    id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("user_id",""))' "$LOCAL_OWNER_FILE" 2>/dev/null || true)"
    if [[ -n "$id" ]]; then
      printf '%s' "$id"
      return 0
    fi
  fi
  printf '%s' '34cc335a-36fe-499d-a594-fdc15b460ded'
}

[[ -f "$REPO_ROOT/gateway/.env" ]] || die "缺少 gateway/.env — 先运行: bash scripts/setup-local-env.sh"
[[ -f "$REPO_ROOT/web/.env.local" ]] || die "缺少 web/.env.local — 先运行: bash scripts/setup-local-env.sh"

GATEWAY_PORT=$(grep -E '^PORT=' "$REPO_ROOT/gateway/.env" | head -n1 | cut -d= -f2- | tr -d '\r')
GATEWAY_PORT=${GATEWAY_PORT:-3100}
WEB_PORT=3000

# ── 0. Redis ─────────────────────────────────────────────────────────
if redis-cli ping >/dev/null 2>&1; then
  log "redis 已运行"
else
  log "启动 redis-server"
  redis-server --daemonize yes || die "redis 启动失败"
  sleep 1
fi

# ── 0b. 本地用户 seed（无登录页） ─────────────────────────────────────
if command -v node >/dev/null 2>&1 && [[ -f "$REPO_ROOT/scripts/seed-local-owner.mjs" ]]; then
  log "seed 本地用户 (local-dev@localhost)"
  node "$REPO_ROOT/scripts/seed-local-owner.mjs" >/dev/null 2>&1 \
    || warn "seed-local-owner 失败 — 将使用已有 .local-dev-owner.json"
fi
LOCAL_USER_ID="$(resolve_local_user_id)"
log "attach user_id=${LOCAL_USER_ID}"

# ── 1. 依赖（首次） ─────────────────────────────────────────────────
if [[ ! -d "$REPO_ROOT/shared/node_modules" ]]; then
  log "安装 shared 依赖…"
  (cd "$REPO_ROOT/shared" && npm install)
fi
if [[ ! -d "$REPO_ROOT/web/node_modules" ]]; then
  log "安装 web 依赖…"
  (cd "$REPO_ROOT/web" && npm install)
fi
if [[ ! -d "$REPO_ROOT/gateway/node_modules" ]]; then
  log "安装 gateway 依赖…"
  (cd "$REPO_ROOT/gateway" && npm install)
fi

# ── 2. Gateway ──────────────────────────────────────────────────────
if port_in_use "$GATEWAY_PORT" | grep -q 'node'; then
  log "gateway 已在 :$GATEWAY_PORT 监听"
else
  log "启动 gateway :$GATEWAY_PORT"
  (
    cd "$REPO_ROOT/gateway"
    nohup npm run dev >"$LOG_DIR/gateway.log" 2>&1 &
    echo $! >"$LOG_DIR/gateway.pid"
  )
  wait_http "http://localhost:$GATEWAY_PORT/health" "gateway"
fi

# ── 3. Web ──────────────────────────────────────────────────────────
if port_in_use "$WEB_PORT" | grep -q 'node'; then
  log "web 已在 :$WEB_PORT 监听"
else
  log "启动 web :$WEB_PORT"
  (
    cd "$REPO_ROOT/web"
    nohup npm run dev >"$LOG_DIR/web.log" 2>&1 &
    echo $! >"$LOG_DIR/web.pid"
  )
  wait_http "http://localhost:$WEB_PORT/" "web" 60
fi

# ── 4. Agent Host 二进制 ─────────────────────────────────────────────
if [[ ! -x "$HOST_BIN" ]]; then
  if command -v go >/dev/null 2>&1; then
    log "编译 agent-host → $HOST_BIN"
    (cd "$REPO_ROOT/qrclaw-agent-host" && go build -o "$HOST_BIN" ./cmd/qrclaw-agent-host)
  else
    warn "未找到 Go / agent-host 二进制 — 跳过（Agent 会显示 Offline）"
    warn "安装 Go 后重跑，或: cd qrclaw-agent-host && go build -o $HOST_BIN ./cmd/qrclaw-agent-host"
  fi
fi
if [[ -x "$HOST_BIN" ]]; then
  log "agent-host: $("$HOST_BIN" --version 2>/dev/null || echo ok)"
  if [[ "${QRCLAW_AUTO_ATTACH_HOST:-1}" == "1" ]]; then
    log "Multica 式 setup: qrclaw-setup.sh"
    bash "$REPO_ROOT/scripts/qrclaw-setup.sh" \
      >>"$LOG_DIR/qrclaw-setup.log" 2>&1 \
      || warn "qrclaw-setup 失败，见 $LOG_DIR/qrclaw-setup.log"
  fi
fi

log "────────────────────────────────────────"
log "Chat  : http://localhost:$WEB_PORT/chat  （打开即用，无需登录）"
log "Gateway: http://localhost:$GATEWAY_PORT/health"
log "日志  : $LOG_DIR/"
if [[ -x "$HOST_BIN" ]]; then
  log "本机 Agent: dev-up 已尝试 auto-attach；Offline 时重跑 dev-up"
else
  log "下一步: 安装 Go 后重跑 dev-up 以编译 agent-host"
fi
log "────────────────────────────────────────"
