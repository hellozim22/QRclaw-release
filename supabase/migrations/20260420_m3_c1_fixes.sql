-- =============================================================================
-- M3-C1 review fixes — consolidated schema hardening for the new
-- `decrypted-messages` Edge Function.
--
-- Findings addressed (see docs/refactor/review/2026-04-20-m3-database.md):
--   [H1] encryption_keys: enforce at most one `status = 'active'` row per
--        conversation. The current gateway flow reads-then-inserts with no
--        uniqueness constraint, so concurrent workers can create duplicate
--        active rows, which in turn crashes `decrypted-messages` on
--        `.single()`. The gateway's upsertEncryptionKey() was updated in the
--        same commit to gracefully re-read after the resulting 23505 loss.
--   [H2] agents: api_key_hash is the hot lookup path for every agent message
--        and every `authenticateAgent` call, but only had idx_agents_owner_id.
--        A unique index both fixes the full-scan latency and guarantees we
--        cannot end up with two agents sharing a hashed API key.
--   [P1] messages: the existing idx_messages_conversation(conversation_id,
--        sent_at) cannot serve keyset pagination once we tie-break on id.
--        Add a composite index covering the new ORDER BY clause.
--
-- Every statement uses `IF NOT EXISTS` / `DO $$` guards so re-running the
-- migration is safe on databases that already had the constraint applied out
-- of band.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- H1: one active DEK row per conversation (partial unique index)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- Surface any duplicate rows to the operator before creating the constraint,
  -- so a failing migration produces an actionable error instead of a bare
  -- "could not create unique index" message.
  IF EXISTS (
    SELECT 1
      FROM encryption_keys
      WHERE status = 'active'
      GROUP BY conversation_id
      HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'encryption_keys has conversations with multiple active rows; resolve duplicates before applying 20260420_m3_c1_fixes';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_encryption_keys_active_conversation
  ON encryption_keys(conversation_id)
  WHERE status = 'active';

COMMENT ON INDEX uniq_encryption_keys_active_conversation IS
  'M3-C1 DB-H1: enforces exactly one active DEK per conversation so '
  'decrypted-messages .single() never hits PGRST116. '
  'Future DEK rotation must flip the prior row to status != ''active'' in '
  'the same transaction as the new INSERT.';

-- -----------------------------------------------------------------------------
-- H2: fast agent API-key lookup + uniqueness
-- -----------------------------------------------------------------------------
--
-- Historical rows (from fixtures, abandoned claims, etc.) may share an
-- api_key_hash collision-prone default. Guard with the same duplicate check
-- before adding the unique index.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM agents
      GROUP BY api_key_hash
      HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'agents has duplicate api_key_hash values; resolve duplicates before applying 20260420_m3_c1_fixes';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_agents_api_key_hash
  ON agents(api_key_hash);

COMMENT ON INDEX uniq_agents_api_key_hash IS
  'M3-C1 DB-H2: speeds up authenticateAgent() from a full scan to an index '
  'probe, and guarantees SHA-256(api_key) uniqueness across the fleet.';

-- -----------------------------------------------------------------------------
-- P1: keyset pagination on (sent_at DESC, id DESC)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent_at_desc_id_desc
  ON messages(conversation_id, sent_at DESC, id DESC);

COMMENT ON INDEX idx_messages_conversation_sent_at_desc_id_desc IS
  'M3-C1 DB-B1/P1: matches decrypted-messages ORDER BY '
  'sent_at DESC, id DESC so keyset pagination is an index-only scan.';

-- Retire the ascending prefix index only if the descending one is in place.
-- The asc index was still used by a handful of legacy reads; we keep it to
-- stay on the safe side and let pg_statistic drop it naturally if unused.
