# Database Teammate Progress Notes

> Auto-created at Agent Teams startup. Update after each sub-task completes.
> Must update before /compact. Record Failed Attempts.

## Progress
- [x] Phase 0: Create Supabase Schema (9 tables + RLS) -- migration SQL written
- [x] Phase 0: Migration SQL complete (local, remote execution deferred)
- [x] Phase 1: Edge Function — `visitor-ws-ticket` (Visitor WS ticket issuance)
- [x] Phase 1: Edge Function — `agent-ws-ticket` (Agent WS ticket issuance)
- [x] Phase 1: Shared utilities (_shared/cors.ts, jwt.ts, supabase.ts)
- [x] Phase 2+3: Edge Function — `get-decrypted-messages` (Owner message decryption)
- [x] Phase 2+3: Edge Function — `create-qrcode` (QR code creation with slug)
- [x] Phase 2+3: Edge Function — `manage-qrcode` (QR code status management)
- [x] Phase 2+3: Edge Function — `claim-agent` (Agent registration + API key)
- [x] Phase 2+3: Shared utility — `_shared/auth.ts` (Owner JWT authentication)
- [x] Task #10: Edge Function — `data-retention` (plan-tier message cleanup + orphan removal)
- [x] Task #10: Edge Function — `usage-stats` (owner usage aggregation)
- [x] Task #16: Phase 6 security hardening — audit RLS, harden SECURITY DEFINER functions, Edge Function auth review
- [x] Task #19: Phase 7 production migration prep — migration guide, env docs, backup/restore, seed data, checklist

- [x] Code Review Fixes: 7 issues (CRITICAL-1, CRITICAL-2, HIGH-1, HIGH-3, HIGH-4, MEDIUM-1, LOW-3)

## Current Task
Code review fixes: COMPLETE (7 issues resolved across 3 files)

## Completed Work

### Migration file created
- **File**: `supabase/migrations/20260312_init_schema.sql`
- **Tables**: 9 tables created (8 specified + `message_deliveries` from P7.1 consensus)

| # | Table | RLS | Policies | Notes |
|---|-------|-----|----------|-------|
| 1 | `owners` | ENABLE + FORCE | SELECT/UPDATE/INSERT own | Linked to auth.users, locale field |
| 2 | `agents` | ENABLE + FORCE | Full CRUD own | status: pending/active/suspended |
| 3 | `qrcodes` | ENABLE + FORCE | SELECT/INSERT/UPDATE own | slug >= 12 chars, status: active/paused/revoked/draft |
| 4 | `sessions` | ENABLE + FORCE | None (service_role only) | Session token, silent merge support |
| 5 | `conversations` | ENABLE + FORCE | SELECT/DELETE own | Message count (bigint), 24h timeout |
| 6 | `encryption_keys` | ENABLE + FORCE | DELETE own only | Per-conversation DEK, envelope encryption |
| 7 | `messages` | ENABLE + FORCE | SELECT own | Immutable, content_encrypted bytea, no status col (per P7.1) |
| 8 | `message_deliveries` | ENABLE + FORCE | SELECT own | Delivery tracking per P7.1 dual-table model |
| 9 | `usage_logs` | ENABLE + FORCE | SELECT own | Partitioned by month (12 + default) |

### Edge Functions created (Phase 1)

| Function | Path | Protocol | Description |
|----------|------|----------|-------------|
| `visitor-ws-ticket` | `supabase/functions/visitor-ws-ticket/index.ts` | §P2.3 | Issues 30s JWT for visitor WS auth |
| `agent-ws-ticket` | `supabase/functions/agent-ws-ticket/index.ts` | §P2.2 | Issues 30s JWT for agent WS auth |

### Shared utilities

| File | Purpose |
|------|---------|
| `_shared/cors.ts` | CORS headers, preflight handler, JSON/error response helpers |
| `_shared/jwt.ts` | HMAC-SHA256 JWT signing, visitor/agent ticket creation (30s TTL) |
| `_shared/supabase.ts` | Supabase service_role client singleton |
| `_shared/auth.ts` | Owner JWT authentication, user-scoped Supabase client |

### Edge Functions created (Phase 2+3)

| Function | Path | Protocol | Description |
|----------|------|----------|-------------|
| `get-decrypted-messages` | `supabase/functions/get-decrypted-messages/index.ts` | §P7.3 | Owner-only decrypted message retrieval with cursor pagination |
| `create-qrcode` | `supabase/functions/create-qrcode/index.ts` | §P2.7 | QR code creation with auto/custom slug generation |
| `manage-qrcode` | `supabase/functions/manage-qrcode/index.ts` | §P2.7 | QR code PATCH (status/profile/theme) + DELETE (soft revoke) |
| `claim-agent` | `supabase/functions/claim-agent/index.ts` | §P2.6 | Agent registration (POST) + confirmation (PATCH) |

