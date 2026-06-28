-- =============================================================================
-- QRClaw Seed Data
-- Run AFTER all migrations have been applied.
-- Creates a default owner and sample agent for initial setup / smoke testing.
-- =============================================================================

-- =============================================================================
-- Prerequisites:
--   1. A Supabase Auth user must exist (create via Dashboard or signup flow)
--   2. Replace the placeholder UUIDs and email below with real values
-- =============================================================================

-- Replace these with actual values:
-- SEED_USER_ID:  the auth.users.id of the first admin user
-- SEED_EMAIL:    the email of the first admin user

DO $$
DECLARE
  v_seed_user_id UUID := '00000000-0000-0000-0000-000000000001'; -- REPLACE with real auth.users.id
  v_seed_email   TEXT := 'admin@qrclaw.ai';                       -- REPLACE with real email
  v_owner_id     UUID;
  v_agent_id     UUID;
  v_qrcode_id    UUID;
BEGIN
  -- Check if auth user exists (skip seed if not)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_seed_user_id) THEN
    RAISE NOTICE 'Seed user % not found in auth.users. Create the user first, then re-run.', v_seed_user_id;
    RAISE NOTICE 'Skipping seed data. To create a user:';
    RAISE NOTICE '  1. Sign up via the app, OR';
    RAISE NOTICE '  2. Supabase Dashboard → Authentication → Add User';
    RETURN;
  END IF;

  -- ==========================================================================
  -- 1. Create default Owner
  -- ==========================================================================
  INSERT INTO owners (user_id, email, display_name, plan, locale)
  VALUES (
    v_seed_user_id,
    v_seed_email,
    'QRClaw Admin',
    'pro',
    'en'
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_owner_id;

  -- If owner already exists, fetch existing ID
  IF v_owner_id IS NULL THEN
    SELECT id INTO v_owner_id FROM owners WHERE user_id = v_seed_user_id;
    RAISE NOTICE 'Owner already exists: %', v_owner_id;
  ELSE
    RAISE NOTICE 'Created owner: %', v_owner_id;
  END IF;

  -- ==========================================================================
  -- 2. Create sample Agent
  -- ==========================================================================
  -- API key hash for: sk_live_SEED_TEST_KEY_DO_NOT_USE_IN_PROD
  -- SHA-256 of the above: precomputed for seed convenience
  INSERT INTO agents (owner_id, name, status, api_key_hash)
  VALUES (
    v_owner_id,
    'Demo Agent',
    'active',
    encode(sha256('sk_live_SEED_TEST_KEY_DO_NOT_USE_IN_PROD'::bytea), 'hex')
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_agent_id;

  IF v_agent_id IS NULL THEN
    SELECT id INTO v_agent_id FROM agents WHERE owner_id = v_owner_id AND name = 'Demo Agent';
    RAISE NOTICE 'Agent already exists: %', v_agent_id;
  ELSE
    RAISE NOTICE 'Created agent: %', v_agent_id;
    RAISE NOTICE 'Demo API key (seed only, rotate before production): sk_live_SEED_TEST_KEY_DO_NOT_USE_IN_PROD';
  END IF;

  -- ==========================================================================
  -- 3. Create sample QR code
  -- ==========================================================================
  IF v_agent_id IS NOT NULL THEN
    INSERT INTO qrcodes (agent_id, slug, status, profile_name, greeting)
    VALUES (
      v_agent_id,
      'demo-agent-qr-' || substr(gen_random_uuid()::text, 1, 8),
      'active',
      'Demo QR Code',
      'Hello! This is a demo QR code for testing.'
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_qrcode_id;

    IF v_qrcode_id IS NOT NULL THEN
      RAISE NOTICE 'Created QR code: %', v_qrcode_id;
    ELSE
      RAISE NOTICE 'QR code already exists for demo agent';
    END IF;
  END IF;

  RAISE NOTICE '=== Seed complete ===';
  RAISE NOTICE 'Owner ID: %', v_owner_id;
  RAISE NOTICE 'Agent ID: %', v_agent_id;
  RAISE NOTICE 'QR Code ID: %', v_qrcode_id;
END $$;
