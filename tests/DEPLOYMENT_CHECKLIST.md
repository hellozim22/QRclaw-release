# QRClaw — Deployment Verification Checklist

## Pre-Deploy

- [ ] All CI checks green (tests, lint, typecheck, build)
- [ ] `npx vitest run` — 194+ tests pass locally
- [ ] No hardcoded secrets in source (grep for API keys, passwords)
- [ ] Environment variables documented in `supabase/EDGE_FUNCTIONS_ENV.md`
- [ ] Database migrations applied (`supabase/MIGRATION_GUIDE.md`)
- [ ] RLS policies verified (`supabase/migrations/20260313_security_hardening.sql`)

## Smoke Tests (Post-Deploy)

### Health Check
- [ ] `GET /health` returns `200 { status: 'ok' }` when all deps healthy
- [ ] `GET /health` returns `503 { status: 'degraded' }` when Redis down
- [ ] Response includes valid ISO 8601 timestamp
- [ ] Response includes non-negative integer uptime

### WebSocket Connection
- [ ] Valid ticket → `connection_ack` frame with unique `connectionId`
- [ ] Missing/invalid ticket → close code `4001`
- [ ] Expired ticket → close code `4003`
- [ ] Heartbeat interval = 25000ms in `connection_ack`
- [ ] Graceful disconnect returns close code `1000`

### Auth Flow
- [ ] Signup → access token + refresh token issued
- [ ] Login with valid credentials → session created
- [ ] Invalid credentials → `invalid_credentials` error
- [ ] Token refresh → new access token, old refresh invalidated
- [ ] Logout → session invalidated

### Edge Functions
- [ ] `ws-ticket`: issues ticket with valid session, rejects missing token
- [ ] `agent-verify`: verifies active agent, rejects invalid API key
- [ ] `qr-resolve`: resolves active QR by slug, returns 404 for unknown

## Post-Deploy

- [ ] Monitor error rates for 15 minutes
- [ ] Verify WebSocket connections are stable
- [ ] Check Supabase dashboard for RLS policy errors
- [ ] Confirm Edge Functions are reachable via Supabase URL
