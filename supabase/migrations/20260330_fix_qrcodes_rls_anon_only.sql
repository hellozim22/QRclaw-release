-- Fix C-2: Restrict qrcodes public read policy to anon role only.
-- Previously the policy had no role restriction, allowing authenticated
-- users to bypass owner-scoped RLS by using the public read path.
--
-- Depends on: 20260328_qrcodes_public_read.sql (creates the initial policy)
-- This migration drops and recreates it with TO anon restriction.

DROP POLICY IF EXISTS "qrcodes_select_active_public" ON qrcodes;

CREATE POLICY "qrcodes_select_active_public"
  ON qrcodes
  FOR SELECT
  TO anon
  USING (status = 'active');
