import { createHash } from 'crypto';
import type {
  OwnerRuntime,
  OwnerRuntimeDefaultAgent,
  OwnerRuntimeInstallHint,
  OwnerRuntimeStatus,
  OwnerRuntimeType,
  OwnerRuntimesResponse,
} from '../../../shared/contracts/http/owner-runtimes/types.js';
import { OWNER_RUNTIME_TYPES } from '../../../shared/contracts/http/owner-runtimes/types.js';
import {
  createDefaultOwnerAgentRecord,
  listAgentRuntimes,
  listDefaultOwnerAgentRecords,
  syncAgentRuntimesFromHostProviders,
  updateDefaultOwnerAgentAvatar,
  updateDefaultOwnerAgentRuntime,
  upsertDefaultOwnerAgentBinding,
  type CreateDefaultOwnerAgentRecordInput,
  type DefaultOwnerAgentBindingRecord,
  type DefaultOwnerAgentRecord as DbDefaultOwnerAgentRecord,
  type UpdateDefaultOwnerAgentRuntimeInput,
  type UpsertDefaultOwnerAgentBindingInput,
} from '../db/owner-runtimes.js';

export interface DefaultOwnerRuntimeRecord {
  id: string;
  ownerId: string;
  hostId: string | null;
  runtimeType: string;
  displayName: string;
  runtimeStatus: 'online' | 'offline' | 'updating';
  statusReason: string | null;
  capabilities: Record<string, unknown>;
  version: string | null;
  lastSeenAt: string | null;
}

export interface DefaultOwnerAgentRecord extends DbDefaultOwnerAgentRecord {
  runtimeType?: OwnerRuntimeType;
}

export interface EnsureDefaultAgentsDependencies {
  listOwnerRuntimeRecords: (ownerId: string) => Promise<DefaultOwnerRuntimeRecord[]>;
  listDefaultOwnerAgentRecords: (ownerId: string) => Promise<DefaultOwnerAgentRecord[]>;
  createDefaultOwnerAgentRecord: (
    input: CreateDefaultOwnerAgentRecordInput
  ) => Promise<DefaultOwnerAgentRecord>;
  updateDefaultOwnerAgentRuntime: (
    input: UpdateDefaultOwnerAgentRuntimeInput
  ) => Promise<DefaultOwnerAgentRecord>;
  updateDefaultOwnerAgentAvatar: (input: {
    agentId: string;
    ownerId: string;
    avatarUrl: string | null;
  }) => Promise<DefaultOwnerAgentRecord>;
  upsertDefaultOwnerAgentBinding: (
    input: UpsertDefaultOwnerAgentBindingInput
  ) => Promise<DefaultOwnerAgentBindingRecord>;
}

interface DefaultAgentConfig {
  name: string;
  avatarUrl: string | null;
  description: string | null;
  instructions: string | null;
  suggestedPrompts: string[];
  executionMode: 'standard' | 'full_access';
}

const DEFAULT_AGENT_CONFIGS: Record<OwnerRuntimeType, DefaultAgentConfig> = {
  openclaw: {
    name: 'OpenClaw Assistant',
    avatarUrl: '/avatars/openclaw-color.png',
    description: 'Default OpenClaw runtime agent',
    instructions: 'You are the owner default OpenClaw agent.',
    suggestedPrompts: ['Help me plan this task', 'Summarize the current project'],
    executionMode: 'standard',
  },
  claude: {
    name: 'Claude Assistant',
    avatarUrl: '/avatars/claude.png',
    description: 'Default Claude Code runtime agent',
    instructions: 'You are the owner default Claude Code agent.',
    suggestedPrompts: ['Review this implementation', 'Help me debug this issue'],
    executionMode: 'standard',
  },
  cursor: {
    name: 'Cursor Assistant',
    avatarUrl: '/avatars/cursor.png',
    description: 'Default Cursor runtime agent',
    instructions: 'You are the owner default Cursor agent.',
    suggestedPrompts: ['Edit this code path', 'Explain this module'],
    executionMode: 'standard',
  },
  codex: {
    name: 'Codex Assistant',
    avatarUrl: '/avatars/codex.png',
    description: 'Default Codex runtime agent',
    instructions: 'You are the owner default Codex agent.',
    suggestedPrompts: ['Implement the next test', 'Refactor this function'],
    executionMode: 'standard',
  },
  pi: {
    name: 'Pi Assistant',
    avatarUrl: null,
    description: 'Default Pi runtime agent',
    instructions: 'You are the owner default Pi agent.',
    suggestedPrompts: ['Help me plan this task', 'Summarize the codebase'],
    executionMode: 'standard',
  },
};

