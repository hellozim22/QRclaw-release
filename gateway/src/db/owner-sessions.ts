import { supabase, isSupabaseConfigured } from './supabase.js';

export interface OwnerAgentSessionRecord {
  id: string;
  ownerId: string;
  agentId: string;
  title: string;
  providerSessionId: string | null;
  providerWorkDir: string | null;
  status: 'active' | 'archived';
  lastActiveAt: string | null;
  createdAt: string;
}

const SESSION_COLUMNS =
  'id, owner_id, agent_id, title, provider_session_id, provider_work_dir, status, last_active_at, created_at';

interface SessionRow {
  id: string;
  owner_id: string;
  agent_id: string;
  title: string | null;
  provider_session_id: string | null;
  provider_work_dir: string | null;
  status: string;
  last_active_at: string | null;
  created_at: string;
}

const ensureConfigured = (): void => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }
};

const mapSessionRow = (row: SessionRow): OwnerAgentSessionRecord => ({
  id: row.id,
  ownerId: row.owner_id,
  agentId: row.agent_id,
  title: row.title ?? 'New chat',
  providerSessionId: row.provider_session_id,
  providerWorkDir: row.provider_work_dir,
  status: row.status === 'archived' ? 'archived' : 'active',
  lastActiveAt: row.last_active_at,
  createdAt: row.created_at,
});

export const createOwnerAgentSession = async (input: {
  ownerId: string;
  agentId: string;
  title: string;
}): Promise<OwnerAgentSessionRecord> => {
  ensureConfigured();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('owner_agent_sessions')
    .insert({
      owner_id: input.ownerId,
      agent_id: input.agentId,
      title: input.title,
      status: 'active',
      last_active_at: now,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create owner agent session: ${error?.message ?? 'missing row'}`);
  }
  return mapSessionRow(data as SessionRow);
};

export const listOwnerAgentSessions = async (input: {
  ownerId: string;
  agentId: string;
}): Promise<OwnerAgentSessionRecord[]> => {
  ensureConfigured();
  const { data, error } = await supabase
    .from('owner_agent_sessions')
    .select(SESSION_COLUMNS)
    .eq('owner_id', input.ownerId)
    .eq('agent_id', input.agentId)
    .eq('status', 'active')
    .order('last_active_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to list owner agent sessions: ${error.message}`);
  }
  return ((data ?? []) as SessionRow[]).map(mapSessionRow);
};

export const getOwnerAgentSessionById = async (input: {
  ownerId: string;
  sessionId: string;
}): Promise<OwnerAgentSessionRecord | null> => {
  ensureConfigured();
  const { data, error } = await supabase
    .from('owner_agent_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', input.sessionId)
    .eq('owner_id', input.ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load owner agent session: ${error.message}`);
  }
  if (!data) return null;
  return mapSessionRow(data as SessionRow);
};

export const renameOwnerAgentSession = async (input: {
  ownerId: string;
  sessionId: string;
  title: string;
}): Promise<OwnerAgentSessionRecord | null> => {
  ensureConfigured();
  const { data, error } = await supabase
    .from('owner_agent_sessions')
    .update({ title: input.title })
    .eq('id', input.sessionId)
    .eq('owner_id', input.ownerId)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to rename owner agent session: ${error.message}`);
  }
  if (!data) return null;
  return mapSessionRow(data as SessionRow);
};

export const archiveOwnerAgentSession = async (input: {
  ownerId: string;
  sessionId: string;
}): Promise<OwnerAgentSessionRecord | null> => {
  ensureConfigured();
  const { data, error } = await supabase
    .from('owner_agent_sessions')
    .update({ status: 'archived' })
    .eq('id', input.sessionId)
    .eq('owner_id', input.ownerId)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to archive owner agent session: ${error.message}`);
  }
  if (!data) return null;
  return mapSessionRow(data as SessionRow);
};
