-- Allow anonymous/public read access to active agents.
-- Required for the visitor-facing agent profile page (/agent/[agentId])
-- which fetches agent data using the browser Supabase client (anon key).
-- Without this policy, RLS blocks all anonymous reads on the agents table.

CREATE POLICY "agents_select_public"
  ON agents
  FOR SELECT
  USING (status = 'active');
