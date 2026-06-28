# Wave 10 migration applied — 20260428

**Date:** 2026-04-28
**Project:** `zyxqadubhwrnsoujiyir` (qrclaw, ap-northeast-2)
**Migration:** `supabase/migrations/20260428_wave10_runtime_session.sql`
**Recorded in:** `supabase_migrations.schema_migrations` as version `20260428`

## Scope

- Created `public.agent_runtimes` (owner-scoped, RLS on, 4 policies).
- Extended `public.agents` with `runtime_id` FK (ON DELETE SET NULL), `is_default`, `source`.
- Renamed `public.owner_agent_conversations` → `public.owner_agent_sessions`, re-created
  as a `security_invoker=true` compatibility view for pre-Wave 10 readers.
- RLS re-enforced on `owner_agent_sessions` (4 policies, `agent_runtimes_owner_*` / `owner_agent_sessions_owner_*`).

## How it was applied

The `scripts/run-wave10-migration.sh` CLI path was blocked by `ECIRCUITBREAKER`
on the AP-Northeast-2 Supabase pooler. The migration was applied and verified
via the **Supabase Management API** (`/v1/projects/{ref}/database/query`) which
goes through the control plane and does not depend on the postgres pooler.

## Verification (run via Management API on 2026-04-28)

```json
{
  "runtime_rls": true,
  "sessions_rls": true,
  "compat_view_sec_invoker": true,
  "runtime_policies": 4,
  "session_policies": 4,
  "fk_deltype": "n"
}
```

These values match the assertions in `tests/integration/database/wave10-schema.test.ts`.
The two behavioral tests in that file (cross-owner RLS + FK ON DELETE SET NULL)
pass against the live project. The schema-introspection test uses
`supabase db query --linked` which currently fails on the pooler circuit
breaker — re-run the suite once the pooler quota resets.
