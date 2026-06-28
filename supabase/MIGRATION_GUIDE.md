# QRClaw Database Migration Guide

## Prerequisites

- Supabase CLI installed (`npx supabase --version`)
- Project linked (`npx supabase link --project-ref zyxqadubhwrnsoujiyir`)
- `SUPABASE_ACCESS_TOKEN` set in environment
- **Backup taken** before running any migration (see `scripts/backup.sql`)

## Migration Order

Migrations MUST be applied in chronological order. Each depends on the previous.

| # | File | Description | Idempotent |
|---|------|-------------|------------|
| 1 | `20260312_init_schema.sql` | 9 tables, RLS policies, indexes, triggers, utility functions, usage_logs partitions | No |
| 2 | `20260313_security_hardening.sql` | REVOKE on SECURITY DEFINER functions, email validation trigger, ownership checks | Yes (DO blocks) |

## Execution Methods

### Method 1: Supabase CLI (Recommended)

```bash
# From project root
npx supabase db push
```

This applies all pending migrations in `supabase/migrations/` in filename order.

### Method 2: Manual via SQL Editor

1. Open Supabase Dashboard → SQL Editor
2. Paste contents of each migration file in order
3. Execute and verify no errors
4. Check Applied Migrations in Database → Migrations

### Method 3: Direct psql

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260312_init_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/20260313_security_hardening.sql
```

## Post-Migration Verification

Run these queries to verify the migration was successful:

```sql
-- 1. Verify all 9 tables exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: agents, conversations, encryption_keys, message_deliveries,
--           messages, owners, qrcodes, sessions, usage_logs

-- 2. Verify RLS is enabled and forced on all tables
SELECT tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN (
  'owners','agents','qrcodes','sessions','conversations',
  'encryption_keys','messages','message_deliveries','usage_logs'
);
-- All rows should show: rowsecurity=true, forcerowsecurity=true

-- 3. Verify SECURITY DEFINER functions are locked down
SELECT p.proname, r.rolname,
       has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
CROSS JOIN (VALUES ('authenticated'), ('anon'), ('service_role')) AS r(rolname)
WHERE p.proname IN (
  'delete_conversation_with_keys',
  'create_conversation_if_expired',
  'cleanup_expired_sessions',
  'cleanup_unclaimed_agents',
  'create_usage_log_partition',
  'update_updated_at_column',
  'validate_owner_email'
)
ORDER BY p.proname, r.rolname;
-- authenticated/anon should be false, service_role should be true
-- (except update_updated_at_column and validate_owner_email — trigger-only, all false)

-- 4. Verify usage_logs partitions exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'usage_logs_%'
ORDER BY tablename;
-- Expected: usage_logs_2026_01 through usage_logs_2026_12 + usage_logs_default

-- 5. Verify email validation trigger
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'owners'
  AND trigger_name = 'trg_validate_owner_email';
-- Should return INSERT and UPDATE rows
```

## Rollback

There is no automated rollback. If a migration fails:

1. Check the error message — partial application may have occurred
2. Use `scripts/backup.sql` restore procedure
3. Fix the migration SQL
4. Re-apply from the failed point

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `relation "X" already exists` | Migration re-run | Safe to ignore (use `IF NOT EXISTS` in init) |
| `role "authenticated" does not exist` | Running outside Supabase | Supabase creates these roles automatically |
| `permission denied for schema auth` | Wrong role | Use service_role or postgres superuser |
| `function X does not exist` | CRITICAL-2 DO blocks skip missing functions | Expected — those functions are created later |
