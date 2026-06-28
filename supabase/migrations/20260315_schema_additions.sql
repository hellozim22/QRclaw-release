-- =============================================================================
-- QRClaw: Schema additions for V3 acceptance tests
-- Adds missing columns and visitor_sessions table
-- =============================================================================

-- 1. agents.description — Optional agent description text
ALTER TABLE agents ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. qrcodes.name — Optional human-readable QR code name
ALTER TABLE qrcodes ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- 3. conversations.status — Conversation lifecycle state
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

-- 4. visitor_sessions — Track visitor sessions across conversations
CREATE TABLE IF NOT EXISTS visitor_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  qrcode_id     UUID NOT NULL REFERENCES qrcodes(id) ON DELETE CASCADE,
  user_agent    TEXT,
  ip_hash       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_token ON visitor_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_qrcode ON visitor_sessions(qrcode_id);

-- Enable RLS
ALTER TABLE visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_sessions FORCE ROW LEVEL SECURITY;

-- Service role has full access; no user-facing policies needed
-- (visitor_sessions are managed by Gateway, not by end users)
