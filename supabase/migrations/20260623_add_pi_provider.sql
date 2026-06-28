-- Add Pi as a supported local provider across owner-agent host tables.

ALTER TABLE public.agent_bindings
  DROP CONSTRAINT IF EXISTS agent_bindings_provider_check;

ALTER TABLE public.agent_bindings
  ADD CONSTRAINT agent_bindings_provider_check
  CHECK (provider IN ('openclaw', 'claude', 'cursor', 'codex', 'pi'));

ALTER TABLE public.agent_host_providers
  DROP CONSTRAINT IF EXISTS agent_host_providers_provider_check;

ALTER TABLE public.agent_host_providers
  ADD CONSTRAINT agent_host_providers_provider_check
  CHECK (provider IN ('openclaw', 'claude', 'cursor', 'codex', 'pi'));

ALTER TABLE public.owner_agent_runs
  DROP CONSTRAINT IF EXISTS owner_agent_runs_provider_check;

ALTER TABLE public.owner_agent_runs
  ADD CONSTRAINT owner_agent_runs_provider_check
  CHECK (provider IN ('openclaw', 'claude', 'cursor', 'codex', 'pi'));
