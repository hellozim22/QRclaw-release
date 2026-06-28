-- =============================================================================
-- PUBLIC READ ACCESS FOR QR CODES — 2026-03-28
-- Required for /q/{slug} redirect (Server Component uses anon key)
-- Only expose id, slug, agent_id for active QR codes
--
-- ⚠️ NOTE: This migration creates a policy without role restriction.
-- It MUST be followed by 20260330_fix_qrcodes_rls_anon_only.sql which
-- drops this policy and recreates it with TO anon. Do NOT run this
-- migration without also running 20260330 immediately after.
-- =============================================================================

-- Option 1: Create a public view (consistent with agents_public pattern)
CREATE OR REPLACE VIEW qrcodes_public AS
  SELECT
    id,
    slug,
    agent_id,
    status
  FROM qrcodes
  WHERE status = 'active';

-- Grant anon read access to the view
GRANT SELECT ON qrcodes_public TO anon;
GRANT SELECT ON qrcodes_public TO authenticated;

-- Option 2: Also add RLS policy on base table for slug lookups
-- This allows the Supabase client to query qrcodes directly with
-- limited column access when RLS is in effect.
-- ⚠️ Replaced by 20260330 — kept here for migration history only.
CREATE POLICY "qrcodes_select_active_public"
  ON qrcodes
  FOR SELECT
  USING (status = 'active');
