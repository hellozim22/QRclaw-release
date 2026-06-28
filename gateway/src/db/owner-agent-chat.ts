import { createHmac } from 'crypto';
import type { HostProviderCapability } from '../../../shared/contracts/ws/types.js';
import { getRequiredEnv } from '../env.js';
import { supabase, isSupabaseConfigured } from './supabase.js';

export interface OwnerRecord {
  id: string;
  userId: string;
}

export interface CreateHostTokenRecordInput {
  ownerId: string;
  hostId?: string | null;
  tokenHash: string;
  label?: string | null;
  scope: Record<string, unknown>;
  expiresAt?: string | null;
}

export interface HostTokenRecord {
  tokenId: string;
  ownerId: string;
  hostId: string | null;
  scope: Record<string, unknown>;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface RevokedHostTokenRecord {
  tokenId: string;
  ownerId: string;
  hostId: string | null;
  revokedAt: string;
}

export interface OwnerAgentRecord {
  id: string;
  ownerId: string;
  runtimeId: string | null;
  apiKeyHash: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  instructions: string | null;
  suggestedPrompts: unknown;
  executionMode: 'standard' | 'full_access';
  status: 'active' | 'archived';
  isDefault: boolean;
  source: 'system_default' | 'user_created' | 'imported';
  lastSeenAt: string | null;
  createdAt: string;
}

export interface OwnerAgentBindingRecord {
  id: string;
  agentId: string;
  ownerId: string;
  bindingKind: 'local_host' | 'cloud_plugin';
  hostId: string | null;
  preferredHostId: string | null;
  provider: 'openclaw' | 'claude' | 'cursor' | 'codex' | 'pi';
  executionMode: 'standard' | 'full_access';
  status: 'active';
  createdAt: string;
}

export interface OwnerAgentMessageTargetRecord {
  agent: OwnerAgentRecord;
  binding: OwnerAgentBindingRecord;
}

export interface OwnerAgentConversationRecord {
  id: string;
  ownerId: string;
  agentId: string;
  providerSessionId: string | null;
  providerWorkDir: string | null;
  status: 'active' | 'archived';
  lastActiveAt: string | null;
  createdAt: string;
}

export interface OwnerAgentRunRecord {
  id: string;
  conversationId: string;
  ownerId: string;
  agentId: string;
  hostId: string | null;
  provider: 'openclaw' | 'claude' | 'cursor' | 'codex' | 'pi';
  status: string;
  requestedModel: string | null;
  actualModel: string | null;
  providerSessionId: string | null;
  providerWorkDir: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface FindOwnerHostProviderInput {
  ownerId: string;
  backendSource: 'local' | 'cloud';
  provider: 'openclaw' | 'claude' | 'cursor' | 'codex' | 'pi';
}

export interface CreateOwnerAgentRecordInput {
  ownerId: string;
  name: string;
  apiKeyHash: string;
  runtimeId?: string | null;
  avatarUrl: string | null;
  description: string | null;
  instructions: string | null;
  suggestedPrompts: string[];
  executionMode: 'standard' | 'full_access';
  isDefault?: boolean;
  source?: 'system_default' | 'user_created' | 'imported';
}

export interface CreateAgentBindingRecordInput {
  agentId: string;
  ownerId: string;
  bindingKind: 'local_host' | 'cloud_plugin';
  hostId: string | null;
  preferredHostId: string | null;
  provider: 'openclaw' | 'claude' | 'cursor' | 'codex' | 'pi';
  executionMode: 'standard' | 'full_access';
}

interface OwnerRow {
  id: string;
  user_id: string;
}

interface HostTokenRow {
  id: string;
  owner_id: string;
  host_id: string | null;
  scope: Record<string, unknown>;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface OwnerAgentRow {
  id: string;
  owner_id: string;
  runtime_id: string | null;
  api_key_hash: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  instructions: string | null;
  suggested_prompts: unknown;
  execution_mode: string;
  status: string;
  is_default: boolean;
  source: string;
  last_seen_at: string | null;
  created_at: string;
}

interface AgentHostRow {
  id: string;
  owner_id: string;
  host_type: string;
  status: string;
}

interface AgentHostProviderRow {
  id: string;
  host_id: string;
  provider: string;
  status: string;
}

interface OwnerAgentBindingRow {
  id: string;
  agent_id: string;
  owner_id: string;
  binding_kind: string;
  host_id: string | null;
  preferred_host_id: string | null;
  provider: string;
  execution_mode: string;
  status: string;
  created_at: string;
}

interface OwnerAgentConversationRow {
  id: string;
  owner_id: string;
  agent_id: string;
  provider_session_id: string | null;
  provider_work_dir: string | null;
  status: string;
  last_active_at: string | null;
  created_at: string;
}

interface OwnerAgentRunRow {
  id: string;
  conversation_id: string;
  owner_id: string;
  agent_id: string;
  host_id: string | null;
  provider: string;
  status: string;
  requested_model: string | null;
  actual_model: string | null;
  provider_session_id: string | null;
  provider_work_dir: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const ownerAgentConversationKeyCache = new Map<string, string>();

export const hashHostToken = (token: string): string => {
  return createHmac('sha256', getRequiredEnv('QRCLAW_HOST_TOKEN_PEPPER'))
    .update(token, 'utf8')
    .digest('hex');
};

export const getOwnerByUserId = async (userId: string): Promise<OwnerRecord | null> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('owners')
    .select('id, user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to load owner');
  }
  if (!data) {
    return null;
  }

