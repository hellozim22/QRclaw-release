import {
  OWNER_RUNTIME_TYPES,
  type OwnerRuntimeType,
} from '../../../shared/contracts/http/owner-runtimes/types.js';
import { supabase, isSupabaseConfigured } from './supabase.js';

export interface AgentRuntimeRecord {
  id: string;
  ownerId: string;
  hostId: string | null;
  runtimeType: string;
  displayName: string;
  binaryPath: string | null;
  version: string | null;
  runtimeStatus: 'online' | 'offline' | 'updating';
  statusReason: string | null;
  capabilities: Record<string, unknown>;
  metadata: Record<string, unknown>;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListAgentRuntimesInput {
  ownerId: string;
  runtimeStatus?: 'online' | 'offline' | 'updating';
}

export interface UpsertAgentRuntimeInput {
  id?: string;
  ownerId: string;
  hostId: string | null;
  runtimeType: string;
  displayName: string;
  binaryPath: string | null;
  version: string | null;
  runtimeStatus: 'online' | 'offline' | 'updating';
  statusReason: string | null;
  capabilities: Record<string, unknown>;
  metadata: Record<string, unknown>;
  lastSeenAt: string | null;
}

export interface DefaultOwnerAgentRecord {
  id: string;
  ownerId: string;
  runtimeId: string | null;
  apiKeyHash: string;
  name: string;
  avatarUrl: string | null;
  status: 'active' | 'archived';
  isDefault: boolean;
  source: 'system_default' | 'user_created' | 'imported';
  createdAt: string;
}

export interface CreateDefaultOwnerAgentRecordInput {
  ownerId: string;
  runtimeType: OwnerRuntimeType;
  runtimeId: string | null;
  apiKeyHash: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  instructions: string | null;
  suggestedPrompts: string[];
  executionMode: 'standard' | 'full_access';
}

export interface UpdateDefaultOwnerAgentRuntimeInput {
  agentId: string;
  ownerId: string;
  runtimeId: string;
}

export interface UpsertDefaultOwnerAgentBindingInput {
  agentId: string;
  ownerId: string;
  provider: OwnerRuntimeType;
  hostId: string | null;
  executionMode: 'standard' | 'full_access';
}

export interface DefaultOwnerAgentBindingRecord {
  id: string;
  agentId: string;
  ownerId: string;
  bindingKind: 'local_host' | 'cloud_plugin';
  hostId: string | null;
  preferredHostId: string | null;
  provider: OwnerRuntimeType;
  executionMode: 'standard' | 'full_access';
  status: string;
}

const runtimeColumns = [
  'id',
  'owner_id',
  'host_id',
  'runtime_type',
  'display_name',
  'binary_path',
  'version',
  'runtime_status',
  'status_reason',
  'capabilities',
  'metadata',
  'last_seen_at',
  'created_at',
  'updated_at',
].join(', ');

const defaultAgentColumns = [
  'id',
  'owner_id',
  'runtime_id',
  'api_key_hash',
  'name',
  'avatar_url',
  'status',
  'is_default',
  'source',
  'created_at',
].join(', ');

export const listAgentRuntimes = async (
  input: ListAgentRuntimesInput
): Promise<AgentRuntimeRecord[]> => {
  ensureSupabaseConfigured();

  let query = supabase
    .from('agent_runtimes')
    .select(runtimeColumns)
    .eq('owner_id', input.ownerId);

  if (input.runtimeStatus) {
    query = query.eq('runtime_status', input.runtimeStatus);
  }

  const { data, error } = await query.order('last_seen_at', {
    ascending: false,
    nullsFirst: false,
  });

  if (error) {
    throw new Error(`Failed to list agent runtimes: ${error.message}`);
  }

  return ((data ?? []) as unknown as AgentRuntimeRow[]).map(mapAgentRuntimeRow);
};

export const getAgentRuntimeById = async (
  ownerId: string,
  runtimeId: string
): Promise<AgentRuntimeRecord | null> => {
  ensureSupabaseConfigured();

  const { data, error } = await supabase
    .from('agent_runtimes')
    .select(runtimeColumns)
    .eq('id', runtimeId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get agent runtime: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return mapAgentRuntimeRow(data as unknown as AgentRuntimeRow);
};

export const upsertAgentRuntime = async (
  input: UpsertAgentRuntimeInput
): Promise<AgentRuntimeRecord> => {
  ensureSupabaseConfigured();

  const { data, error } = await supabase
    .from('agent_runtimes')
    .upsert({
      ...(input.id ? { id: input.id } : {}),
      owner_id: input.ownerId,
      host_id: input.hostId,
      runtime_type: input.runtimeType,
      display_name: input.displayName,
      binary_path: input.binaryPath,
      version: input.version,
      runtime_status: input.runtimeStatus,
      status_reason: input.statusReason,
      capabilities: input.capabilities,
      metadata: input.metadata,
      last_seen_at: input.lastSeenAt,
    })
    .select(runtimeColumns)
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert agent runtime: ${error?.message ?? 'missing row'}`);
  }

  return mapAgentRuntimeRow(data as unknown as AgentRuntimeRow);
};

export const updateAgentRuntimeStatus = async (
  ownerId: string,
  runtimeId: string,
  status: 'online' | 'offline' | 'updating',
  statusReason?: string | null
): Promise<AgentRuntimeRecord> => {
  ensureSupabaseConfigured();

  const { data, error } = await supabase
    .from('agent_runtimes')
    .update({
      runtime_status: status,
      status_reason: statusReason,
      last_seen_at: status === 'online' ? new Date().toISOString() : undefined,
    })
    .eq('id', runtimeId)
    .eq('owner_id', ownerId)
    .select(runtimeColumns)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update agent runtime status: ${error?.message ?? 'missing row'}`);
  }

