import { describe, expect, it } from 'vitest';
import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';
import { getAgentDisplayName, getProviderDisplayName } from './agent-display';

const makeAgent = (patch: Partial<OwnerAgentSummary>): OwnerAgentSummary => ({
  id: 'agent-1',
  name: 'OpenClaw Assistant',
  avatar_url: null,
  description: null,
  backend_provider: 'openclaw',
  backend_source: 'local',
  execution_mode: 'standard',
  status: 'active',
  runtime_id: null,
  runtime_status: 'online',
  is_default: true,
  source: 'system_default',
  last_active_at: null,
  created_at: '2026-06-23T00:00:00.000Z',
  ...patch,
});

describe('agent display helpers', () => {
  it('maps default providers to product names', () => {
    expect(getProviderDisplayName('openclaw')).toBe('OpenClaw');
    expect(getProviderDisplayName('claude')).toBe('Claude Code');
    expect(getProviderDisplayName('cursor')).toBe('Cursor');
    expect(getProviderDisplayName('codex')).toBe('Codex');
  });

  it('uses provider names for system default agents', () => {
    expect(getAgentDisplayName(makeAgent({ backend_provider: 'openclaw' }))).toBe('OpenClaw');
    expect(getAgentDisplayName(makeAgent({ backend_provider: 'claude' }))).toBe('Claude Code');
    expect(getAgentDisplayName(makeAgent({ backend_provider: 'cursor' }))).toBe('Cursor');
    expect(getAgentDisplayName(makeAgent({ backend_provider: 'codex' }))).toBe('Codex');
  });

  it('keeps custom names for user-created agents', () => {
    const agent = makeAgent({
      name: '我的写作 Agent',
      is_default: false,
      source: 'owner_created',
    });

    expect(getAgentDisplayName(agent)).toBe('我的写作 Agent');
  });
});