  const row = data as OwnerRow;
  return {
    id: row.id,
    userId: row.user_id,
  };
};

export const createHostTokenRecord = async (
  input: CreateHostTokenRecordInput
): Promise<HostTokenRecord> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('agent_host_tokens')
    .insert({
      owner_id: input.ownerId,
      host_id: input.hostId ?? null,
      token_hash: input.tokenHash,
      label: input.label ?? null,
      scope: input.scope,
      expires_at: input.expiresAt ?? null,
    })
    .select('id, owner_id, host_id, scope, expires_at, revoked_at, created_at')
    .single();

  if (error || !data) {
    throw new Error('Failed to create host token');
  }

  return mapHostTokenRow(data as HostTokenRow);
};

export const revokeHostTokenRecord = async (
  tokenId: string,
  ownerId: string
): Promise<RevokedHostTokenRecord | null> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data: existing, error: selectError } = await supabase
    .from('agent_host_tokens')
    .select('id, owner_id, host_id, scope, expires_at, revoked_at, created_at')
    .eq('id', tokenId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (selectError) {
    throw new Error('Failed to load host token');
  }
  if (!existing) {
    return null;
  }

  const row = existing as HostTokenRow;
  const revokedAt = row.revoked_at ?? new Date().toISOString();

  if (!row.revoked_at) {
    const { error: updateError } = await supabase
      .from('agent_host_tokens')
      .update({ revoked_at: revokedAt })
      .eq('id', tokenId)
      .eq('owner_id', ownerId)
      .is('revoked_at', null)
      .maybeSingle();

    if (updateError) {
      throw new Error('Failed to revoke host token');
    }
  }

  return {
    tokenId: row.id,
    ownerId: row.owner_id,
    hostId: row.host_id,
    revokedAt,
  };
};

export const verifyHostToken = async (tokenHash: string, now = new Date()): Promise<HostTokenRecord | null> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('agent_host_tokens')
    .select('id, owner_id, host_id, scope, expires_at, revoked_at, created_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to verify host token');
  }
  if (!data) {
    return null;
  }

  const record = mapHostTokenRow(data as HostTokenRow);
  if (record.revokedAt) {
    return null;
  }
  if (record.expiresAt && Date.parse(record.expiresAt) <= now.getTime()) {
    return null;
  }

  return record;
};

export const listOwnerAgentRecords = async (ownerId: string): Promise<OwnerAgentRecord[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('agents')
    .select(
      'id, owner_id, runtime_id, api_key_hash, name, avatar_url, description, instructions, suggested_prompts, execution_mode, status, is_default, source, last_seen_at, created_at'
    )
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Failed to list owner agents');
  }

  return ((data ?? []) as OwnerAgentRow[]).map(mapOwnerAgentRow);
};