  return mapAgentRuntimeRow(data as unknown as AgentRuntimeRow);
};

export const syncAgentRuntimesFromHostProviders = async (
  ownerId: string
): Promise<AgentRuntimeRecord[]> => {
  ensureSupabaseConfigured();

  const { data: hosts, error: hostsError } = await supabase
    .from('agent_hosts')
    .select('id, owner_id, display_name, status, last_seen_at')
    .eq('owner_id', ownerId);

  if (hostsError) {
    throw new Error(`Failed to list owner hosts: ${hostsError.message}`);
  }

  const existing = await listAgentRuntimes({ ownerId });
  const existingByKey = new Map(
    existing.map((runtime) => [buildRuntimeKey(runtime.hostId, runtime.runtimeType), runtime])
  );
  const synced: AgentRuntimeRecord[] = [];

  for (const host of (hosts ?? []) as AgentHostRow[]) {
    const { data: providers, error: providersError } = await supabase
      .from('agent_host_providers')
      .select('host_id, provider, status, binary_path, version, capabilities, health_check_passed_at')
      .eq('host_id', host.id);

    if (providersError) {
      throw new Error(`Failed to list host providers: ${providersError.message}`);
    }

    for (const provider of (providers ?? []) as AgentHostProviderRow[]) {
      const runtimeType = mapOwnerRuntimeType(provider.provider);
      if (!runtimeType) {
        continue;
      }

      // Host sidecar reports 'online' (detect.StatusOnline); legacy rows may
      // carry 'available'. Treat both as operational.
      const providerOnline =
        provider.status === 'available' || provider.status === 'online';
      const runtimeStatus = host.status === 'online' && providerOnline
        ? 'online'
        : 'offline';
      const existingRuntime = existingByKey.get(buildRuntimeKey(host.id, runtimeType));
      const record = await upsertAgentRuntime({
        id: existingRuntime?.id,
        ownerId,
        hostId: host.id,
        runtimeType,
        displayName: getRuntimeDisplayName(runtimeType),
        binaryPath: provider.binary_path,
        version: provider.version,
        runtimeStatus,
        statusReason: runtimeStatus === 'online' ? null : provider.status,
        capabilities: asRecord(provider.capabilities),
        metadata: {
          host_display_name: host.display_name,
          provider_status: provider.status,
        },
        lastSeenAt: provider.health_check_passed_at ?? host.last_seen_at,
      });
      synced.push(record);
    }
  }

  return synced;
};

