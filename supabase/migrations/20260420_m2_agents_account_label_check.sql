-- =============================================================================
-- M2-DASH-BE (review fixup): DB-level length constraint on agents.account_label
-- Date: 2026-04-20
-- Reviewer: MEDIUM — defense-in-depth, do not rely solely on Edge Function
--           validation for length bounds.
--
-- Intentionally a new migration (not an edit to
-- 20260420_m2_agents_account_label.sql) so already-applied history in
-- production is immutable, per Supabase migration best practice.
--
-- Keeps the column nullable (as originally added) and tolerates existing
-- NULL rows created between the first migration and this one.
-- =============================================================================

ALTER TABLE agents ADD CONSTRAINT agents_account_label_length
  CHECK (account_label IS NULL OR length(account_label) <= 128);

COMMENT ON CONSTRAINT agents_account_label_length ON agents IS
  'Defense-in-depth: upper-bound account_label to 128 chars at the database '
  'layer; the Edge Function (manage-agents) also enforces this, but Gateway '
  'or future service_role writers should not be able to bypass the limit.';