export const listDefaultOwnerAgentRecords = async (ownerId: string): Promise<OwnerAgentRecord[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('agents')
    .select(
      'id, owner_id, runtime_id, api_key_hash, name, avatar_url, description, instructions, suggested_prompts, execution_mode, status, is_default, source, last_seen_at, created_at'
    )
    .eq('owner_id', ownerId)
    .eq('is_default', true)
    .eq('source', 'system_default')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error('Failed to list default owner agents');
  }

  return ((data ?? []) as OwnerAgentRow[]).map(mapOwnerAgentRow);
};

export const listOwnerAgentBindingRecords = async (
  ownerId: string
): Promise<OwnerAgentBindingRecord[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('agent_bindings')
    .select(
      'id, agent_id, owner_id, binding_kind, host_id, preferred_host_id, provider, execution_mode, status, created_at'
    )
    .eq('owner_id', ownerId)
    .eq('status', 'active');

  if (error) {
    throw new Error('Failed to list owner agent bindings');
  }

  return ((data ?? []) as OwnerAgentBindingRow[]).map(mapOwnerAgentBindingRow);
};

export const findOwnerHostProvider = async (
  input: FindOwnerHostProviderInput
): Promise<{ hostId: string } | null> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data: hosts, error: hostsError } = await supabase
    .from('agent_hosts')
    .select('id, owner_id, host_type, status')
    .eq('owner_id', input.ownerId)
    .eq('host_type', input.backendSource)
    .eq('status', 'online')
    .order('last_seen_at', { ascending: false });

  if (hostsError) {
    throw new Error('Failed to load owner hosts');
  }

  for (const host of (hosts ?? []) as AgentHostRow[]) {
    const { data: provider, error: providerError } = await supabase
      .from('agent_host_providers')
      .select('id, host_id, provider, status')
      .eq('host_id', host.id)
      .eq('provider', input.provider)
      .in('status', ['available', 'online'])
      .maybeSingle();

    if (providerError) {
      throw new Error('Failed to load owner host provider');
    }
    if (provider) {
      const row = provider as AgentHostProviderRow;
      return { hostId: row.host_id };
    }
  }

  return null;
};

export const updateAgentHostHeartbeatRecord = async (
  hostId: string,
  lastSeenAt: string
): Promise<void> => {
  const { error } = await supabase
    .from('agent_hosts')
    .update({ status: 'online', last_seen_at: lastSeenAt })
    .eq('id', hostId);

  if (error) {
    throw new Error('Failed to update agent host heartbeat');
  }
};

export const updateAgentHostProvidersRecord = async (
  hostId: string,
  providers: HostProviderCapability[]
): Promise<void> => {
  if (providers.length === 0) {
    return;
  }

  const rows = providers.map((provider) => ({
    host_id: hostId,
    provider: provider.provider,
    version: provider.version,
    status: provider.status,
    binary_path: provider.binary_path ?? null,
    capabilities: provider.capabilities,
    last_checked_at: new Date().toISOString(),
  }));

  const { error: deleteError, status: deleteStatus } = await supabase
    .from('agent_host_providers')
    .delete()
    .eq('host_id', hostId);

  if (deleteError) {
    console.error('[DB] updateAgentHostProvidersRecord delete error', {
      status: deleteStatus,
      error: deleteError,
    });
    throw new Error(`Failed to clear agent host providers: ${deleteError.message}`);
  }

  const { data, error, status } = await supabase
    .from('agent_host_providers')
    .insert(rows)
    .select();

  if (error) {
    console.error('[DB] updateAgentHostProvidersRecord error', { status, error });
    throw new Error(`Failed to update agent host providers: ${error.message}`);
  }
  console.log('[DB] updateAgentHostProvidersRecord ok', { rows: data?.length ?? 0, hostId });
};