const RUNTIME_INSTALL_HINTS: Record<OwnerRuntimeType, OwnerRuntimeInstallHint> = {
  openclaw: {
    label: 'OpenClaw',
    command: 'npm install -g openclaw',
    docs_url: 'https://github.com/HelloZIM/OpenClaw',
  },
  claude: {
    label: 'Claude Code',
    command: 'npm install -g @anthropic-ai/claude-code',
    docs_url: 'https://docs.anthropic.com/claude-code',
  },
  cursor: {
    label: 'Cursor',
    command: 'cursor --version',
    docs_url: 'https://docs.cursor.com',
  },
  codex: {
    label: 'Codex',
    command: 'npm install -g @openai/codex',
    docs_url: 'https://developers.openai.com/codex',
  },
  pi: {
    label: 'Pi',
    command: 'brew install pi',
    docs_url: 'https://github.com/badlogic/pi',
  },
};

const RUNTIME_DISPLAY_NAMES: Record<OwnerRuntimeType, string> = {
  openclaw: 'OpenClaw',
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
  pi: 'Pi',
};

const defaultDeps: EnsureDefaultAgentsDependencies = {
  listOwnerRuntimeRecords: async (ownerId) => listAgentRuntimes({ ownerId }),
  listDefaultOwnerAgentRecords,
  createDefaultOwnerAgentRecord,
  updateDefaultOwnerAgentRuntime,
  updateDefaultOwnerAgentAvatar,
  upsertDefaultOwnerAgentBinding,
};

export const buildDefaultAgentApiKeyHash = (
  ownerId: string,
  runtimeType: OwnerRuntimeType
): string => {
  return createHash('sha256')
    .update(`qrclaw:default-owner-agent:v1:${ownerId}:${runtimeType}`)
    .digest('hex');
};

export const getDefaultAgentRuntimeType = (
  ownerId: string,
  apiKeyHash: string
): OwnerRuntimeType | null => {
  for (const runtimeType of OWNER_RUNTIME_TYPES) {
    if (apiKeyHash === buildDefaultAgentApiKeyHash(ownerId, runtimeType)) {
      return runtimeType;
    }
  }
  return null;
};

export const ensureDefaultAgents = async (
  ownerId: string,
  deps: EnsureDefaultAgentsDependencies = defaultDeps
): Promise<DefaultOwnerAgentRecord[]> => {
  try {
    await syncAgentRuntimesFromHostProviders(ownerId);
  } catch (err) {
    console.warn('[DefaultOwnerAgents] sync before ensure failed:', (err as Error).message);
  }

  const [runtimes, existingAgents] = await Promise.all([
    deps.listOwnerRuntimeRecords(ownerId),
    deps.listDefaultOwnerAgentRecords(ownerId),
  ]);
  const runtimesByType = buildRuntimeMap(runtimes);
  const runtimesById = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const ensured: DefaultOwnerAgentRecord[] = [];

  for (const runtimeType of OWNER_RUNTIME_TYPES) {
    const runtime = runtimesByType.get(runtimeType) ?? null;
    const apiKeyHash = buildDefaultAgentApiKeyHash(ownerId, runtimeType);
    const existing = existingAgents.find((agent) => {
      return agent.apiKeyHash === apiKeyHash || Boolean(runtime?.id && agent.runtimeId === runtime.id);
    });
    const config = DEFAULT_AGENT_CONFIGS[runtimeType];

    if (existing) {
      let agent = existing;
      if (runtime?.id) {
        const linked = agent.runtimeId ? runtimesById.get(agent.runtimeId) ?? null : null;
        const shouldRelink =
          agent.runtimeId !== runtime.id
          || (linked?.runtimeStatus !== 'online' && runtime.runtimeStatus === 'online');
        if (shouldRelink) {
          agent = await deps.updateDefaultOwnerAgentRuntime({
            agentId: existing.id,
            ownerId,
            runtimeId: runtime.id,
          });
        }
      }

      if (config.avatarUrl && agent.avatarUrl !== config.avatarUrl) {
        agent = await deps.updateDefaultOwnerAgentAvatar({
          agentId: agent.id,
          ownerId,
          avatarUrl: config.avatarUrl,
        });
      }

      await deps.upsertDefaultOwnerAgentBinding({
        agentId: agent.id,
        ownerId,
        provider: runtimeType,
        hostId: runtime?.hostId ?? null,
        executionMode: config.executionMode,
      });

      ensured.push({ ...agent, runtimeType });
      continue;
    }

    const created = await deps.createDefaultOwnerAgentRecord({
      ownerId,
      runtimeType,
      runtimeId: runtime?.id ?? null,
      apiKeyHash,
      name: config.name,
      avatarUrl: config.avatarUrl,
      description: config.description,
      instructions: config.instructions,
      suggestedPrompts: config.suggestedPrompts,
      executionMode: config.executionMode,
    });

    await deps.upsertDefaultOwnerAgentBinding({
      agentId: created.id,
      ownerId,
      provider: runtimeType,
      hostId: runtime?.hostId ?? null,
      executionMode: config.executionMode,
    });

    ensured.push({ ...created, runtimeType });
  }

  return ensured;
};

