# Supabase Project Configuration Checklist

Use this checklist when setting up a new Supabase project or verifying an existing one for QRClaw production.

## 1. Project Setup

- [ ] Project created at [supabase.com](https://supabase.com)
- [ ] Region selected (closest to target users)
- [ ] Project ID noted: `zyxqadubhwrnsoujiyir`
- [ ] Database password stored securely (password manager)

## 2. Database Migrations

- [ ] `20260312_init_schema.sql` applied successfully
- [ ] `20260313_security_hardening.sql` applied successfully
- [ ] All 9 tables verified (see `MIGRATION_GUIDE.md` verification queries)
- [ ] RLS enabled + forced on all tables
- [ ] SECURITY DEFINER functions locked down (no public/anon/authenticated access)
- [ ] Usage log partitions created (2026-01 through 2026-12 + default)

## 3. Authentication

- [ ] Email/Password provider enabled (Dashboard → Authentication → Providers)
- [ ] Email confirmation enabled (recommended for production)
- [ ] Password minimum length set to 8+
- [ ] Rate limiting configured (Dashboard → Authentication → Rate Limits)
- [ ] Redirect URLs configured for web app (e.g., `https://qrclaw.ai/auth/callback`)
- [ ] Custom SMTP configured (for production email delivery)

## 4. Edge Function Secrets

See `EDGE_FUNCTIONS_ENV.md` for details.

- [ ] `JWT_SECRET` set (64+ chars, `openssl rand -base64 48`)
- [ ] `QRCLAW_KEK_V1` set (32 bytes hex, `openssl rand -hex 32`)
- [ ] `CRON_SECRET` set (64+ chars, `openssl rand -base64 48`)
- [ ] `GATEWAY_URL` set if not using default `wss://gateway.qrclaw.ai`

Verify:
```bash
npx supabase secrets list
```

## 5. Edge Functions Deployed

- [ ] `visitor-ws-ticket` deployed
- [ ] `agent-ws-ticket` deployed
- [ ] `decrypted-messages` deployed (unified owner/agent/visitor; supersedes the retired `get-decrypted-messages`)
- [ ] `create-qrcode` deployed
- [ ] `manage-qrcode` deployed
- [ ] `claim-agent` deployed
- [ ] `data-retention` deployed
- [ ] `usage-stats` deployed

Deploy all:
```bash
npx supabase functions deploy
```

Verify:
```bash
npx supabase functions list
```

## 6. Cron Jobs (pg_cron)

- [ ] `data-retention` scheduled (recommended: daily at 03:00 UTC)
- [ ] `cleanup_expired_sessions` scheduled (recommended: every 6 hours)
- [ ] `cleanup_unclaimed_agents` scheduled (recommended: daily at 04:00 UTC)

Setup via SQL Editor:
```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Daily data retention cleanup at 03:00 UTC
SELECT cron.schedule(
  'data-retention-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/data-retention',
    headers := jsonb_build_object(
      'X-Cron-Secret', current_setting('app.settings.cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Session cleanup every 6 hours
SELECT cron.schedule(
  'session-cleanup',
  '0 */6 * * *',
  $$ SELECT cleanup_expired_sessions(); $$
);

-- Unclaimed agent cleanup daily at 04:00 UTC
SELECT cron.schedule(
  'agent-cleanup',
  '0 4 * * *',
  $$ SELECT cleanup_unclaimed_agents(); $$
);
```

## 7. Database Configuration

- [ ] Connection pooling enabled (Supavisor, Dashboard → Database → Connection Pooling)
- [ ] Pool mode: Transaction (recommended for Edge Functions)
- [ ] Max connections appropriate for plan tier
- [ ] Statement timeout configured (default 120s is fine)

## 8. API Settings

- [ ] API rate limiting configured (Dashboard → API → Rate Limiting)
- [ ] JWT expiry set appropriately (default 3600s)
- [ ] Allowed request body size sufficient (default 1MB)

## 9. Monitoring

- [ ] Database health monitoring enabled
- [ ] Edge Function logs accessible (Dashboard → Edge Functions → Logs)
- [ ] Alert emails configured for plan-level events
- [ ] Consider external monitoring (e.g., uptime checks on Edge Functions)

## 10. Backup Strategy

- [ ] Automatic daily backups enabled (included in all plans)
- [ ] PITR enabled if on Pro plan (recommended)
- [ ] Initial manual backup taken after migration (`scripts/backup.sql`)
- [ ] Backup restore procedure tested

## 11. Seed Data (Optional)

- [ ] Admin user created via Authentication
- [ ] `scripts/seed.sql` run with correct user ID and email
- [ ] Seed API key rotated if used beyond testing
- [ ] Demo QR code verified as functional

## 12. Security Final Check

- [ ] No hardcoded secrets in codebase
- [ ] `.env` files listed in `.gitignore`
- [ ] Service role key never exposed to client
- [ ] CORS origins configured appropriately
- [ ] Database password rotated from initial setup value