export const createOwnerAgentRecord = async (
  input: CreateOwnerAgentRecordInput
): Promise<OwnerAgentRecord> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('agents')
    .insert({
      owner_id: input.ownerId,
      runtime_id: input.runtimeId ?? null,
      name: input.name,
      api_key_hash: input.apiKeyHash,
      avatar_url: input.avatarUrl,
      description: input.description,
      instructions: input.instructions,
      suggested_prompts: input.suggestedPrompts,
      execution_mode: input.executionMode,
      status: 'active',
      is_default: input.isDefault ?? false,
      source: input.source ?? 'user_created',
      visibility_scope: 'self',
    })
    .select(
      'id, owner_id, runtime_id, api_key_hash, name, avatar_url, description, instructions, suggested_prompts, execution_mode, status, is_default, source, last_seen_at, created_at'
    )
    .single();

  if (error || !data) {
    throw new Error('Failed to create owner agent');
  }

  return mapOwnerAgentRow(data as OwnerAgentRow);
};

export const updateDefaultOwnerAgentRuntime = async (input: {
  agentId: string;
  ownerId: string;
  runtimeId: string;
}): Promise<OwnerAgentRecord> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('agents')
    .update({ runtime_id: input.runtimeId })
    .eq('id', input.agentId)
    .eq('owner_id', input.ownerId)
    .eq('is_default', true)
    .eq('source', 'system_default')
    .select(
      'id, owner_id, runtime_id, api_key_hash, name, avatar_url, description, instructions, suggested_prompts, execution_mode, status, is_default, source, last_seen_at, created_at'
    )
    .single();

  if (error || !data) {
    throw new Error('Failed to update default owner agent runtime');
  }

  return mapOwnerAgentRow(data as OwnerAgentRow);
};

export const createAgentBindingRecord = async (
  input: CreateAgentBindingRecordInput
): Promise<OwnerAgentBindingRecord> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('agent_bindings')
    .insert({
      agent_id: input.agentId,
      owner_id: input.ownerId,
      binding_kind: input.bindingKind,
      host_id: input.hostId,
      preferred_host_id: input.preferredHostId,
      provider: input.provider,
      execution_mode: input.executionMode,
      status: 'active',
    })
    .select(
      'id, agent_id, owner_id, binding_kind, host_id, preferred_host_id, provider, execution_mode, status, created_at'
    )
    .single();

  if (error || !data) {
    throw new Error('Failed to create owner agent binding');
  }

  return mapOwnerAgentBindingRow(data as OwnerAgentBindingRow);
};

export const upsertAgentHostRecord = async (input: {
  hostId: string;
  ownerId: string;
  hostType: 'local' | 'cloud';
  displayName: string | null;
  status?: 'online' | 'offline';
  lastSeenAt: string;
}): Promise<void> => {
  const { data, error, status } = await supabase
    .from('agent_hosts')
    .upsert({
      id: input.hostId,
      owner_id: input.ownerId,
      host_type: input.hostType,
      display_name: input.displayName,
      status: input.status ?? 'online',
      last_seen_at: input.lastSeenAt,
      updated_at: input.lastSeenAt,
    })
    .select();

  if (error) {
    console.error('[DB] upsertAgentHostRecord error', { status, error });
    throw new Error(`Failed to upsert agent host: ${error.message}`);
  }
  console.log('[DB] upsertAgentHostRecord ok', { rows: data?.length ?? 0, hostId: input.hostId });
};

