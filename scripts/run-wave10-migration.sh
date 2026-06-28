#!/usr/bin/env bash
set -euo pipefail

SECRETS_FILE="${QRCLAW_SECRETS_FILE:-${HOME}/.config/qrclaw/secrets.env}"
if [[ -f "${SECRETS_FILE}" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "${SECRETS_FILE}"
  set +a
fi

PROJECT_REF="${SUPABASE_PROJECT_ID:-zyxqadubhwrnsoujiyir}"
MIGRATION_VERSION="20260428"
MIGRATION_FILE="supabase/migrations/20260428_wave10_runtime_session.sql"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

remote_has_migration() {
  awk -F'|' -v version="${MIGRATION_VERSION}" '
    function trim(value) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      return value
    }
    NF >= 2 && trim($2) == version { found = 1 }
    END { exit found ? 0 : 1 }
  ' "$1"
}

require_command supabase

[[ -f "${MIGRATION_FILE}" ]] || fail "missing migration file: ${MIGRATION_FILE}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" && ! -s "${HOME}/.supabase/access-token" ]]; then
  fail "Supabase CLI is not logged in. Run 'supabase login' first or set SUPABASE_ACCESS_TOKEN."
fi

tmp_migration_list="$(mktemp)"
trap 'rm -f "${tmp_migration_list}"' EXIT

printf 'Checking Supabase project %s migration history...\n' "${PROJECT_REF}"
supabase migration list --linked --agent no >"${tmp_migration_list}"

if remote_has_migration "${tmp_migration_list}"; then
  printf 'Migration %s is already recorded remotely; nothing to apply.\n' "${MIGRATION_VERSION}"
  exit 0
fi

printf 'Applying %s to linked Supabase project %s...\n' "${MIGRATION_FILE}" "${PROJECT_REF}"
supabase db query --linked --agent no --file "${MIGRATION_FILE}"

printf 'Recording migration %s as applied in Supabase migration history...\n' "${MIGRATION_VERSION}"
supabase migration repair "${MIGRATION_VERSION}" --status applied --linked --agent no

supabase migration list --linked --agent no >"${tmp_migration_list}"
if ! remote_has_migration "${tmp_migration_list}"; then
  fail "migration ${MIGRATION_VERSION} was applied but is not visible in remote migration history"
fi

printf 'Wave 10 migration %s is applied and recorded.\n' "${MIGRATION_VERSION}"
