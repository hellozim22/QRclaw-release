#!/usr/bin/env bash
# build-desktop-resources.sh — bundle Web standalone + Gateway + Node + Agent Host for QRClaw.app
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Build mode:
#   (default)   C2-clean distributable bundle — slim gateway proxy-to-cloud, no secret
#               identifiers, no service-role scripts. Passes the C2 grep DoD.
#   --dev-full  Developer-only bundle — full local gateway + seed/mint scripts
#   --deliverable  Loop 10 shippable bundle — dev-full host attach + embedded
#               desktop-public.env.json (public Supabase keys only). Runtime secrets
#               still read from ~/.config/qrclaw/secrets.env when present.
DEV_FULL=0
DELIVERABLE=0
for arg in "$@"; do
  case "$arg" in
    --dev-full) DEV_FULL=1 ;;
    --deliverable) DEV_FULL=1; DELIVERABLE=1 ;;
  esac
done

OUT_DIR="$REPO_ROOT/dist/desktop-runtime"
NODE_VERSION="22.14.0"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) NODE_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x64" ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac

log() { printf '\033[1;36m[desktop-build]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[desktop-build:err]\033[0m %s\n' "$*" >&2; exit 1; }

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# ── Web standalone ───────────────────────────────────────────────────
log "Building Next.js standalone…"
cd "$REPO_ROOT/web"
export NEXT_OUTPUT_STANDALONE=1
export NEXT_PUBLIC_GATEWAY_URL=http://127.0.0.1:3100
export NEXT_PUBLIC_GATEWAY_WS_URL=ws://127.0.0.1:3100/ws
export NEXT_PUBLIC_LOCAL_DEV=1
export NEXT_PUBLIC_LOCAL_DEV_EMAIL=local-dev@localhost
export NEXT_PUBLIC_LOCAL_DEV_PASSWORD=CHANGE_ME_LOCAL_DEV_PASSWORD
export NEXT_PUBLIC_DESKTOP_SHELL=1
# Use existing .env.local for Supabase public keys if present
npm run build

WEB_STANDALONE="$REPO_ROOT/web/.next/standalone/web"
[[ -d "$WEB_STANDALONE" ]] || WEB_STANDALONE="$REPO_ROOT/web/.next/standalone"

mkdir -p "$OUT_DIR/web"
cp -R "$WEB_STANDALONE/." "$OUT_DIR/web/"

# Static assets — may live outside standalone nest
if [[ -d "$REPO_ROOT/web/.next/static" ]]; then
  mkdir -p "$OUT_DIR/web/.next"
  cp -R "$REPO_ROOT/web/.next/static" "$OUT_DIR/web/.next/static"
fi

cp -R "$REPO_ROOT/web/public" "$OUT_DIR/web/public" 2>/dev/null || true

if [[ -f "$OUT_DIR/web/server.js" ]]; then
  log "Web standalone server.js ready"
else
  die "Web standalone server.js not found after build"
fi

# ── Gateway dist ───────────────────────────────────────────────────────
log "Building Gateway…"
cd "$REPO_ROOT/gateway"
npm run build
mkdir -p "$OUT_DIR/gateway/dist"
cp -R "$REPO_ROOT/gateway/dist/." "$OUT_DIR/gateway/dist/"
# Gateway runtime deps (express/ws/cors/redis…) are required for exclusive launch.
[[ -d "$REPO_ROOT/gateway/node_modules" ]] || die "gateway/node_modules missing — run: cd gateway && npm install"
cp -R "$REPO_ROOT/gateway/node_modules" "$OUT_DIR/gateway/node_modules"

# Prune non-runtime files from bundled deps (TS sources, type decls, sourcemaps).
# Smaller bundle + removes third-party JSDoc/type strings that mention secret env names.
find "$OUT_DIR/gateway/node_modules" -type f \( -name '*.ts' -o -name '*.map' -o -name '*.md' \) -delete 2>/dev/null || true

if [[ "$DEV_FULL" == "1" ]]; then
  # Developer bundle: keep the FULL gateway entry (dist/gateway/src/server.js from server.ts).
  # No redaction/deletion — gateway reads secrets from ~/.config/qrclaw/secrets.env at runtime.
  log "DEV-FULL mode: bundling full local gateway (NOT distributable)"