export const upsertAgentHostProviders = async (
  hostId: string,
  providers: Array<{
    provider: OwnerAgentBindingRecord['provider'];
    version: string | null;
    status: string;
    capabilities: Record<string, unknown>;
  }>
): Promise<void> => {
  if (providers.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('agent_host_providers')
    .upsert(
      providers.map((provider) => ({
        host_id: hostId,
        provider: provider.provider,
        version: provider.version,
        status: provider.status,
        capabilities: provider.capabilities,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
    );

  if (error) {
    throw new Error('Failed to upsert agent host providers');
  }
};

export const markAgentHostOfflineRecord = async (hostId: string): Promise<void> => {
  const { error } = await supabase
    .from('agent_hosts')
    .update({
      status: 'offline',
      updated_at: new Date().toISOString(),
    })
    .eq('id', hostId);

  if (error) {
    throw new Error('Failed to mark agent host offline');
  }
};

export const findOwnerAgentMessageTarget = async (
  ownerId: string,
  agentId: string
): Promise<OwnerAgentMessageTargetRecord | null> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select(
      'id, owner_id, name, avatar_url, description, instructions, suggested_prompts, execution_mode, status, last_seen_at, created_at'
    )
    .eq('id', agentId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (agentError) {
    throw new Error('Failed to load owner agent');
  }
  if (!agent) {
    return null;
  }

  const { data: binding, error: bindingError } = await supabase
    .from('agent_bindings')
    .select(
      'id, agent_id, owner_id, binding_kind, host_id, preferred_host_id, provider, execution_mode, status, created_at'
    )
    .eq('agent_id', agentId)
    .eq('owner_id', ownerId)
    .eq('status', 'active')
    .maybeSingle();

  if (bindingError) {
    throw new Error('Failed to load owner agent binding');
  }
  if (!binding) {
    return null;
  }

  return {
    agent: mapOwnerAgentRow(agent as OwnerAgentRow),
    binding: mapOwnerAgentBindingRow(binding as OwnerAgentBindingRow),
  };
};

export const getOrCreateOwnerAgentConversation = async (
  ownerId: string,
  agentId: string
): Promise<OwnerAgentConversationRecord> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data: existing, error: selectError } = await supabase
    .from('owner_agent_conversations')
    .select('id, owner_id, agent_id, provider_session_id, provider_work_dir, status, last_active_at, created_at')
    .eq('owner_id', ownerId)
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .maybeSingle();

  if (selectError) {
    throw new Error('Failed to load owner agent conversation');
  }
  if (existing) {
    return mapOwnerAgentConversationRow(existing as OwnerAgentConversationRow);
  }

  const now = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from('owner_agent_conversations')
    .insert({
      owner_id: ownerId,
      agent_id: agentId,
      status: 'active',
      last_active_at: now,
    })
    .select('id, owner_id, agent_id, provider_session_id, provider_work_dir, status, last_active_at, created_at')
    .single();

  if (createError || !created) {
    throw new Error('Failed to create owner agent conversation');
  }

  return mapOwnerAgentConversationRow(created as OwnerAgentConversationRow);
};

export const getOwnerAgentConversation = async (
  ownerId: string,
  agentId: string
): Promise<OwnerAgentConversationRecord | null> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }

  const { data, error } = await supabase
    .from('owner_agent_conversations')
    .select('id, owner_id, agent_id, provider_session_id, provider_work_dir, status, last_active_at, created_at')
    .eq('owner_id', ownerId)
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new Error('Failed to load owner agent conversation');
  }
  if (!data) {
    return null;
  }

  return mapOwnerAgentConversationRow(data as OwnerAgentConversationRow);
};

export const upsertOwnerAgentConversationKey = async (
  conversationId: string,
  encryptedDek: string
): Promise<string> => {
  const cached = ownerAgentConversationKeyCache.get(conversationId);
  if (cached) return cached;

  const { data: existing } = await supabase
    .from('owner_agent_conversation_keys')
    .select('key_id')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (existing?.key_id) {
    ownerAgentConversationKeyCache.set(conversationId, existing.key_id);
    return existing.key_id;
  }

  if (!encryptedDek) {
    throw new Error(`No encrypted DEK available for owner agent conversation ${conversationId}`);
  }

  const { data: inserted, error } = await supabase
    .from('owner_agent_conversation_keys')
    .insert({
      conversation_id: conversationId,
      key_data_encrypted: `\\x${Buffer.from(encryptedDek).toString('hex')}`,
      algorithm: 'aes-256-gcm',
      status: 'active',
      kek_version: 1,
    })
    .select('key_id')
    .single();

  if (error || !inserted?.key_id) {
    throw new Error('Failed to create owner agent conversation key');
  }

  ownerAgentConversationKeyCache.set(conversationId, inserted.key_id);
  return inserted.key_id;
};

