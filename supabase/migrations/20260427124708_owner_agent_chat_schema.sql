-- =============================================================================
-- Owner Agent Chat schema — Wave 1
--
-- Adds private owner-agent chat tables, host registration metadata, agents table
-- extensions, indexes, and RLS policies. Gateway/Edge Function service_role paths
-- remain the only writers for encrypted agent/run event data and wrapped DEKs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- agents extensions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jsonb_string_array_max_length(value jsonb, max_length integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  item jsonb;
BEGIN
  IF value IS NULL OR jsonb_typeof(value) <> 'array' THEN
    RETURN false;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
    IF jsonb_typeof(item) <> 'string' OR length(item #>> '{}') > max_length THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS suggested_prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'standard';

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_status_check;
ALTER TABLE agents ADD CONSTRAINT agents_status_check
  CHECK (status IN ('pending', 'active', 'suspended', 'archived'));

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_instructions_length_check;
ALTER TABLE agents ADD CONSTRAINT agents_instructions_length_check
  CHECK (instructions IS NULL OR length(instructions) <= 8000);

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_suggested_prompts_check;
ALTER TABLE agents ADD CONSTRAINT agents_suggested_prompts_check
  CHECK (
    jsonb_typeof(suggested_prompts) = 'array'
    AND jsonb_array_length(suggested_prompts) <= 10
    AND jsonb_string_array_max_length(suggested_prompts, 200)
  );

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_execution_mode_check;
ALTER TABLE agents ADD CONSTRAINT agents_execution_mode_check
  CHECK (execution_mode IN ('standard', 'full_access'));

COMMENT ON COLUMN agents.description IS
  'Owner-facing Agent description for private owner-agent chat setup.';
COMMENT ON COLUMN agents.avatar_url IS
  'Owner-facing Agent avatar URL. Storage/upload validation is handled by service/API layers.';
COMMENT ON COLUMN agents.instructions IS
  'Owner-authored private Agent instructions, bounded to 8000 characters by CHECK.';
COMMENT ON COLUMN agents.suggested_prompts IS
  'Owner-facing suggested prompts. Must be a JSON string array with <=10 items and <=200 chars per item.';
COMMENT ON COLUMN agents.execution_mode IS
  'Owner Agent Chat execution mode: standard or full_access.';

-- -----------------------------------------------------------------------------
-- Host registration and provider capability tables
-- -----------------------------------------------------------------------------

CREATE TABLE agent_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  host_type text NOT NULL CHECK (host_type IN ('local', 'cloud')),
  display_name text,
  device_fingerprint text,
  status text NOT NULL DEFAULT 'offline',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_host_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  host_id uuid REFERENCES agent_hosts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_host_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES agent_hosts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openclaw', 'claude', 'cursor', 'codex')),
  binary_path text,
  version text,
  status text NOT NULL DEFAULT 'available',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_check_passed_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  binding_kind text NOT NULL CHECK (binding_kind IN ('local_host', 'cloud_plugin')),
  host_id uuid REFERENCES agent_hosts(id) ON DELETE CASCADE,
  preferred_host_id uuid REFERENCES agent_hosts(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('openclaw', 'claude', 'cursor', 'codex')),
  execution_mode text NOT NULL DEFAULT 'full_access' CHECK (execution_mode IN ('standard', 'full_access')),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_bindings_agent_id_unique UNIQUE (agent_id)
);

-- -----------------------------------------------------------------------------
-- Owner private chat tables
-- -----------------------------------------------------------------------------

CREATE TABLE owner_agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider_session_id text,
  provider_work_dir text,
  status text NOT NULL DEFAULT 'active',
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_agent_conversations_owner_agent_unique UNIQUE (owner_id, agent_id)
);

CREATE TABLE owner_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES owner_agent_conversations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  host_id uuid REFERENCES agent_hosts(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('openclaw', 'claude', 'cursor', 'codex')),
  status text NOT NULL DEFAULT 'queued',
  requested_model text,
  actual_model text,
  provider_session_id text,
  provider_work_dir text,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE owner_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES owner_agent_conversations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id uuid REFERENCES owner_agent_runs(id) ON DELETE SET NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('owner', 'agent', 'system')),
  content_encrypted text NOT NULL,
  content_type text NOT NULL DEFAULT 'text',
  encryption_meta jsonb NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE owner_agent_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES owner_agent_runs(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  type text NOT NULL,
  content_encrypted text,
  encryption_meta jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_agent_run_events_run_seq_unique UNIQUE (run_id, seq)
);

