# Edge Functions Environment Variables

## Auto-Provided by Supabase

These are automatically available in all Edge Functions. Do NOT set manually.

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Project API URL (e.g., `https://zyxqadubhwrnsoujiyir.supabase.co`) |
| `SUPABASE_ANON_KEY` | Public anon key for client-side auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |

## Required — Must Set Manually

Set via Supabase Dashboard → Edge Functions → Secrets, or CLI:

```bash
npx supabase secrets set KEY=value
```

| Variable | Used By | Description | Example |
|----------|---------|-------------|---------|
| `JWT_SECRET` | `visitor-ws-ticket`, `agent-ws-ticket` | HMAC-SHA256 signing key for WS tickets | 64+ char random string |
| `QRCLAW_KEK_V1` | `decrypted-messages` | Key Encryption Key for envelope encryption (AES-256). Also consumed by the gateway write path — keep both environments in sync. | 64-char hex string (32 bytes) |
| `CRON_SECRET` | `data-retention` | Shared secret for cron job authentication | 64+ char random string |

> `QRCLAW_HOST_TOKEN_PEPPER` is intentionally not listed here. It is a Gateway-side secret for Owner Agent Chat Host token hashing. Do not add it to Edge Function secrets unless a future design moves Host token verification into an Edge Function.

### Generating Secrets

```bash
# JWT_SECRET (64 random chars)
openssl rand -base64 48

# QRCLAW_KEK_V1 (32-byte hex key for AES-256)
openssl rand -hex 32

# CRON_SECRET (64 random chars)
openssl rand -base64 48
```

### Setting All Secrets at Once

```bash
npx supabase secrets set \
  JWT_SECRET="$(openssl rand -base64 48)" \
  QRCLAW_KEK_V1="$(openssl rand -hex 32)" \
  CRON_SECRET="$(openssl rand -base64 48)"
```

## Optional

| Variable | Used By | Description | Default |
|----------|---------|-------------|---------|
| `GATEWAY_URL` | `visitor-ws-ticket`, `agent-ws-ticket` | WebSocket gateway URL returned to clients | `wss://gateway.qrclaw.ai` |

## Per-Function Matrix

| Function | SUPABASE_URL | SUPABASE_SERVICE_ROLE_KEY | SUPABASE_ANON_KEY | JWT_SECRET | QRCLAW_KEK_V1 | CRON_SECRET | GATEWAY_URL |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `visitor-ws-ticket` | auto | auto | — | **required** | — | — | optional |
| `agent-ws-ticket` | auto | auto | — | **required** | — | — | optional |
| `decrypted-messages` | auto | auto | auto | — | **required** | — | — |
| `create-qrcode` | auto | auto | auto | — | — | — | — |
| `manage-qrcode` | auto | auto | auto | — | — | — | — |
| `claim-agent` | auto | auto | auto | — | — | — | — |
| `data-retention` | auto | auto | — | — | — | **required** | — |
| `usage-stats` | auto | auto | auto | — | — | — | — |

## Verification

After setting secrets, verify each function can start:

```bash
# Test each function locally
npx supabase functions serve visitor-ws-ticket --env-file .env.local

# Or invoke remotely
curl -X POST https://zyxqadubhwrnsoujiyir.supabase.co/functions/v1/usage-stats \
  -H "Authorization: Bearer <owner_jwt>"
```
