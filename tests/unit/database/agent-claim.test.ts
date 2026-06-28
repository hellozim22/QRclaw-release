import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Agent Claim Unit Tests
 *
 * Tests agent registration and owner claim flow per §9 agents table:
 * - Agent registers via API key → status pending
 * - Owner confirms claim → status active
 * - Duplicate claim → rejected
 * - Invalid API key → 401 error
 *
 * Agent lifecycle: register (pending) → owner confirms (active) → suspended
 */

// ─── Types (per §9 agents table) ───────────────────────────────────

type AgentStatus = 'pending' | 'active' | 'suspended';

interface Agent {
  id: string;
  ownerId: string;
  name: string;
  apiKeyHash: string;
  status: AgentStatus;
  wsConnected: boolean;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface RegisterInput {
  ownerId: string;
  name: string;
  apiKey: string;
}

interface ClaimResult {
  success: boolean;
  agent?: Agent;
  error?: { code: string; message: string };
}

// ─── Mock Agent Claim Service ───────────────────────────────────────

const hashApiKey = (apiKey: string): string => {
  // Simplified hash for testing (real impl uses bcrypt/argon2)
  return `hashed_${apiKey}`;
};

const createAgentClaimService = () => {
  const agents = new Map<string, Agent>();
  const apiKeyIndex = new Map<string, string>(); // hash → agentId

  const register = (input: RegisterInput): ClaimResult => {
    if (!input.apiKey || !input.apiKey.startsWith('sk_')) {
      return {
        success: false,
        error: { code: 'unauthorized', message: 'Invalid API key format' },
      };
    }

    const keyHash = hashApiKey(input.apiKey);

    // Check for duplicate
    if (apiKeyIndex.has(keyHash)) {
      return {
        success: false,
        error: { code: 'duplicate_claim', message: 'API key already registered' },
      };
    }

    const now = new Date().toISOString();
    const agent: Agent = {
      id: `agent_${Date.now()}`,
      ownerId: input.ownerId,
      name: input.name,
      apiKeyHash: keyHash,
      status: 'pending',
      wsConnected: false,
      createdAt: now,
      updatedAt: now,
    };

    agents.set(agent.id, agent);
    apiKeyIndex.set(keyHash, agent.id);

    return { success: true, agent: { ...agent } };
  };

  const confirmClaim = (agentId: string, ownerId: string): ClaimResult => {
    const agent = agents.get(agentId);
    if (!agent) {
      return {
        success: false,
        error: { code: 'not_found', message: 'Agent not found' },
      };
    }

    if (agent.ownerId !== ownerId) {
      return {
        success: false,
        error: { code: 'forbidden', message: 'Not the owner of this agent' },
      };
    }

    if (agent.status !== 'pending') {
      return {
        success: false,
        error: { code: 'invalid_state', message: `Agent is already ${agent.status}` },
      };
    }

    const updated: Agent = {
      ...agent,
      status: 'active',
      updatedAt: new Date().toISOString(),
    };
    agents.set(agentId, updated);

    return { success: true, agent: { ...updated } };
  };

  const verifyApiKey = (apiKey: string): ClaimResult => {
    if (!apiKey || !apiKey.startsWith('sk_')) {
      return {
        success: false,
        error: { code: 'unauthorized', message: 'Invalid API key' },
      };
    }

    const keyHash = hashApiKey(apiKey);
    const agentId = apiKeyIndex.get(keyHash);
    if (!agentId) {
      return {
        success: false,
        error: { code: 'unauthorized', message: 'API key not found' },
      };
    }

    const agent = agents.get(agentId);
    if (!agent || agent.status !== 'active') {
      return {
        success: false,
        error: { code: 'unauthorized', message: 'Agent not active' },
      };
    }

    return { success: true, agent: { ...agent } };
  };

  return { register, confirmClaim, verifyApiKey, _agents: agents };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('Agent Claim', () => {
  let service: ReturnType<typeof createAgentClaimService>;

  beforeEach(() => {
    service = createAgentClaimService();
    vi.restoreAllMocks();
  });

  it('agent registers via API key → status pending', () => {
    const result = service.register({
      ownerId: 'owner-001',
      name: 'Support Bot',
      apiKey: 'sk_test_abc123',
    });

    expect(result.success).toBe(true);
    expect(result.agent).toBeDefined();
    expect(result.agent!.status).toBe('pending');
    expect(result.agent!.name).toBe('Support Bot');
    expect(result.agent!.ownerId).toBe('owner-001');
    expect(result.agent!.wsConnected).toBe(false);
  });

  it('owner confirms claim → status active', () => {
    const reg = service.register({
      ownerId: 'owner-001',
      name: 'Support Bot',
      apiKey: 'sk_test_confirm',
    });

    const confirm = service.confirmClaim(reg.agent!.id, 'owner-001');

    expect(confirm.success).toBe(true);
    expect(confirm.agent!.status).toBe('active');
  });

  it('duplicate claim → rejected', () => {
    service.register({
      ownerId: 'owner-001',
      name: 'Bot 1',
      apiKey: 'sk_test_dup',
    });

    const duplicate = service.register({
      ownerId: 'owner-001',
      name: 'Bot 2',
      apiKey: 'sk_test_dup',
    });

    expect(duplicate.success).toBe(false);
    expect(duplicate.error!.code).toBe('duplicate_claim');
  });

  it('invalid API key → 401 error', () => {
    const result = service.register({
      ownerId: 'owner-001',
      name: 'Bad Bot',
      apiKey: 'invalid_key_no_prefix',
    });

    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('unauthorized');
  });

  it('verify API key for active agent → success', () => {
    const reg = service.register({
      ownerId: 'owner-001',
      name: 'Active Bot',
      apiKey: 'sk_test_verify',
    });
    service.confirmClaim(reg.agent!.id, 'owner-001');

    const verify = service.verifyApiKey('sk_test_verify');
    expect(verify.success).toBe(true);
    expect(verify.agent!.status).toBe('active');
  });

  it('verify API key for pending agent → rejected', () => {
    service.register({
      ownerId: 'owner-001',
      name: 'Pending Bot',
      apiKey: 'sk_test_pending',
    });

    const verify = service.verifyApiKey('sk_test_pending');
    expect(verify.success).toBe(false);
    expect(verify.error!.code).toBe('unauthorized');
  });

  it('wrong owner cannot confirm claim', () => {
    const reg = service.register({
      ownerId: 'owner-001',
      name: 'My Bot',
      apiKey: 'sk_test_wrong_owner',
    });

    const result = service.confirmClaim(reg.agent!.id, 'owner-999');
    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('forbidden');
  });

  it('double confirmation → rejected (already active)', () => {
    const reg = service.register({
      ownerId: 'owner-001',
      name: 'Bot',
      apiKey: 'sk_test_double',
    });
    service.confirmClaim(reg.agent!.id, 'owner-001');

    const second = service.confirmClaim(reg.agent!.id, 'owner-001');
    expect(second.success).toBe(false);
    expect(second.error!.code).toBe('invalid_state');
  });
});
