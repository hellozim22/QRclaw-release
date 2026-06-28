-- =============================================================================
-- QRClaw Phase 0: Initial Database Schema
-- Based on Technical Specification v3.0.3 §9 + Supplement §P7
-- =============================================================================
-- Design decisions (from §9.2):
--   - UUID primary keys (gen_random_uuid)
--   - bigint for all counters (overflow prevention)
--   - text instead of varchar (no 255 trap)
--   - timestamptz for all timestamps (timezone-aware)
--   - RLS enabled + forced on all tables
--   - Partial indexes WHERE status != 'revoked'
--   - usage_logs partitioned by month
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. owners — Owner business attributes (linked to Supabase Auth)
-- =============================================================================
CREATE TABLE owners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email       TEXT NOT NULL,
  locale      TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'zh')),
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'max')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_owners_user_id ON owners(user_id);

ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE owners FORCE ROW LEVEL SECURITY;

-- Owner can read their own profile
CREATE POLICY "owners_select_own" ON owners
  FOR SELECT USING (user_id = auth.uid());

-- Owner can update their own profile
CREATE POLICY "owners_update_own" ON owners
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Owner can insert their own profile (during registration)
CREATE POLICY "owners_insert_own" ON owners
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- 2. agents — AI Agent instances
-- =============================================================================
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  api_key_hash  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'suspended')),
  ws_connected  BOOLEAN NOT NULL DEFAULT false,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_owner_id ON agents(owner_id);
CREATE INDEX idx_agents_status ON agents(status) WHERE status != 'suspended';

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;

-- Owner full CRUD on their own agents
CREATE POLICY "agents_select_own" ON agents
  FOR SELECT USING (owner_id IN (SELECT id FROM owners WHERE user_id = auth.uid()));

CREATE POLICY "agents_insert_own" ON agents
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = auth.uid()));

CREATE POLICY "agents_update_own" ON agents
  FOR UPDATE USING (owner_id IN (SELECT id FROM owners WHERE user_id = auth.uid()))
  WITH CHECK (owner_id IN (SELECT id FROM owners WHERE user_id = auth.uid()));

CREATE POLICY "agents_delete_own" ON agents
  FOR DELETE USING (owner_id IN (SELECT id FROM owners WHERE user_id = auth.uid()));

-- =============================================================================
-- 3. qrcodes — QR code configurations (independent config units)
-- =============================================================================
CREATE TABLE qrcodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  slug                TEXT NOT NULL UNIQUE CHECK (length(slug) >= 12),
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('active', 'paused', 'revoked', 'draft')),
  profile             JSONB NOT NULL DEFAULT '{}',
  system_prompt       TEXT,
  visitor_identity    JSONB,
  style_config        JSONB NOT NULL DEFAULT '{}',
  suggested_questions JSONB DEFAULT '[]',
  security_policy_id  TEXT NOT NULL DEFAULT 'qrclaw_default_v1',
  config_version      INTEGER NOT NULL DEFAULT 1,
  locale              TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'zh')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qrcodes_agent_id ON qrcodes(agent_id);
CREATE INDEX idx_qrcodes_slug ON qrcodes(slug) WHERE status != 'revoked';
CREATE INDEX idx_qrcodes_status ON qrcodes(status) WHERE status != 'revoked';

ALTER TABLE qrcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qrcodes FORCE ROW LEVEL SECURITY;

