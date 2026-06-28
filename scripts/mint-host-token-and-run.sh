#!/usr/bin/env bash
# mint-host-token-and-run.sh — Wave 10 one-shot agent-host bring-up.
#
# What it does (real, no mocks):
#   1. Loads SUPABASE_SERVICE_ROLE_KEY from ~/.config/qrclaw/secrets.env.
#   2. Loads QRCLAW_HOST_TOKEN_PEPPER from gateway/.env.
#   3. Reads target owner_id from argv / env (defaults to the test owner).
#   4. Generates a real host token (qrclaw_host_<random>), HMAC-hashes it with
#      the same pepper the gateway uses, and INSERTs a row into
#      public.agent_host_tokens via Supabase REST (service_role).
#      This is the exact same path `POST /api/owner/host-tokens` takes — we're
#      just bypassing the web UI so the user never copy/pastes a token.
#   5. Launches /tmp/qrclaw-host against the local gateway (:3100) using the
#      freshly-minted token as the WS ticket. The daemon's built-in detect loop
#      registers claude / cursor / codex / openclaw every 5s.
#
# Result: /chat sees 4/4 ONLINE without any manual token copy.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS=${QRCLAW_SECRETS:-$HOME/.config/qrclaw/secrets.env}
GATEWAY_ENV="$REPO_ROOT/gateway/.env"
HOST_BIN=${QRCLAW_HOST_BIN:-/tmp/qrclaw-host}
LOG_DIR=${QRCLAW_LOG_DIR:-/tmp/qrclaw-logs}
mkdir -p "$LOG_DIR"

# First positional arg is either the user_id (auth.users.id) or the owner_id
# (owners.id). Default is the test account's user_id. We resolve it to the
# owners.id below so the FK into agent_host_tokens is always correct.
#
# Wave 10 B2: the `on_auth_user_created` trigger in supabase/migrations now
# auto-creates owners rows at signup, so the fallback branch below should
# rarely fire. We keep it (with ON CONFLICT semantics via the upsert Prefer
# header) as a safety net for databases that predate the trigger.
INPUT_ID=${1:-${QRCLAW_USER_ID:-${QRCLAW_OWNER_ID:-34cc335a-36fe-499d-a594-fdc15b460ded}}}
HOST_LABEL=${QRCLAW_HOST_LABEL:-local-dev-$(hostname -s)}
# GATEWAY_PORT: prefer explicit env (desktop bundle has no gateway/.env), else read .env, else 3100.
if [[ -n "${QRCLAW_GATEWAY_PORT:-}" ]]; then
  GATEWAY_PORT="$QRCLAW_GATEWAY_PORT"
elif [[ -r "$GATEWAY_ENV" ]]; then
  GATEWAY_PORT=$(grep -E '^PORT=' "$GATEWAY_ENV" | head -n1 | cut -d= -f2- | tr -d '\r')