export const countPendingOwnerAgentMessages = async (params: {
  conversationId: string;
  ownerId: string;
  agentId: string;
}): Promise<number> => {
  const { data, error } = await supabase
    .from('owner_agent_messages')
    .select('id')
    .eq('conversation_id', params.conversationId)
    .eq('owner_id', params.ownerId)
    .eq('agent_id', params.agentId)
    .eq('sender_type', 'owner')
    .eq('status', 'pending');

  if (error) {
    throw new Error('Failed to count pending owner agent messages');
  }

  return (data ?? []).length;
};

export const createOwnerAgentRunRecord = async (input: {
  conversationId: string;
  ownerId: string;
  agentId: string;
  hostId: string | null;
  provider: OwnerAgentBindingRecord['provider'];
  requestedModel?: string | null;
  status: string;
}): Promise<OwnerAgentRunRecord> => {
  const { data, error } = await supabase
    .from('owner_agent_runs')
    .insert({
      conversation_id: input.conversationId,
      owner_id: input.ownerId,
      agent_id: input.agentId,
      host_id: input.hostId,
      provider: input.provider,
      status: input.status,
      requested_model: input.requestedModel ?? null,
    })
    .select(
      'id, conversation_id, owner_id, agent_id, host_id, provider, status, requested_model, actual_model, provider_session_id, provider_work_dir, error_code, error_message, created_at, started_at, completed_at'
    )
    .single();

  if (error || !data) {
    throw new Error('Failed to create owner agent run');
  }

  return mapOwnerAgentRunRow(data as OwnerAgentRunRow);
};

export const getOwnerAgentRunRecord = async (
  runId: string
): Promise<OwnerAgentRunRecord | null> => {
  const { data, error } = await supabase
    .from('owner_agent_runs')
    .select(
      'id, conversation_id, owner_id, agent_id, host_id, provider, status, requested_model, actual_model, provider_session_id, provider_work_dir, error_code, error_message, created_at, started_at, completed_at'
    )
    .eq('id', runId)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to load owner agent run');
  }
  if (!data) {
    return null;
  }

  return mapOwnerAgentRunRow(data as OwnerAgentRunRow);
};