export const listDefaultOwnerAgentRecords = async (
  ownerId: string
): Promise<DefaultOwnerAgentRecord[]> => {
  ensureSupabaseConfigured();

  const { data, error } = await supabase
    .from('agents')
    .select(defaultAgentColumns)
    .eq('owner_id', ownerId)
    .eq('is_default', true)
    .eq('source', 'system_default');

  if (error) {
    throw new Error(`Failed to list default owner agents: ${error.message}`);
  }

  return ((data ?? []) as unknown as DefaultOwnerAgentRow[]).map(mapDefaultOwnerAgentRow);
};

export const createDefaultOwnerAgentRecord = async (
  input: CreateDefaultOwnerAgentRecordInput
): Promise<DefaultOwnerAgentRecord> => {
  ensureSupabaseConfigured();

  const { data, error } = await supabase
    .from('agents')
    .insert({
      owner_id: input.ownerId,
      runtime_id: input.runtimeId,
      api_key_hash: input.apiKeyHash,
      name: input.name,
      avatar_url: input.avatarUrl,
      description: input.description,
      instructions: input.instructions,
      suggested_prompts: input.suggestedPrompts,
      execution_mode: input.executionMode,
      status: 'active',
      visibility_scope: 'self',
      is_default: true,
      source: 'system_default',
    })
    .select(defaultAgentColumns)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create default owner agent: ${error?.message ?? 'missing row'}`);
  }

  return mapDefaultOwnerAgentRow(data as unknown as DefaultOwnerAgentRow);
};

export const updateDefaultOwnerAgentRuntime = async (
  input: UpdateDefaultOwnerAgentRuntimeInput
): Promise<DefaultOwnerAgentRecord> => {
  ensureSupabaseConfigured();

  const { data, error } = await supabase
    .from('agents')
    .update({ runtime_id: input.runtimeId })
    .eq('id', input.agentId)
    .eq('owner_id', input.ownerId)
    .eq('is_default', true)
    .eq('source', 'system_default')
    .select(defaultAgentColumns)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update default owner agent runtime: ${error?.message ?? 'missing row'}`);
  }

  return mapDefaultOwnerAgentRow(data as unknown as DefaultOwnerAgentRow);
};

export const updateDefaultOwnerAgentAvatar = async (input: {
  agentId: string;
  ownerId: string;
  avatarUrl: string | null;
}): Promise<DefaultOwnerAgentRecord> => {
  ensureSupabaseConfigured();

  const { data, error } = await supabase
    .from('agents')
    .update({ avatar_url: input.avatarUrl })
    .eq('id', input.agentId)
    .eq('owner_id', input.ownerId)
    .eq('is_default', true)
    .eq('source', 'system_default')
    .select(defaultAgentColumns)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to update default owner agent avatar: ${error?.message ?? 'missing row'}`
    );
  }

  return mapDefaultOwnerAgentRow(data as unknown as DefaultOwnerAgentRow);
};

const bindingColumns = [
  'id',
  'agent_id',
  'owner_id',
  'binding_kind',
  'host_id',
  'preferred_host_id',
  'provider',
  'execution_mode',
  'status',
].join(', ');

export const upsertDefaultOwnerAgentBinding = async (
  input: UpsertDefaultOwnerAgentBindingInput
): Promise<DefaultOwnerAgentBindingRecord> => {
  ensureSupabaseConfigured();

  const bindingKind: 'local_host' | 'cloud_plugin' = input.hostId ? 'local_host' : 'cloud_plugin';

  const { data, error } = await supabase
    .from('agent_bindings')
    .upsert(
      {
        agent_id: input.agentId,
        owner_id: input.ownerId,
        binding_kind: bindingKind,
        host_id: input.hostId,
        preferred_host_id: input.hostId,
        provider: input.provider,
        execution_mode: input.executionMode,
        status: 'active',
      },
      { onConflict: 'agent_id' }
    )
    .select(bindingColumns)
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert default owner agent binding: ${error?.message ?? 'missing row'}`);
  }

  return mapDefaultOwnerAgentBindingRow(data as unknown as DefaultOwnerAgentBindingRow);
};

