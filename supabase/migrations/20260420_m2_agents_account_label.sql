-- =============================================================================
-- M2-DASH-BE: agents table extensions for dashboard multi-agent management
-- Date: 2026-04-20
-- Plan ref: requirements plan v1.3 §12.4.1 (M2-DASH) / §3 (OpenClaw multi-instance)
--
-- Changes:
--   1. Add `account_label` column — nullable TEXT for human-readable labels
--      in multi-instance OpenClaw scenarios (e.g. "Customer Support EN",
--      "Sales CN"). Distinct from agents.name (internal display name).
--   2. Extend agents.status CHECK constraint to allow 'archived' value
--      for soft-delete via manage-agents Edge Function (delete action).
--
-- Notes:
--   - No index on account_label: queries always filter by owner_id FK;
--     label is display-only. Add a trigram index later if search is needed.
--   - agents_public view (defined in 20260319_security_critical_fixes.sql)
--     already restricts to status='active', so archived agents are
--     automatically hidden from anonymous/public reads. No change needed.
--   - Gateway-side enforcement of status='archived' rejecting new WS
--     connections is a follow-up (documented in delivery report).
-- =============================================================================

-- 1. account_label column
ALTER TABLE agents ADD COLUMN IF NOT EXISTS account_label TEXT;

COMMENT ON COLUMN agents.account_label IS
  'Optional human-readable label for multi-instance OpenClaw scenarios '
  '(e.g. "Support EN", "Sales CN"); distinct from agents.name (internal '
  'display name). Nullable for backward compat with agents created before '
  'M2-DASH (plan v1.3 §12.4.1). Max length enforced at Edge Function level (128 chars).';

-- 2. Extend status CHECK constraint to include 'archived' (soft delete state)
-- Drop-and-recreate pattern is safe because existing rows only use
-- 'pending' | 'active' | 'suspended' which remain valid.
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_status_check;
ALTER TABLE agents ADD CONSTRAINT agents_status_check
  CHECK (status IN ('pending', 'active', 'suspended', 'archived'));

COMMENT ON COLUMN agents.status IS
  'Lifecycle state: '
  'pending (created, awaiting confirm) | '
  'active (operational) | '
  'suspended (temporarily disabled, retains api_key_hash) | '
  'archived (soft-deleted via dashboard, hidden from UI + agents_public view). '
  'Transitions controlled by claim-agent (pending→active) and '
  'manage-agents (active↔suspended, active→archived).';