export const insertOwnerAgentMessageRecord = async (input: {
  conversationId: string;
  ownerId: string;
  agentId: string;
  runId: string;
  senderType: 'owner' | 'agent' | 'system';
  contentEncrypted: string;
  contentType: 'text';
  encryptionMeta: Record<string, unknown>;
  status: string;
}): Promise<{ id: string }> => {
  const { data, error } = await supabase
    .from('owner_agent_messages')
    .insert({
      conversation_id: input.conversationId,
      owner_id: input.ownerId,
      agent_id: input.agentId,
      run_id: input.runId,
      sender_type: input.senderType,
      content_encrypted: input.contentEncrypted,
      content_type: input.contentType,
      encryption_meta: input.encryptionMeta,
      status: input.status,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error('Failed to create owner agent message');
  }

  return { id: data.id };
};

export const updateOwnerAgentMessageStatus = async (
  messageId: string,
  ownerId: string,
  status: string
): Promise<void> => {
  const { error } = await supabase
    .from('owner_agent_messages')
    .update({ status })
    .eq('id', messageId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to update owner agent message status');
  }
};

export const updateOwnerAgentRunStatus = async (
  runId: string,
  ownerId: string,
  update: {
    status: string;
    startedAt?: string | null;
    completedAt?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    actualModel?: string | null;
    providerSessionId?: string | null;
    providerWorkDir?: string | null;
  }
): Promise<void> => {
  const payload: Record<string, unknown> = { status: update.status };
  if ('startedAt' in update) payload.started_at = update.startedAt;
  if ('completedAt' in update) payload.completed_at = update.completedAt;
  if ('errorCode' in update) payload.error_code = update.errorCode;
  if ('errorMessage' in update) payload.error_message = update.errorMessage;
  if ('actualModel' in update) payload.actual_model = update.actualModel;
  if ('providerSessionId' in update) payload.provider_session_id = update.providerSessionId;
  if ('providerWorkDir' in update) payload.provider_work_dir = update.providerWorkDir;

  const { error } = await supabase
    .from('owner_agent_runs')
    .update(payload)
    .eq('id', runId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to update owner agent run status');
  }
};

export const updateOwnerAgentRunRuntime = async (
  runId: string,
  ownerId: string,
  update: {
    status?: string;
    hostId?: string | null;
    actualModel?: string | null;
    providerSessionId?: string | null;
    providerWorkDir?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }
): Promise<void> => {
  const payload: Record<string, unknown> = {};
  if ('status' in update) payload.status = update.status;
  if ('hostId' in update) payload.host_id = update.hostId;
  if ('actualModel' in update) payload.actual_model = update.actualModel;
  if ('providerSessionId' in update) payload.provider_session_id = update.providerSessionId;
  if ('providerWorkDir' in update) payload.provider_work_dir = update.providerWorkDir;
  if ('startedAt' in update) payload.started_at = update.startedAt;
  if ('completedAt' in update) payload.completed_at = update.completedAt;
  if ('errorCode' in update) payload.error_code = update.errorCode;
  if ('errorMessage' in update) payload.error_message = update.errorMessage;

  const { error } = await supabase
    .from('owner_agent_runs')
    .update(payload)
    .eq('id', runId)
    .eq('owner_id', ownerId);

  if (error) {
    throw new Error('Failed to update owner agent run runtime');
  }
};

export const updateOwnerAgentConversationRuntime = async (
  conversationId: string,
  update: {
    providerSessionId?: string | null;
    providerWorkDir?: string | null;
  }
): Promise<void> => {
  const payload: Record<string, unknown> = { last_active_at: new Date().toISOString() };
  if ('providerSessionId' in update) payload.provider_session_id = update.providerSessionId;
  if ('providerWorkDir' in update) payload.provider_work_dir = update.providerWorkDir;

  const { error } = await supabase
    .from('owner_agent_conversations')
    .update(payload)
    .eq('id', conversationId);

  if (error) {
    throw new Error('Failed to update owner agent conversation runtime');
  }
};

export const findPendingOwnerAgentMessageByRun = async (
  ownerId: string,
  agentId: string,
  runId: string
): Promise<{ messageId: string; conversationId: string } | null> => {
  const { data, error } = await supabase
    .from('owner_agent_messages')
    .select('id, conversation_id')
    .eq('owner_id', ownerId)
    .eq('agent_id', agentId)
    .eq('run_id', runId)
    .eq('sender_type', 'owner')
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
    throw new Error('Failed to load pending owner agent message');
  }
  if (!data) {
    return null;
  }

  return {
    messageId: String(data.id),
    conversationId: String(data.conversation_id),
  };
};

export const listTimedOutOwnerAgentRuns = async (
  ownerId: string,
  cutoffIso: string
): Promise<OwnerAgentRunRecord[]> => {
  const statuses = ['host_dispatched', 'accepted', 'running'];
  const rows: OwnerAgentRunRow[] = [];

  for (const status of statuses) {
    const { data, error } = await supabase
      .from('owner_agent_runs')
      .select(
        'id, conversation_id, owner_id, agent_id, host_id, provider, status, requested_model, actual_model, provider_session_id, provider_work_dir, error_code, error_message, created_at, started_at, completed_at'
      )
      .eq('owner_id', ownerId)
      .eq('status', status);

    if (error) {
      throw new Error('Failed to load timed out owner agent runs');
    }
    rows.push(...((data ?? []) as OwnerAgentRunRow[]));
  }

  return rows
    .filter((row) => row.started_at && row.started_at <= cutoffIso)
    .map(mapOwnerAgentRunRow);
};

