-- =============================================================================
-- SECURITY CRITICAL FIXES — 2026-03-19
-- Fixes DB C-01 (agents_select_public column exposure) and
-- DB C-02 (delete_conversation_with_keys ownership bypass)
-- =============================================================================

-- =============================================================================
-- C-01: Replace wide-open agents_select_public RLS policy with a view
-- that only exposes safe public-facing columns.
-- The old policy (SELECT on agents WHERE status = 'active') exposes ALL
-- columns including api_key_hash to anonymous users.
-- =============================================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "agents_select_public" ON agents;

-- Create a public-safe view with only the columns visitors need
CREATE OR REPLACE VIEW agents_public AS
  SELECT
    id,
    name,
    status,
    created_at
  FROM agents
  WHERE status = 'active';

-- Grant anon read access to the view (not the raw table)
GRANT SELECT ON agents_public TO anon;
GRANT SELECT ON agents_public TO authenticated;

-- Do NOT create any new anon RLS policy on the base table.
-- Anon queries against `agents` (not the view) will be blocked by RLS.
-- All anon/visitor-facing code should query `agents_public` instead.

-- =============================================================================
-- C-02: Make p_owner_user_id REQUIRED in delete_conversation_with_keys
-- The DEFAULT NULL makes the ownership check bypassable by omitting the param.
-- =============================================================================

-- Drop existing function(s) to handle signature change.
-- IMPORTANT: PostgreSQL overloads by argument count — the 1-param version
-- is a SEPARATE function from the 2-param version and must be dropped explicitly.
DROP FUNCTION IF EXISTS delete_conversation_with_keys(UUID);
DROP FUNCTION IF EXISTS delete_conversation_with_keys(UUID, UUID);

CREATE OR REPLACE FUNCTION delete_conversation_with_keys(
  p_conversation_id UUID,
  p_owner_user_id UUID  -- No DEFAULT NULL — caller must always provide owner
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_user_id UUID;
BEGIN
  -- Always verify ownership — no bypass possible
  SELECT o.user_id INTO v_owner_user_id
  FROM conversations c
  JOIN qrcodes q ON c.qrcode_id = q.id
  JOIN agents a ON q.agent_id = a.id
  JOIN owners o ON a.owner_id = o.id
  WHERE c.id = p_conversation_id;

  IF v_owner_user_id IS NULL OR v_owner_user_id != p_owner_user_id THEN
    RAISE EXCEPTION 'Conversation not found or access denied';
  END IF;

  -- Delete encryption keys (CASCADE deletes messages automatically)
  DELETE FROM encryption_keys
  WHERE conversation_id = p_conversation_id;

  -- Delete conversation metadata
  DELETE FROM conversations
  WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Restrict execution to service_role only
REVOKE EXECUTE ON FUNCTION delete_conversation_with_keys(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_conversation_with_keys(UUID, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION delete_conversation_with_keys(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION delete_conversation_with_keys(UUID, UUID) TO service_role;
