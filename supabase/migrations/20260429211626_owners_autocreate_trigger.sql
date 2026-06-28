-- =============================================================================
-- Wave 10 Fix B2 — auto-create owners row on auth.users insert
-- =============================================================================
-- Problem: signup / test seeding only created rows in auth.users; no matching
-- row in public.owners. Every RLS policy keyed on
--   owner_id IN (SELECT id FROM owners WHERE user_id = auth.uid())
-- therefore returned zero rows → "empty" dashboards, /chat, agents, etc.
--
-- Fix: AFTER INSERT trigger on auth.users that inserts a minimal owners row.
-- - SECURITY DEFINER → bypasses owners RLS (the trigger runs as the migration
--   role; its policies are not evaluated).
-- - ON CONFLICT (user_id) DO NOTHING → idempotent; safe whether the row was
--   previously hand-inserted by a test harness or a prior signup flow.
-- - search_path pinned to public, pg_temp to avoid search-path hijack.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email        TEXT;
  v_display_name TEXT;
  v_locale       TEXT;
BEGIN
  -- Supabase Auth always has an email on the new row (email or phone-based
  -- accounts both populate it after confirmation). Fallback keeps the NOT NULL
  -- constraint satisfied during unusual admin-created accounts.
  v_email := COALESCE(NEW.email, NEW.id::text || '@placeholder.local');

  -- Prefer a display_name from raw_user_meta_data (set by the signup form),
  -- else local-part of the email.
  v_display_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
    split_part(v_email, '@', 1)
  );

  v_locale := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'locale', ''),
    'en'
  );
  IF v_locale NOT IN ('en', 'zh') THEN
    v_locale := 'en';
  END IF;

  INSERT INTO public.owners (user_id, display_name, email, locale, plan)
  VALUES (NEW.id, v_display_name, v_email, v_locale, 'free')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'Wave 10 B2: auto-provision a public.owners row for every new auth.users row. Idempotent via UNIQUE(user_id).';

-- Drop any previous version so this migration re-runs cleanly.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill: create missing owners rows for any pre-existing auth.users that
-- slipped through before the trigger existed. Uses the same email / metadata
-- derivation as the trigger so data shape is consistent.
INSERT INTO public.owners (user_id, display_name, email, locale, plan)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data ->> 'display_name', ''),
    NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(u.raw_user_meta_data ->> 'name', ''),
    split_part(COALESCE(u.email, u.id::text || '@placeholder.local'), '@', 1)
  ),
  COALESCE(u.email, u.id::text || '@placeholder.local'),
  CASE
    WHEN COALESCE(NULLIF(u.raw_user_meta_data ->> 'locale', ''), 'en') IN ('en', 'zh')
      THEN COALESCE(NULLIF(u.raw_user_meta_data ->> 'locale', ''), 'en')
    ELSE 'en'
  END,
  'free'
FROM auth.users u
LEFT JOIN public.owners o ON o.user_id = u.id
WHERE o.id IS NULL
ON CONFLICT (user_id) DO NOTHING;