export const getOwnerRuntimeOverview = async (
  ownerId: string,
  options: { rescan?: boolean } = {}
): Promise<OwnerRuntimesResponse> => {
  if (options.rescan) {
    await syncAgentRuntimesFromHostProviders(ownerId);
  }

  const [runtimes, defaultAgents] = await Promise.all([
    listAgentRuntimes({ ownerId }),
    ensureDefaultAgents(ownerId),
  ]);

  return buildOwnerRuntimesResponse(runtimes, defaultAgents);
};

export const buildOwnerRuntimesResponse = (
  runtimes: DefaultOwnerRuntimeRecord[],
  defaultAgents: DefaultOwnerAgentRecord[]
): OwnerRuntimesResponse => {
  const runtimesByType = buildRuntimeMap(runtimes);
  const agentsByType = new Map(
    defaultAgents.flatMap((agent) => (agent.runtimeType ? [[agent.runtimeType, agent]] : []))
  );

  const data = OWNER_RUNTIME_TYPES.map((runtimeType): OwnerRuntime => {
    const runtime = runtimesByType.get(runtimeType) ?? null;
    return {
      id: runtime?.id ?? null,
      runtime_type: runtimeType,
      display_name: runtime?.displayName ?? RUNTIME_DISPLAY_NAMES[runtimeType],
      runtime_status: mapRuntimeStatus(runtime?.runtimeStatus),
      status_reason: runtime?.statusReason ?? null,
      version: runtime?.version ?? null,
      capabilities: runtime?.capabilities ?? {},
      last_seen_at: runtime?.lastSeenAt ?? null,
      install_hint: RUNTIME_INSTALL_HINTS[runtimeType],
      default_agent: mapDefaultAgent(agentsByType.get(runtimeType) ?? null),
    };
  });

  return {
    data,
    meta: {
      total: data.length,
      online_count: data.filter((runtime) => runtime.runtime_status === 'online').length,
    },
  };
};

const buildRuntimeMap = (
  runtimes: DefaultOwnerRuntimeRecord[]
): Map<OwnerRuntimeType, DefaultOwnerRuntimeRecord> => {
  const runtimesByType = new Map<OwnerRuntimeType, DefaultOwnerRuntimeRecord>();
  for (const runtime of runtimes) {
    if (!isOwnerRuntimeType(runtime.runtimeType)) {
      continue;
    }

    const current = runtimesByType.get(runtime.runtimeType);
    if (!current || (current.runtimeStatus !== 'online' && runtime.runtimeStatus === 'online')) {
      runtimesByType.set(runtime.runtimeType, runtime);
    }
  }
  return runtimesByType;
};

const mapRuntimeStatus = (
  status: DefaultOwnerRuntimeRecord['runtimeStatus'] | undefined
): OwnerRuntimeStatus => {
  return status ?? 'not_installed';
};

const mapDefaultAgent = (
  agent: DefaultOwnerAgentRecord | null
): OwnerRuntimeDefaultAgent | null => {
  if (!agent) {
    return null;
  }

  return {
    id: agent.id,
    name: agent.name,
    avatar_url: agent.avatarUrl,
    status: agent.status,
    is_default: agent.isDefault,
    source: agent.source,
  };
};

const isOwnerRuntimeType = (runtimeType: string): runtimeType is OwnerRuntimeType => {
  return OWNER_RUNTIME_TYPES.includes(runtimeType as OwnerRuntimeType);
};
