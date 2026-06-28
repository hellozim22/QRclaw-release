-- Migration: Create subscribers table for newsletter/email subscriptions
-- Date: 2026-03-26

-- ─── Table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  source VARCHAR(50) NOT NULL DEFAULT 'landing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscribers_email_unique UNIQUE (email),
  CONSTRAINT subscribers_status_check CHECK (status IN ('active', 'unsubscribed'))
);

-- ─── Index ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers (status);
CREATE INDEX IF NOT EXISTS idx_subscribers_created_at ON subscribers (created_at DESC);

-- ─── RLS ────────────────────────────────────────────────────────────

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write (Gateway uses service_role key)
CREATE POLICY "Service role full access" ON subscribers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── updated_at trigger ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_subscribers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subscribers_updated_at
  BEFORE UPDATE ON subscribers
  FOR EACH ROW
  EXECUTE FUNCTION update_subscribers_updated_at();