CREATE TABLE owner_agent_conversation_keys (
  key_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES owner_agent_conversations(id) ON DELETE CASCADE,
  key_data_encrypted bytea NOT NULL,
  kek_version integer NOT NULL DEFAULT 1,
  algorithm text NOT NULL DEFAULT 'aes-256-gcm',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX idx_agent_hosts_owner_status
  ON agent_hosts(owner_id, status);

CREATE INDEX idx_agent_host_tokens_owner_revoked_expires
  ON agent_host_tokens(owner_id, revoked_at, expires_at);

CREATE INDEX idx_agent_host_providers_host_provider
  ON agent_host_providers(host_id, provider);

CREATE INDEX idx_agent_bindings_owner_status
  ON agent_bindings(owner_id, status);

CREATE INDEX idx_owner_agent_conversations_owner_last_active
  ON owner_agent_conversations(owner_id, last_active_at DESC);

CREATE INDEX idx_owner_agent_messages_conversation_created_at
  ON owner_agent_messages(conversation_id, created_at);

CREATE INDEX idx_owner_agent_runs_conversation_created_at_desc
  ON owner_agent_runs(conversation_id, created_at DESC);

CREATE INDEX idx_owner_agent_runs_owner_status_created_at
  ON owner_agent_runs(owner_id, status, created_at);

CREATE INDEX idx_owner_agent_conversation_keys_conversation_status
  ON owner_agent_conversation_keys(conversation_id, status);

CREATE UNIQUE INDEX uniq_owner_agent_conversation_keys_active
  ON owner_agent_conversation_keys(conversation_id)
  WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

CREATE TRIGGER set_updated_at_agent_hosts
  BEFORE UPDATE ON agent_hosts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_agent_host_providers
  BEFORE UPDATE ON agent_host_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_agent_bindings
  BEFORE UPDATE ON agent_bindings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_owner_agent_conversations
  BEFORE UPDATE ON owner_agent_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- RLS helpers and policies
-- -----------------------------------------------------------------------------

ALTER TABLE agent_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_hosts FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_host_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_host_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_host_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_host_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_run_events FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_conversation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_agent_conversation_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY "agent_hosts_owner_select" ON agent_hosts
  FOR SELECT USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_hosts_owner_insert" ON agent_hosts
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_hosts_owner_update" ON agent_hosts
  FOR UPDATE USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_hosts_owner_delete" ON agent_hosts
  FOR DELETE USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_host_tokens_owner_select" ON agent_host_tokens
  FOR SELECT USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_host_tokens_owner_insert" ON agent_host_tokens
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_host_tokens_owner_update" ON agent_host_tokens
  FOR UPDATE USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_host_tokens_owner_delete" ON agent_host_tokens
  FOR DELETE USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_host_providers_owner_select" ON agent_host_providers
  FOR SELECT USING (
    host_id IN (
      SELECT h.id
      FROM agent_hosts h
      JOIN owners o ON h.owner_id = o.id
      WHERE o.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "agent_bindings_owner_select" ON agent_bindings
  FOR SELECT USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_bindings_owner_insert" ON agent_bindings
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_bindings_owner_update" ON agent_bindings
  FOR UPDATE USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_bindings_owner_delete" ON agent_bindings
  FOR DELETE USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_conversations_owner_select" ON owner_agent_conversations
  FOR SELECT USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_conversations_owner_insert" ON owner_agent_conversations
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_conversations_owner_update" ON owner_agent_conversations
  FOR UPDATE USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_conversations_owner_delete" ON owner_agent_conversations
  FOR DELETE USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_messages_owner_select" ON owner_agent_messages
  FOR SELECT USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_messages_owner_insert" ON owner_agent_messages
  FOR INSERT WITH CHECK (
    sender_type = 'owner'
    AND owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid()))
  );

CREATE POLICY "owner_agent_runs_owner_select" ON owner_agent_runs
  FOR SELECT USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_runs_owner_insert" ON owner_agent_runs
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_runs_owner_update" ON owner_agent_runs
  FOR UPDATE USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_run_events_owner_select" ON owner_agent_run_events
  FOR SELECT USING (owner_id IN (SELECT id FROM owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_conversation_keys_owner_delete" ON owner_agent_conversation_keys
  FOR DELETE USING (
    conversation_id IN (
      SELECT c.id
      FROM owner_agent_conversations c
      JOIN owners o ON c.owner_id = o.id
      WHERE o.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE owner_agent_conversation_keys IS
  'Wrapped DEKs for Owner Agent Chat conversations. No owner SELECT policy by design; decrypted-messages service_role is the read path.';