export const insertOwnerAgentRunEventRecord = async (input: {
  runId: string;
  ownerId: string;
  seq: number;
  type: string;
  contentEncrypted?: string | null;
  encryptionMeta?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  const { error } = await supabase.from('owner_agent_run_events').insert({
    run_id: input.runId,
    owner_id: input.ownerId,
    seq: input.seq,
    type: input.type,
    content_encrypted: input.contentEncrypted ?? null,
    encryption_meta: input.encryptionMeta ?? null,
    metadata: input.metadata ?? {},
  });

  if (error && error.code !== '23505') {
    throw new Error('Failed to insert owner agent run event');
  }
};

export const markExpiredPendingOwnerAgentMessages = async (
  ownerId: string,
  olderThanIso: string
): Promise<number> => {
  const { data, error } = await supabase
    .from('owner_agent_messages')
    .select('id, created_at')
    .eq('owner_id', ownerId)
    .eq('sender_type', 'owner')
    .eq('status', 'pending');

  if (error) {
    throw new Error('Failed to load stale pending owner agent messages');
  }

  const staleRows = ((data ?? []) as Array<{ id: string; created_at: string }>)
    .filter((row) => row.created_at <= olderThanIso);

  for (const row of staleRows) {
    await updateOwnerAgentMessageStatus(row.id, ownerId, 'expired');
  }

  return staleRows.length;
};

const mapHostTokenRow = (row: HostTokenRow): HostTokenRecord => ({
  tokenId: row.id,
  ownerId: row.owner_id,
  hostId: row.host_id,
  scope: row.scope,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  createdAt: row.created_at,
});

const mapOwnerAgentRow = (row: OwnerAgentRow): OwnerAgentRecord => ({
  id: row.id,
  ownerId: row.owner_id,
  runtimeId: row.runtime_id ?? null,
  apiKeyHash: row.api_key_hash ?? '',
  name: row.name,
  avatarUrl: row.avatar_url,
  description: row.description,
  instructions: row.instructions,
  suggestedPrompts: row.suggested_prompts,
  executionMode: row.execution_mode === 'full_access' ? 'full_access' : 'standard',
  status: row.status === 'archived' ? 'archived' : 'active',
  isDefault: row.is_default === true,
  source: mapOwnerAgentSource(row.source),
  lastSeenAt: row.last_seen_at,
  createdAt: row.created_at,
});

const mapOwnerAgentBindingRow = (row: OwnerAgentBindingRow): OwnerAgentBindingRecord => ({
  id: row.id,
  agentId: row.agent_id,
  ownerId: row.owner_id,
  bindingKind: row.binding_kind === 'cloud_plugin' ? 'cloud_plugin' : 'local_host',
  hostId: row.host_id,
  preferredHostId: row.preferred_host_id,
  provider: mapOwnerAgentProvider(row.provider),
  executionMode: row.execution_mode === 'full_access' ? 'full_access' : 'standard',
  status: 'active',
  createdAt: row.created_at,
});

const mapOwnerAgentConversationRow = (
  row: OwnerAgentConversationRow
): OwnerAgentConversationRecord => ({
  id: row.id,
  ownerId: row.owner_id,
  agentId: row.agent_id,
  providerSessionId: row.provider_session_id,
  providerWorkDir: row.provider_work_dir,
  status: row.status === 'archived' ? 'archived' : 'active',
  lastActiveAt: row.last_active_at,
  createdAt: row.created_at,
});

const mapOwnerAgentRunRow = (row: OwnerAgentRunRow): OwnerAgentRunRecord => ({
  id: row.id,
  conversationId: row.conversation_id,
  ownerId: row.owner_id,
  agentId: row.agent_id,
  hostId: row.host_id,
  provider: mapOwnerAgentProvider(row.provider),
  status: row.status,
  requestedModel: row.requested_model,
  actualModel: row.actual_model,
  providerSessionId: row.provider_session_id,
  providerWorkDir: row.provider_work_dir,
  errorCode: row.error_code,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
});

const mapOwnerAgentProvider = (provider: string): OwnerAgentBindingRecord['provider'] => {
  if (
    provider === 'openclaw'
    || provider === 'claude'
    || provider === 'cursor'
    || provider === 'codex'
    || provider === 'pi'
  ) {
    return provider;
  }
  return 'openclaw';
};

const mapOwnerAgentSource = (source: string): OwnerAgentRecord['source'] => {
  if (source === 'system_default' || source === 'imported') {
    return source;
  }
  return 'user_created';
};