### Edge Functions created (Task #10)

| Function | Path | Auth | Description |
|----------|------|------|-------------|
| `data-retention` | `supabase/functions/data-retention/index.ts` | service_role / cron | Plan-tier message cleanup (free=30d, pro=90d, max=unlimited) + orphan key/conv removal |
| `usage-stats` | `supabase/functions/usage-stats/index.ts` | Owner JWT | Aggregated usage stats: agents, conversations, messages, QR codes, usage_logs by event |

### Edge Function details

**visitor-ws-ticket** (§P2.3):
- Input: `X-Session-Token` header (optional), `{ qr_code_id }` body
- Validates QR code exists and is active
- Validates linked agent is active
- Creates new session if none provided or expired (30-day expiry)
- JWT payload: `{ sub: session_token, agent_id, role: 'visitor', exp: +30s }`
- Returns: `{ data: { ticket, expires_in: 30, session_token, gateway_url } }`
- Error codes: 400 (invalid_request), 403 (qrcode_unavailable/agent_unavailable), 404 (qrcode_not_found), 409 (qrcode_paused)

**agent-ws-ticket** (§P2.2):
- Input: `Authorization: Bearer <api_key>` header
- Hashes API key with SHA-256, looks up agent by api_key_hash
- Validates agent status is active
- JWT payload: `{ sub: agent_id, owner_id, role: 'agent', exp: +30s }`
- Returns: `{ data: { ticket, expires_in: 30, gateway_url } }`
- Error codes: 401 (unauthorized), 403 (forbidden)

### Design decisions applied
- UUID primary keys (gen_random_uuid)
- bigint counters
- text over varchar
- timestamptz everywhere
- RLS ENABLE + FORCE on all 9 tables
- Partial indexes (WHERE status != 'revoked')
- usage_logs monthly partitions (2026-01 through 2026-12 + default)
- updated_at auto-trigger on owners, agents, qrcodes, sessions, conversations
- Messages follow P7.1 immutable model (no status/reason, separate message_deliveries)
- Encryption in Gateway layer, not DB layer (per P7.10 CI gate)
- JWT uses Web Crypto API (HMAC-SHA256) — Deno-native, no external deps
- API key hashing uses SHA-256 via Web Crypto API
- Session tokens use `sess_` prefix + UUID without dashes

### Utility functions
- `create_conversation_if_expired()` -- 24h timeout new conversation
- `cleanup_expired_sessions()` -- 30-day inactive session cleanup
- `cleanup_unclaimed_agents()` -- 24h pending agent cleanup
- `delete_conversation_with_keys()` -- GDPR cascade delete
- `create_usage_log_partition()` -- dynamic monthly partition creation
- `update_updated_at_column()` -- auto-update trigger function

## Blocked
无 (remote migration deferred to later phase)

## Next Steps
- Phase 4+: Execute remote migration + generate TypeScript types
- Phase 4+: RPC functions (exec_sql, decrypt_dek, update_qrcode_with_version) if needed

### Security Hardening (Task #16)

**Migration**: `supabase/migrations/20260313_security_hardening.sql`

| Severity | Finding | Fix |
|----------|---------|-----|
| CRITICAL-1 | SECURITY DEFINER functions exposed via PostgREST (any auth user can call) | REVOKE EXECUTE from PUBLIC/authenticated/anon on all 6 functions, GRANT to service_role only |
| CRITICAL-2 | Future RPCs (exec_sql, decrypt_dek, etc.) could be accidentally exposed | Preemptive DO-block lockdown for 4 referenced-but-not-yet-created RPCs |
| HIGH-1 | Owner INSERT policy doesn't validate email against auth.users | `validate_owner_email()` trigger auto-sets email from auth.users |
| HIGH-2 | `delete_conversation_with_keys` has no ownership check | Added optional `p_owner_user_id` param with ownership verification join |
| MEDIUM-1 | encryption_keys security model is implicit (no policies = deny) | Added COMMENT ON TABLE documenting intentional deny-all model |
| MEDIUM-2 | RLS subquery performance undocumented | Verified existing indexes cover all join paths |
| INFO | Auth pattern rationale undocumented | Added COMMENT ON FUNCTION for all service_role-only RPCs |

**Edge Function Auth Audit** (all consistent):
- Owner endpoints: JWT via `authenticateOwner()` + service_role client + manual ownership chain
- Cron/admin endpoints: service_role key or CRON_SECRET header
- Agent endpoints: API key hash lookup via service_role client
- SQL injection: all queries use Supabase client (parameterized) or `$1`-style params in `exec_sql`

## Failed Attempts
- `npx supabase link`: "Access token not provided" -- no SUPABASE_ACCESS_TOKEN env var

## Dependencies
None (database is the bottom layer; other Teammates depend on this)

## Last Checkpoint
- Phase: Code review fixes (COMPLETE)
- Timestamp: 2026-03-13
