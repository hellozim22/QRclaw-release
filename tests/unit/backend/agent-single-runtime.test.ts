/**
 * Unit tests for "one runtime per agent_id" enforcement.
 *
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getAgentConnectionIds,
  getAgentConnections,
  registerConnection,
  unregisterConnection,
} from '../../../gateway/src/ws/registry.js';

const createMockWebSocket = () => {
  return {
    close: (() => {}) as unknown as (code?: number, reason?: string) => void,
    readyState: 1,
    OPEN: 1,
    bufferedAmount: 0,
    send: (() => {}) as unknown as (data: string) => void,
  };
};

describe('agent runtime singleton rule', () => {
  beforeEach(() => {
    for (const connectionId of getAgentConnectionIds('agent-123')) {
      unregisterConnection(connectionId);
    }
  });

  it('keeps only the newest runtime for the same agent_id', () => {
    const ws1 = createMockWebSocket();
    registerConnection(ws1 as never, {
      connectionId: 'conn-1',
      role: 'agent',
      agentId: 'agent-123',
      connectedAt: new Date().toISOString(),
    });

    const ws2 = createMockWebSocket();
    registerConnection(ws2 as never, {
      connectionId: 'conn-2',
      role: 'agent',
      agentId: 'agent-123',
      connectedAt: new Date().toISOString(),
    });

    const activeIds = getAgentConnectionIds('agent-123');
    expect(activeIds).toEqual(['conn-1', 'conn-2']);

    unregisterConnection('conn-1');

    const remaining = getAgentConnections('agent-123');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.info.connectionId).toBe('conn-2');
  });
});