-- Owner can SELECT/INSERT/UPDATE their own QR codes (through agent ownership chain)
CREATE POLICY "qrcodes_select_own" ON qrcodes
  FOR SELECT USING (
    agent_id IN (
      SELECT a.id FROM agents a
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

CREATE POLICY "qrcodes_insert_own" ON qrcodes
  FOR INSERT WITH CHECK (
    agent_id IN (
      SELECT a.id FROM agents a
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

CREATE POLICY "qrcodes_update_own" ON qrcodes
  FOR UPDATE USING (
    agent_id IN (
      SELECT a.id FROM agents a
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT a.id FROM agents a
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

-- Gateway: read-only access via service_role (bypasses RLS)

-- =============================================================================
-- 4. sessions — Visitor Session Tokens (supports Silent Merge)
-- =============================================================================
CREATE TABLE sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token  TEXT NOT NULL UNIQUE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bound_at       TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

-- No direct Owner access to sessions
-- Gateway uses service_role which bypasses RLS

-- =============================================================================
-- 5. conversations — Conversation metadata
-- =============================================================================
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qrcode_id       UUID NOT NULL REFERENCES qrcodes(id) ON DELETE CASCADE,
  session_token   TEXT NOT NULL,
  message_count   BIGINT NOT NULL DEFAULT 0,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_qrcode ON conversations(qrcode_id);
CREATE INDEX idx_conversations_session ON conversations(session_token);
CREATE INDEX idx_conversations_last_active ON conversations(last_active_at);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

-- Owner can SELECT conversations through ownership chain
CREATE POLICY "conversations_select_own" ON conversations
  FOR SELECT USING (
    qrcode_id IN (
      SELECT q.id FROM qrcodes q
      JOIN agents a ON q.agent_id = a.id
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

-- Owner can DELETE their own conversations (GDPR compliance)
CREATE POLICY "conversations_delete_own" ON conversations
  FOR DELETE USING (
    qrcode_id IN (
      SELECT q.id FROM qrcodes q
      JOIN agents a ON q.agent_id = a.id
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

-- Gateway uses service_role for SELECT/INSERT/UPDATE (bypasses RLS)

-- =============================================================================
-- 6. encryption_keys — DEK storage for envelope encryption (Per Conversation)
-- =============================================================================
CREATE TABLE encryption_keys (
  key_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  key_data_encrypted  BYTEA NOT NULL,
  kek_version         INTEGER NOT NULL DEFAULT 1,
  algorithm           TEXT NOT NULL DEFAULT 'aes-256-gcm',
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'rotating', 'revoked', 'destroyed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at          TIMESTAMPTZ
);

CREATE INDEX idx_encryption_keys_conversation ON encryption_keys(conversation_id);
CREATE INDEX idx_encryption_keys_status ON encryption_keys(conversation_id, status)
  WHERE status = 'active';

ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE encryption_keys FORCE ROW LEVEL SECURITY;

-- Owner can only DELETE (key destruction for GDPR, via Edge Function)
CREATE POLICY "encryption_keys_delete_own" ON encryption_keys
  FOR DELETE USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN qrcodes q ON c.qrcode_id = q.id
      JOIN agents a ON q.agent_id = a.id
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

-- Gateway uses service_role for SELECT/INSERT (bypasses RLS)

-- =============================================================================
-- 7. messages — Chat messages (content encrypted with AES-256-GCM in Gateway)
-- =============================================================================
-- Per §P7.1: messages is an immutable ingestion record. No status/reason columns.
-- Encryption happens in Gateway Node.js layer, NOT in database (per P7.10 CI gate).
CREATE TABLE messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content_encrypted   BYTEA NOT NULL,
  encryption_key_id   UUID NOT NULL REFERENCES encryption_keys(key_id) ON DELETE CASCADE,
  encryption_meta     JSONB NOT NULL DEFAULT '{}',
  role                TEXT NOT NULL CHECK (role IN ('visitor', 'agent')),
  idempotency_key     TEXT UNIQUE NOT NULL,
  message_id          TEXT UNIQUE NOT NULL,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE messages IS
  'Immutable message ingestion record. Write success = persisted (terminal state).
   Does not contain delivery status; delivery status is in message_deliveries.
   encryption_meta format: {"alg":"aes-256-gcm","iv":"base64...","tag":"base64...","dek_id":"uuid"}';

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at);
CREATE INDEX idx_messages_key ON messages(encryption_key_id);
CREATE INDEX idx_messages_idempotency ON messages(idempotency_key);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

-- Owner can SELECT messages through ownership chain (encrypted content only)
CREATE POLICY "messages_select_own" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN qrcodes q ON c.qrcode_id = q.id
      JOIN agents a ON q.agent_id = a.id
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

-- Gateway uses service_role for SELECT/INSERT (bypasses RLS)

-- =============================================================================
-- 8. message_deliveries — Delivery status tracking (from §P7.1)
-- =============================================================================
CREATE TABLE message_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL CHECK (target_type IN ('visitor', 'agent')),
  target_id       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'dispatched', 'acked', 'failed', 'expired')),
  attempt_no      INTEGER NOT NULL DEFAULT 1,
  fail_reason     TEXT,
  dispatched_at   TIMESTAMPTZ,
  acked_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE message_deliveries IS
  'MVP: 1 delivery per message (single target). Retry updates same row.
   Growth: multiple deliveries per message (multi-device), append new rows.';

CREATE INDEX idx_deliveries_message ON message_deliveries(message_id);
CREATE INDEX idx_deliveries_pending ON message_deliveries(status) WHERE status = 'pending';

ALTER TABLE message_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_deliveries FORCE ROW LEVEL SECURITY;

-- Owner can SELECT delivery status through ownership chain
CREATE POLICY "deliveries_select_own" ON message_deliveries
  FOR SELECT USING (
    message_id IN (
      SELECT m.id FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN qrcodes q ON c.qrcode_id = q.id
      JOIN agents a ON q.agent_id = a.id
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

-- Gateway uses service_role for SELECT/INSERT/UPDATE (bypasses RLS)

-- =============================================================================
-- 9. usage_logs — Event logs (partitioned by month)
-- =============================================================================
CREATE TABLE usage_logs (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL,
  owner_id    UUID NOT NULL,
  event_type  TEXT NOT NULL,
  event_meta  JSONB DEFAULT '{}',
  counted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, counted_at)
) PARTITION BY RANGE (counted_at);

CREATE INDEX idx_usage_logs_agent ON usage_logs(agent_id, counted_at);
CREATE INDEX idx_usage_logs_owner ON usage_logs(owner_id, counted_at);
CREATE INDEX idx_usage_logs_event_type ON usage_logs(event_type, counted_at);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs FORCE ROW LEVEL SECURITY;

-- Owner can SELECT their own usage logs
CREATE POLICY "usage_logs_select_own" ON usage_logs
  FOR SELECT USING (
    owner_id IN (SELECT id FROM owners WHERE user_id = auth.uid())
  );

-- Written via Edge Function using service_role (bypasses RLS)

-- Create monthly partitions: 2026-01 through 2026-12 + default
CREATE TABLE usage_logs_2026_01 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE usage_logs_2026_02 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE usage_logs_2026_03 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE usage_logs_2026_04 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE usage_logs_2026_05 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE usage_logs_2026_06 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE usage_logs_2026_07 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE usage_logs_2026_08 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE usage_logs_2026_09 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE usage_logs_2026_10 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE usage_logs_2026_11 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE usage_logs_2026_12 PARTITION OF usage_logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE usage_logs_default PARTITION OF usage_logs DEFAULT;

-- =============================================================================
-- Helper functions
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER set_updated_at_owners
  BEFORE UPDATE ON owners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_agents
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_qrcodes
  BEFORE UPDATE ON qrcodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_sessions
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_conversations
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Utility functions (from §9.3)
-- =============================================================================

-- Create conversation if last one is expired (24h timeout)
CREATE OR REPLACE FUNCTION create_conversation_if_expired(
  p_qrcode_id UUID,
  p_session_token TEXT,
  p_timeout_hours INTEGER DEFAULT 24
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Check for active conversation within timeout
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE qrcode_id = p_qrcode_id
    AND session_token = p_session_token
    AND last_active_at > now() - (p_timeout_hours || ' hours')::INTERVAL
  ORDER BY last_active_at DESC
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- Create new conversation
  INSERT INTO conversations (qrcode_id, session_token)
  VALUES (p_qrcode_id, p_session_token)
  RETURNING id INTO v_conversation_id;

  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired sessions (30 days inactive)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM sessions
  WHERE expires_at < now()
     OR (last_active_at < now() - INTERVAL '30 days' AND user_id IS NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup unclaimed agents (24h)
CREATE OR REPLACE FUNCTION cleanup_unclaimed_agents()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM agents
  WHERE status = 'pending'
    AND created_at < now() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Delete conversation with keys (GDPR compliance)
CREATE OR REPLACE FUNCTION delete_conversation_with_keys(
  p_conversation_id UUID
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete encryption keys (CASCADE deletes messages automatically)
  DELETE FROM encryption_keys
  WHERE conversation_id = p_conversation_id;

  -- Delete conversation metadata
  DELETE FROM conversations
  WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Auto-create monthly partition for usage_logs
CREATE OR REPLACE FUNCTION create_usage_log_partition(
  p_year INTEGER,
  p_month INTEGER
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partition_name TEXT;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  v_partition_name := format('usage_logs_%s_%s',
    p_year,
    lpad(p_month::TEXT, 2, '0')
  );
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := v_start_date + INTERVAL '1 month';

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF usage_logs FOR VALUES FROM (%L) TO (%L)',
    v_partition_name,
    v_start_date,
    v_end_date
  );
END;
$$ LANGUAGE plpgsql;
