-- =============================================================================
-- Wave 10 Sprint 1: Runtime / Agent / Session schema
--
-- Introduces runtime as the execution-capability layer and renames owner private
-- conversations to sessions while keeping a compatibility view for old readers.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Runtime table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_runtimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  host_id uuid REFERENCES public.agent_hosts(id) ON DELETE SET NULL,
  runtime_type text NOT NULL,
  display_name text NOT NULL,
  binary_path text,
  version text,
  runtime_status text NOT NULL DEFAULT 'offline',
  status_reason text,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_runtimes_runtime_type_nonempty
    CHECK (length(trim(runtime_type)) > 0),
  CONSTRAINT agent_runtimes_display_name_nonempty
    CHECK (length(trim(display_name)) > 0),
  CONSTRAINT agent_runtimes_status_check
    CHECK (runtime_status IN ('online', 'offline', 'updating'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_runtimes_owner_host_type
  ON public.agent_runtimes (
    owner_id,
    (COALESCE(host_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    runtime_type
  );

CREATE INDEX IF NOT EXISTS idx_agent_runtimes_owner_status
  ON public.agent_runtimes(owner_id, runtime_status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runtimes_host_type
  ON public.agent_runtimes(host_id, runtime_type)
  WHERE host_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_agent_runtimes ON public.agent_runtimes;
CREATE TRIGGER set_updated_at_agent_runtimes
  BEFORE UPDATE ON public.agent_runtimes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_runtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runtimes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_runtimes_owner_select" ON public.agent_runtimes;
DROP POLICY IF EXISTS "agent_runtimes_owner_insert" ON public.agent_runtimes;
DROP POLICY IF EXISTS "agent_runtimes_owner_update" ON public.agent_runtimes;
DROP POLICY IF EXISTS "agent_runtimes_owner_delete" ON public.agent_runtimes;

CREATE POLICY "agent_runtimes_owner_select" ON public.agent_runtimes
  FOR SELECT USING (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_runtimes_owner_insert" ON public.agent_runtimes
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_runtimes_owner_update" ON public.agent_runtimes
  FOR UPDATE USING (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "agent_runtimes_owner_delete" ON public.agent_runtimes
  FOR DELETE USING (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())));

COMMENT ON TABLE public.agent_runtimes IS
  'Wave 10 runtime records detected from owner hosts, e.g. openclaw, claude, cursor, codex.';
COMMENT ON COLUMN public.agent_runtimes.runtime_type IS
  'Runtime adapter type. Stored as text so future local CLI runtimes do not require enum migrations.';
COMMENT ON COLUMN public.agent_runtimes.binary_path IS
  'Host-reported executable path or command metadata. Do not expose to visitors or logs.';

-- Backfill runtimes from the Wave 1 provider report table.
INSERT INTO public.agent_runtimes (
  owner_id,
  host_id,
  runtime_type,
  display_name,
  binary_path,
  version,
  runtime_status,
  capabilities,
  last_seen_at
)
SELECT
  h.owner_id,
  hp.host_id,
  hp.provider,
  initcap(hp.provider),
  hp.binary_path,
  hp.version,
  CASE
    WHEN h.status = 'online' AND hp.status = 'available' THEN 'online'
    ELSE 'offline'
  END,
  hp.capabilities,
  GREATEST(h.last_seen_at, hp.health_check_passed_at)
FROM public.agent_host_providers hp
JOIN public.agent_hosts h ON h.id = hp.host_id
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Agents attach to runtimes
-- -----------------------------------------------------------------------------

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS runtime_id uuid REFERENCES public.agent_runtimes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user_created';

ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_runtime_id_fkey;
ALTER TABLE public.agents ADD CONSTRAINT agents_runtime_id_fkey
  FOREIGN KEY (runtime_id) REFERENCES public.agent_runtimes(id) ON DELETE SET NULL;

ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_source_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_source_check
  CHECK (source IN ('system_default', 'user_created', 'imported'));

CREATE INDEX IF NOT EXISTS idx_agents_owner_runtime
  ON public.agents(owner_id, runtime_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_agents_owner_default_runtime
  ON public.agents(owner_id, runtime_id)
  WHERE is_default = true AND runtime_id IS NOT NULL;

UPDATE public.agents a
SET runtime_id = runtime_match.id
FROM public.agent_bindings b
JOIN LATERAL (
  SELECT r.id
  FROM public.agent_runtimes r
  WHERE r.owner_id = b.owner_id
    AND r.runtime_type = b.provider
    AND (
      COALESCE(b.preferred_host_id, b.host_id) IS NULL
      OR r.host_id = COALESCE(b.preferred_host_id, b.host_id)
    )
  ORDER BY r.last_seen_at DESC NULLS LAST, r.created_at DESC
  LIMIT 1
) runtime_match ON true
WHERE b.agent_id = a.id
  AND a.runtime_id IS NULL;

COMMENT ON COLUMN public.agents.runtime_id IS
  'Wave 10 runtime that powers this owner-configurable Agent.';
COMMENT ON COLUMN public.agents.is_default IS
  'True for system-provisioned default Agents created from detected runtimes.';
COMMENT ON COLUMN public.agents.source IS
  'Agent creation source: system_default, user_created, or imported.';

-- -----------------------------------------------------------------------------
-- Owner Agent conversations become sessions
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.owner_agent_sessions') IS NULL
     AND to_regclass('public.owner_agent_conversations') IS NOT NULL THEN
    ALTER TABLE public.owner_agent_conversations RENAME TO owner_agent_sessions;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.owner_agent_sessions
  DROP CONSTRAINT IF EXISTS owner_agent_conversations_owner_agent_unique;

ALTER TABLE IF EXISTS public.owner_agent_sessions
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'New chat';

ALTER TABLE IF EXISTS public.owner_agent_sessions
  DROP CONSTRAINT IF EXISTS owner_agent_sessions_title_length_check;
ALTER TABLE IF EXISTS public.owner_agent_sessions
  ADD CONSTRAINT owner_agent_sessions_title_length_check
  CHECK (length(title) BETWEEN 1 AND 120);

ALTER TABLE IF EXISTS public.owner_agent_sessions
  DROP CONSTRAINT IF EXISTS owner_agent_sessions_status_check;
ALTER TABLE IF EXISTS public.owner_agent_sessions
  ADD CONSTRAINT owner_agent_sessions_status_check
  CHECK (status IN ('active', 'archived'));

DROP INDEX IF EXISTS public.idx_owner_agent_conversations_owner_last_active;
CREATE INDEX IF NOT EXISTS idx_owner_agent_sessions_owner_last_active
  ON public.owner_agent_sessions(owner_id, last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_agent_sessions_agent_last_active
  ON public.owner_agent_sessions(owner_id, agent_id, last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_agent_sessions_owner_title
  ON public.owner_agent_sessions(owner_id, lower(title));

DROP TRIGGER IF EXISTS set_updated_at_owner_agent_conversations ON public.owner_agent_sessions;
DROP TRIGGER IF EXISTS set_updated_at_owner_agent_sessions ON public.owner_agent_sessions;
CREATE TRIGGER set_updated_at_owner_agent_sessions
  BEFORE UPDATE ON public.owner_agent_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.owner_agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_agent_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_agent_conversations_owner_select" ON public.owner_agent_sessions;
DROP POLICY IF EXISTS "owner_agent_conversations_owner_insert" ON public.owner_agent_sessions;
DROP POLICY IF EXISTS "owner_agent_conversations_owner_update" ON public.owner_agent_sessions;
DROP POLICY IF EXISTS "owner_agent_conversations_owner_delete" ON public.owner_agent_sessions;
DROP POLICY IF EXISTS "owner_agent_sessions_owner_select" ON public.owner_agent_sessions;
DROP POLICY IF EXISTS "owner_agent_sessions_owner_insert" ON public.owner_agent_sessions;
DROP POLICY IF EXISTS "owner_agent_sessions_owner_update" ON public.owner_agent_sessions;
DROP POLICY IF EXISTS "owner_agent_sessions_owner_delete" ON public.owner_agent_sessions;

CREATE POLICY "owner_agent_sessions_owner_select" ON public.owner_agent_sessions
  FOR SELECT USING (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_sessions_owner_insert" ON public.owner_agent_sessions
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_sessions_owner_update" ON public.owner_agent_sessions
  FOR UPDATE USING (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "owner_agent_sessions_owner_delete" ON public.owner_agent_sessions
  FOR DELETE USING (owner_id IN (SELECT id FROM public.owners WHERE user_id = (SELECT auth.uid())));

COMMENT ON TABLE public.owner_agent_sessions IS
  'Wave 10 owner-agent chat sessions. Multiple sessions are allowed per owner and agent.';
COMMENT ON COLUMN public.owner_agent_sessions.title IS
  'Owner-facing session title shown in the chat/session list.';

-- Keep old read paths working during the Wave 10 application migration.
DROP VIEW IF EXISTS public.owner_agent_conversations;
CREATE OR REPLACE VIEW public.owner_agent_conversations
WITH (security_invoker = true) AS
SELECT * FROM public.owner_agent_sessions;

COMMENT ON VIEW public.owner_agent_conversations IS
  'Compatibility view for pre-Wave 10 code paths. New code should use owner_agent_sessions.';
