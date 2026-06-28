-- Wave 1 Follow-up: FK indexes for host_id / run_id / preferred_host_id
CREATE INDEX IF NOT EXISTS idx_agent_host_tokens_host_id
  ON public.agent_host_tokens(host_id);

CREATE INDEX IF NOT EXISTS idx_agent_bindings_host_id
  ON public.agent_bindings(host_id);

CREATE INDEX IF NOT EXISTS idx_agent_bindings_preferred_host_id
  ON public.agent_bindings(preferred_host_id);

CREATE INDEX IF NOT EXISTS idx_owner_agent_runs_host_id
  ON public.owner_agent_runs(host_id);

CREATE INDEX IF NOT EXISTS idx_owner_agent_messages_run_id
  ON public.owner_agent_messages(run_id);
