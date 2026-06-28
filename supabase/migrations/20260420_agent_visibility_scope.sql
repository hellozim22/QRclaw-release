-- 20260420_agent_visibility_scope.sql
-- Agents: visibility_scope for cross-agent conversation access (default strict self-isolation).
-- See docs/refactor/execution-log.md "R1 — GET /api/agent/conversations".
-- Mirrors OpenClaw's opt-in philosophy: agents.list[].memorySearch.qmd.extraCollections.
--
-- Join path for scope='owner' (agents.owner_id -> qrcodes.agent_id -> conversations.qrcode_id)
-- is already covered by idx_agents_owner_id + idx_qrcodes_agent_id + idx_conversations_qrcode,
-- so no new indexes are required.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS visibility_scope text NOT NULL DEFAULT 'self'
  CHECK (visibility_scope IN ('self', 'owner'));

COMMENT ON COLUMN agents.visibility_scope IS
  'Controls what /api/agent/conversations returns: self=own qrcodes only (default, strict isolation), owner=all qrcodes under same owner_id (opt-in, peer visibility).';