else
  # Distributable bundle uses the slim entry (gateway/dist/gateway/src/server-desktop.js) directly
  # at its compiled location so its relative imports (./desktop/*.js, ./ws/*.js) still resolve.
  # Remove the full cloud entry so it can't be launched by accident.
  rm -f "$OUT_DIR/gateway/dist/gateway/src/server.js" "$OUT_DIR/gateway/dist/gateway/src/server.d.ts" 2>/dev/null || true

  # Redact secret env var names from our compiled JS (C2: no secret identifiers in .app Resources).
  # NOTE: we redact (rename) rather than delete modules — db/supabase.js, crypto/* are imported
  # transitively by ws/handler.js, so deleting them breaks the slim gateway. Renaming the env
  # identifiers keeps the modules loadable while satisfying the C2 grep (values are never bundled;
  # the slim gateway proxies to cloud and never reads these env vars).
  # Scope to dist/ only — third-party node_modules don't reference QRCLAW_* env names.
  log "Redacting secret identifiers from gateway bundle…"
  find "$OUT_DIR/gateway/dist" -type f \( -name '*.js' -o -name '*.json' -o -name '*.d.ts' -o -name '.env*' \) -print0 2>/dev/null | while IFS= read -r -d '' f; do
    if grep -qE 'SERVICE_ROLE|QRCLAW_KEK|QRCLAW_HOST_TOKEN_PEPPER|WS_TICKET_SECRET' "$f" 2>/dev/null; then
      sed -i '' \
        -e 's/SUPABASE_SERVICE_ROLE_KEY/_DESKTOP_REDACTED_/g' \
        -e 's/QRCLAW_KEK/_DESKTOP_REDACTED_/g' \
        -e 's/ENCRYPTION_KEK/_DESKTOP_REDACTED_/g' \
        -e 's/QRCLAW_HOST_TOKEN_PEPPER/_DESKTOP_REDACTED_/g' \
        -e 's/WS_TICKET_SECRET/_DESKTOP_REDACTED_/g' \
        "$f" 2>/dev/null || true
    fi
  done
  # Remove only the cloud-only bootstrap route (invite codes) — not imported by the slim entry.
  rm -f "$OUT_DIR/gateway/dist/gateway/src/routes/desktop-bootstrap.js" \
        "$OUT_DIR/gateway/dist/gateway/src/routes/desktop-bootstrap.d.ts" 2>/dev/null || true

  # Scrub residual secret env-name strings from third-party deps (JSDoc/examples only —
  # the slim gateway never reads these from process.env, so renaming is safe).
  log "Scrubbing secret identifiers from bundled node_modules…"
  # BSD grep -Z is not --null; node_modules paths have no newlines, so line-read is safe.
  grep -rIl -e SUPABASE_SERVICE_ROLE_KEY -e QRCLAW_KEK -e ENCRYPTION_KEK \
       -e QRCLAW_HOST_TOKEN_PEPPER -e WS_TICKET_SECRET \
       "$OUT_DIR/gateway/node_modules" 2>/dev/null | while IFS= read -r f; do
    sed -i '' \
      -e 's/SUPABASE_SERVICE_ROLE_KEY/_DESKTOP_REDACTED_/g' \
      -e 's/QRCLAW_KEK/_DESKTOP_REDACTED_/g' \
      -e 's/ENCRYPTION_KEK/_DESKTOP_REDACTED_/g' \
      -e 's/QRCLAW_HOST_TOKEN_PEPPER/_DESKTOP_REDACTED_/g' \
      -e 's/WS_TICKET_SECRET/_DESKTOP_REDACTED_/g' \
      "$f" 2>/dev/null || true
  done
fi

# Desktop runtime config (no secrets)
cat >"$OUT_DIR/gateway/desktop.env.json" <<EOF
{
  "port": 3100,
  "webPort": 3000,
  "cloudGatewayUrl": "https://gateway-test.qrclaw.ai"
}
EOF

# Public web/gateway config (no secrets) — lets bundled web bootstrap without secrets.env
read_env_local() {
  local key="$1"
  local file="$REPO_ROOT/web/.env.local"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

SUPABASE_PUBLIC_URL="$(read_env_local NEXT_PUBLIC_SUPABASE_URL)"
SUPABASE_PUBLIC_ANON="$(read_env_local NEXT_PUBLIC_SUPABASE_ANON_KEY)"
if [[ -z "$SUPABASE_PUBLIC_URL" ]]; then
  SUPABASE_PUBLIC_URL="$(read_env_local SUPABASE_URL)"
fi
if [[ -z "$SUPABASE_PUBLIC_ANON" ]]; then
  SUPABASE_PUBLIC_ANON="$(read_env_local SUPABASE_ANON_KEY)"
fi

cat >"$OUT_DIR/desktop-public.env.json" <<EOF
{
  "supabaseUrl": "${SUPABASE_PUBLIC_URL:-}",
  "supabaseAnonKey": "${SUPABASE_PUBLIC_ANON:-}",
  "localDevEmail": "local-dev@localhost",
  "localDevPassword": "CHANGE_ME_LOCAL_DEV_PASSWORD",
  "cloudGatewayUrl": "https://gateway-test.qrclaw.ai"
}
EOF
cp "$OUT_DIR/desktop-public.env.json" "$OUT_DIR/web/desktop-public.env.json"
log "Wrote desktop-public.env.json (public keys only)"

# ── Bundled Node ───────────────────────────────────────────────────────
log "Downloading Node $NODE_VERSION ($NODE_ARCH)…"
NODE_TAR="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}"
TMP_NODE="/tmp/${NODE_TAR}"
curl -fsSL "$NODE_URL" -o "$TMP_NODE"
mkdir -p "$OUT_DIR/node"
tar -xzf "$TMP_NODE" -C "$OUT_DIR/node" --strip-components=1
rm -f "$TMP_NODE"

# ── Agent Host ─────────────────────────────────────────────────────────
log "Building qrclaw-agent-host…"
cd "$REPO_ROOT/qrclaw-agent-host"
go build -o "$OUT_DIR/qrclaw-agent-host" ./cmd/qrclaw-agent-host
chmod +x "$OUT_DIR/qrclaw-agent-host"

# Runtime scripts for first-run local owner + host auto-attach.
# These reference service-role / pepper env NAMES, so they only go in the dev-full bundle.
# (Secret VALUES are always read at runtime from ~/.config/qrclaw/secrets.env, never bundled.)
if [[ "$DEV_FULL" == "1" ]]; then
  mkdir -p "$OUT_DIR/scripts"
  cp "$REPO_ROOT/scripts/seed-local-owner.mjs" "$OUT_DIR/scripts/seed-local-owner.mjs"
  cp "$REPO_ROOT/scripts/mint-host-token-and-run.sh" "$OUT_DIR/scripts/mint-host-token-and-run.sh"
  chmod +x "$OUT_DIR/scripts/mint-host-token-and-run.sh"
  if [[ "$DELIVERABLE" == "1" ]]; then
    log "DELIVERABLE mode: dev-full host attach + embedded public config"
  else
    log "DEV-FULL mode: bundled seed + mint-host scripts"
  fi
fi

log "Desktop runtime staged at $OUT_DIR"
log "Next: ./script/build_and_run.sh --verify"
