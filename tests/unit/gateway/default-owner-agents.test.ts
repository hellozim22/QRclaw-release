import { describe, expect, it, vi } from 'vitest';
import {
  buildOwnerRuntimesResponse,
  buildDefaultAgentApiKeyHash,
  ensureDefaultAgents,
} from '../../../gateway/src/services/default-owner-agents.js';
import type {
  DefaultOwnerAgentRecord,
  EnsureDefaultAgentsDependencies,
} from '../../../gateway/src/services/default-owner-agents.js';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const CLAUDE_RUNTIME_ID = '22222222-2222-4222-8222-222222222222';
const CURSOR_RUNTIME_ID = '33333333-3333-4333-8333-333333333333';

const existingAgent = (
  runtimeType: 'claude' | 'cursor',
  runtimeId: string | null
): DefaultOwnerAgentRecord => ({
  id: `agent-${runtimeType}`,
  ownerId: OWNER_ID,
  runtimeId,
  runtimeType,
  apiKeyHash: buildDefaultAgentApiKeyHash(OWNER_ID, runtimeType),
  name: runtimeType === 'claude' ? 'My renamed Claude' : 'Cursor Agent',
  avatarUrl: null,
  status: 'active',
  isDefault: true,
  source: 'system_default',
  createdAt: '2026-04-28T00:00:00.000Z',
});

describe('ensureDefaultAgents', () => {
  it('creates the missing default agents for all four Wave 10 runtimes', async () => {
    const created: DefaultOwnerAgentRecord[] = [];
    const deps: EnsureDefaultAgentsDependencies = {
      listOwnerRuntimeRecords: vi.fn().mockResolvedValue([
        {
          id: CLAUDE_RUNTIME_ID,
          ownerId: OWNER_ID,
          hostId: 'host-1',
          runtimeType: 'claude',
          displayName: 'Claude Code',
          runtimeStatus: 'online',
          statusReason: null,
          capabilities: {},
          version: '1.0.0',
          lastSeenAt: '2026-04-28T00:00:00.000Z',
        },
      ]),
      listDefaultOwnerAgentRecords: vi.fn().mockResolvedValue([]),
      createDefaultOwnerAgentRecord: vi.fn(async (input) => {
        const row: DefaultOwnerAgentRecord = {
          id: `created-${input.runtimeType}`,
          ownerId: input.ownerId,
          runtimeId: input.runtimeId,
          apiKeyHash: input.apiKeyHash,
          name: input.name,
          avatarUrl: null,
          status: 'active',
          isDefault: true,
          source: 'system_default',
          createdAt: '2026-04-28T00:00:00.000Z',
        };
        created.push(row);
        return row;
      }),
      updateDefaultOwnerAgentRuntime: vi.fn(),
    };

    const result = await ensureDefaultAgents(OWNER_ID, deps);

    expect(deps.createDefaultOwnerAgentRecord).toHaveBeenCalledTimes(4);
    expect(created.map((agent) => agent.runtimeId)).toContain(CLAUDE_RUNTIME_ID);
    expect(result.map((agent) => agent.runtimeType)).toEqual([
      'openclaw',
      'claude',
      'cursor',
      'codex',
    ]);
  });

  it('does not overwrite an existing renamed default agent', async () => {
    const claudeAgent = existingAgent('claude', CLAUDE_RUNTIME_ID);
    const deps: EnsureDefaultAgentsDependencies = {
      listOwnerRuntimeRecords: vi.fn().mockResolvedValue([
        {
          id: CLAUDE_RUNTIME_ID,
          ownerId: OWNER_ID,
          hostId: 'host-1',
          runtimeType: 'claude',
          displayName: 'Claude Code',
          runtimeStatus: 'online',
          statusReason: null,
          capabilities: {},
          version: null,
          lastSeenAt: null,
        },
      ]),
      listDefaultOwnerAgentRecords: vi.fn().mockResolvedValue([claudeAgent]),
      createDefaultOwnerAgentRecord: vi.fn(async (input) => ({
        id: `created-${input.runtimeType}`,
        ownerId: input.ownerId,
        runtimeId: input.runtimeId,
        apiKeyHash: input.apiKeyHash,
        name: input.name,
        avatarUrl: null,
        status: 'active',
        isDefault: true,
        source: 'system_default',
        createdAt: '2026-04-28T00:00:00.000Z',
      })),
      updateDefaultOwnerAgentRuntime: vi.fn(),
    };

    const result = await ensureDefaultAgents(OWNER_ID, deps);
    const claude = result.find((agent) => agent.runtimeType === 'claude');

    expect(claude?.name).toBe('My renamed Claude');
    expect(deps.updateDefaultOwnerAgentRuntime).not.toHaveBeenCalled();
  });

  it('only backfills runtime_id on an existing default agent when the runtime appears later', async () => {
    const cursorAgent = existingAgent('cursor', null);
    const deps: EnsureDefaultAgentsDependencies = {
      listOwnerRuntimeRecords: vi.fn().mockResolvedValue([
        {
          id: CURSOR_RUNTIME_ID,
          ownerId: OWNER_ID,
          hostId: 'host-2',
          runtimeType: 'cursor',
          displayName: 'Cursor Agent',
          runtimeStatus: 'online',
          statusReason: null,
          capabilities: {},
          version: null,
          lastSeenAt: null,
        },
      ]),
      listDefaultOwnerAgentRecords: vi.fn().mockResolvedValue([cursorAgent]),
      createDefaultOwnerAgentRecord: vi.fn(async (input) => ({
        id: `created-${input.runtimeType}`,
        ownerId: input.ownerId,
        runtimeId: input.runtimeId,
        apiKeyHash: input.apiKeyHash,
        name: input.name,
        avatarUrl: null,
        status: 'active',
        isDefault: true,
        source: 'system_default',
        createdAt: '2026-04-28T00:00:00.000Z',
      })),
      updateDefaultOwnerAgentRuntime: vi.fn(async (input) => ({
        ...cursorAgent,
        runtimeId: input.runtimeId,
      })),
    };

    const result = await ensureDefaultAgents(OWNER_ID, deps);

    expect(deps.updateDefaultOwnerAgentRuntime).toHaveBeenCalledWith({
      agentId: 'agent-cursor',
      ownerId: OWNER_ID,
      runtimeId: CURSOR_RUNTIME_ID,
    });
    expect(result.find((agent) => agent.runtimeType === 'cursor')?.runtimeId).toBe(
      CURSOR_RUNTIME_ID
    );
  });
});

describe('buildOwnerRuntimesResponse', () => {
  it('returns fixed runtime slots with runtime display names when no host is connected', () => {
    const response = buildOwnerRuntimesResponse([], []);

    expect(response.data.map((runtime) => runtime.display_name)).toEqual([
      'OpenClaw',
      'Claude Code',
      'Cursor',
      'Codex',
    ]);
    expect(response.data.every((runtime) => runtime.runtime_status === 'not_installed')).toBe(true);
    expect(response.meta).toEqual({ total: 4, online_count: 0 });
  });
});