interface AgentRuntimeRow {
  id: string;
  owner_id: string;
  host_id: string | null;
  runtime_type: string;
  display_name: string;
  binary_path: string | null;
  version: string | null;
  runtime_status: string;
  status_reason: string | null;
  capabilities: unknown;
  metadata: unknown;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentHostRow {
  id: string;
  owner_id: string;
  display_name: string | null;
  status: string;
  last_seen_at: string | null;
}

interface AgentHostProviderRow {
  host_id: string;
  provider: string;
  status: string;
  binary_path: string | null;
  version: string | null;
  capabilities: unknown;
  health_check_passed_at: string | null;
}

interface DefaultOwnerAgentRow {
  id: string;
  owner_id: string;
  runtime_id: string | null;
  api_key_hash: string;
  name: string;
  avatar_url: string | null;
  status: string;
  is_default: boolean;
  source: string;
  created_at: string;
}

interface DefaultOwnerAgentBindingRow {
  id: string;
  agent_id: string;
  owner_id: string;
  binding_kind: string;
  host_id: string | null;
  preferred_host_id: string | null;
  provider: string;
  execution_mode: string;
  status: string;
}

const ensureSupabaseConfigured = (): void => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }
};

const mapAgentRuntimeRow = (row: AgentRuntimeRow): AgentRuntimeRecord => ({
  id: row.id,
  ownerId: row.owner_id,
  hostId: row.host_id,
  runtimeType: row.runtime_type,
  displayName: row.display_name,
  binaryPath: row.binary_path,
  version: row.version,
  runtimeStatus: mapRuntimeStatus(row.runtime_status),
  statusReason: row.status_reason,
  capabilities: asRecord(row.capabilities),
  metadata: asRecord(row.metadata),
  lastSeenAt: row.last_seen_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapDefaultOwnerAgentRow = (row: DefaultOwnerAgentRow): DefaultOwnerAgentRecord => ({
  id: row.id,
  ownerId: row.owner_id,
  runtimeId: row.runtime_id,
  apiKeyHash: row.api_key_hash,
  name: row.name,
  avatarUrl: row.avatar_url,
  status: row.status === 'archived' ? 'archived' : 'active',
  isDefault: row.is_default,
  source: mapAgentSource(row.source),
  createdAt: row.created_at,
});

const mapDefaultOwnerAgentBindingRow = (
  row: DefaultOwnerAgentBindingRow
): DefaultOwnerAgentBindingRecord => ({
  id: row.id,
  agentId: row.agent_id,
  ownerId: row.owner_id,
  bindingKind: row.binding_kind === 'local_host' ? 'local_host' : 'cloud_plugin',
  hostId: row.host_id,
  preferredHostId: row.preferred_host_id,
  provider: (OWNER_RUNTIME_TYPES.includes(row.provider as OwnerRuntimeType)
    ? row.provider
    : 'openclaw') as OwnerRuntimeType,
  executionMode: row.execution_mode === 'standard' ? 'standard' : 'full_access',
  status: row.status,
});

const mapAgentSource = (source: string): DefaultOwnerAgentRecord['source'] => {
  if (source === 'user_created' || source === 'imported') {
    return source;
  }
  return 'system_default';
};

const mapRuntimeStatus = (status: string): AgentRuntimeRecord['runtimeStatus'] => {
  if (status === 'online' || status === 'updating') {
    return status;
  }
  return 'offline';
};

const mapOwnerRuntimeType = (runtimeType: string): OwnerRuntimeType | null => {
  return OWNER_RUNTIME_TYPES.includes(runtimeType as OwnerRuntimeType)
    ? (runtimeType as OwnerRuntimeType)
    : null;
};

const getRuntimeDisplayName = (runtimeType: OwnerRuntimeType): string => {
  switch (runtimeType) {
    case 'openclaw':
      return 'OpenClaw';
    case 'claude':
      return 'Claude Code';
    case 'cursor':
      return 'Cursor';
    case 'codex':
      return 'Codex';
    case 'pi':
      return 'Pi';
  }
};

const buildRuntimeKey = (hostId: string | null, runtimeType: string): string => {
  return `${hostId ?? 'none'}:${runtimeType}`;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};