fi
GATEWAY_PORT=${GATEWAY_PORT:-3100}
GATEWAY_WS=${QRCLAW_WS_URL:-ws://localhost:${GATEWAY_PORT}/ws}

log()  { printf '\033[1;36m[mint-host]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[mint-host:err]\033[0m %s\n' "$*" >&2; exit 1; }

# ── Load secrets ────────────────────────────────────────────────────
[[ -r "$SECRETS" ]] || die "secrets file not found: $SECRETS"
# shellcheck disable=SC1090
source "$SECRETS"
: "${SUPABASE_URL:?SUPABASE_URL must be set (secrets.env)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY must be set (secrets.env)}"

# Pepper: prefer env (desktop bundle / secrets.env), else extract from gateway/.env.
PEPPER="${QRCLAW_HOST_TOKEN_PEPPER:-}"
if [[ -z "$PEPPER" && -r "$GATEWAY_ENV" ]]; then
  PEPPER=$(grep -E '^QRCLAW_HOST_TOKEN_PEPPER=' "$GATEWAY_ENV" | head -n1 | cut -d= -f2- || true)
fi
[[ -n "$PEPPER" ]] || die "QRCLAW_HOST_TOKEN_PEPPER not set (env or $GATEWAY_ENV)"

[[ -x "$HOST_BIN" ]] || die "host binary missing: $HOST_BIN"

sb_get()  { curl -fsS -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "$1"; }
sb_post() { curl -fsS -X POST -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -H 'Prefer: return=representation' "$1" -d "$2"; }

# ── Resolve owners.id from input (user_id OR owner_id) ──────────────
log "resolving owner for input=$INPUT_ID"
OWNER_ROW=$(sb_get "$SUPABASE_URL/rest/v1/owners?or=(id.eq.$INPUT_ID,user_id.eq.$INPUT_ID)&select=id,user_id,email")
OWNER_ID=$(printf '%s' "$OWNER_ROW" | python3 -c 'import sys,json; rows=json.load(sys.stdin); print(rows[0]["id"] if rows else "")')

if [[ -z "$OWNER_ID" ]]; then
    # Fallback for databases without the B2 trigger: treat the input as a
    # user_id and upsert the owners row ourselves. Uses the same
    # on_conflict=user_id semantics the trigger relies on, so running this
    # against a trigger-enabled DB is a harmless no-op.
    USER_ROW=$(sb_get "$SUPABASE_URL/auth/v1/admin/users?id=$INPUT_ID" || true)
    USER_EMAIL=$(printf '%s' "$USER_ROW" | python3 -c 'import sys,json,os; d=json.load(sys.stdin); u=(d.get("users") or [d])[0]; print(u.get("email",""))' 2>/dev/null || true)
    [[ -n "$USER_EMAIL" ]] || die "user $INPUT_ID not found in auth.users"
    log "upserting owners row for $USER_EMAIL ($INPUT_ID)"
    NEW_OWNER=$(curl -fsS -X POST \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H 'Content-Type: application/json' \
        -H 'Prefer: resolution=merge-duplicates,return=representation' \
        "$SUPABASE_URL/rest/v1/owners?on_conflict=user_id" \
        -d "{\"user_id\":\"$INPUT_ID\",\"display_name\":\"${USER_EMAIL%%@*}\",\"email\":\"$USER_EMAIL\"}")
    OWNER_ID=$(printf '%s' "$NEW_OWNER" | python3 -c 'import sys,json; rows=json.load(sys.stdin); print(rows[0]["id"] if rows else "")')

    if [[ -z "$OWNER_ID" ]]; then
        # Trigger already created the row and merge-duplicates returned empty;
        # re-fetch it.
        OWNER_ROW=$(sb_get "$SUPABASE_URL/rest/v1/owners?user_id=eq.$INPUT_ID&select=id")
        OWNER_ID=$(printf '%s' "$OWNER_ROW" | python3 -c 'import sys,json; rows=json.load(sys.stdin); print(rows[0]["id"] if rows else "")')
    fi
    [[ -n "$OWNER_ID" ]] || die "failed to upsert/resolve owner row for $INPUT_ID"
fi
log "owner_id resolved → $OWNER_ID"

# ── Mint plaintext token + HMAC-SHA256 hash ─────────────────────────
RANDOM_SUFFIX=$(python3 -c 'import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).rstrip(b"=").decode())')
TOKEN="qrclaw_host_${RANDOM_SUFFIX}"
TOKEN_HASH=$(printf '%s' "$TOKEN" | openssl dgst -sha256 -hmac "$PEPPER" -binary | xxd -p -c 256)

log "minted plaintext token (local only): ${TOKEN:0:24}… (hash: ${TOKEN_HASH:0:12}…)"

# ── INSERT into agent_host_tokens via Supabase REST ─────────────────
SCOPE_JSON=$(cat <<JSON
{
  "owner_id": "$OWNER_ID",
  "can_register_local": true,
  "can_receive_private_runs": true,
  "allowed_provider_set": ["openclaw", "claude", "cursor", "codex", "pi"]
}
JSON
)

INSERT_PAYLOAD=$(cat <<JSON
{
  "owner_id": "$OWNER_ID",
  "token_hash": "$TOKEN_HASH",
  "label": "$HOST_LABEL",
  "scope": $SCOPE_JSON
}
JSON
)

resp=$(curl -fsS -X POST \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    -H 'Prefer: return=representation' \
    "$SUPABASE_URL/rest/v1/agent_host_tokens" \
    -d "$INSERT_PAYLOAD")

TOKEN_ID=$(printf '%s' "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["id"])')
log "inserted agent_host_tokens row id=$TOKEN_ID owner=$OWNER_ID"

# ── host_id: use a deterministic UUID per machine so re-runs are idempotent ──
HOST_ID=${QRCLAW_HOST_ID:-$(python3 -c "import uuid; print(uuid.uuid5(uuid.NAMESPACE_DNS, 'qrclaw-host-$(hostname -s)-$OWNER_ID'))")}
log "host_id=$HOST_ID"

# ── login (stores token on disk so host run can pick it up) ─────────
printf '%s' "$TOKEN" | "$HOST_BIN" login --name default >/dev/null
log "host login stored"

if [[ "${QRCLAW_MINT_ONLY:-0}" == "1" ]]; then
  log "mint-only mode — skipping daemon launch"
  exit 0
fi

# ── launch host daemon (Multica-style) ──────────────────────────────
"$HOST_BIN" daemon stop >/dev/null 2>&1 || true
if pkill -f 'qrclaw-host run' 2>/dev/null; then
  log "stopped legacy qrclaw-host run process"
fi

log "starting agent host daemon → $GATEWAY_WS (host_id=$HOST_ID)"
export QRCLAW_WS_URL="$GATEWAY_WS"
export QRCLAW_HOST_ID="$HOST_ID"
if "$HOST_BIN" daemon start 2>&1 | tee -a "$LOG_DIR/daemon-start.log"; then
  log "daemon start OK"
else
  log "daemon start fallback → direct run"
  LOG_FILE="$LOG_DIR/agent-host.log"
  QRCLAW_WS_URL="$GATEWAY_WS" QRCLAW_HOST_ID="$HOST_ID" \
      nohup "$HOST_BIN" run --name default --host-id "$HOST_ID" --display-name "$HOST_LABEL" \
      >"$LOG_FILE" 2>&1 &
  echo $! >"$LOG_DIR/agent-host.pid"
  sleep 2
  if grep -q 'registered host' "$LOG_FILE" 2>/dev/null; then
    log "host registered OK (see $LOG_FILE)"
  else
    log "host is starting… recent log:"
    tail -n 20 "$LOG_FILE" || true
  fi
fi

log "────────────────────────────────────────"
log "Open http://localhost:3000/chat → should flip to 4/4 ONLINE within ~5s"
log "health: curl -s http://127.0.0.1:19515/health"
log "logs: $LOG_DIR/"
log "────────────────────────────────────────"
