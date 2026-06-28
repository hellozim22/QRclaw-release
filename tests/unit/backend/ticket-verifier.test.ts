import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRedis } from '../../mocks/redis';

/**
 * Ticket Verifier Unit Tests
 *
 * Tests the WS ticket verification logic per §P7.6:
 * - Tickets are stored in Redis as `ws_ticket:<ticket>` with 30s TTL
 * - Tickets are single-use (GETDEL atomic operation)
 * - Ticket format must start with `ws_` prefix
 * - Payload contains role-specific fields
 *
 * Import path matches planned backend structure:
 *   gateway/src/ws/auth → verifyWSTicket function
 */

// The backend teammate will implement this module.
// For now, we define the expected interface via tests.
// import { verifyWSTicket } from '../../../gateway/src/ws/auth';

// ─── Types (expected interface) ─────────────────────────────────────

interface TicketPayloadVisitor {
  role: 'visitor';
  sessionToken: string;
  agentId: string;
  qrCodeId: string;
  ownerId: string;
}

interface TicketPayloadAgent {
  role: 'agent';
  agentId: string;
  ownerId: string;
}

type TicketPayload = TicketPayloadVisitor | TicketPayloadAgent;

interface TicketVerifyResult {
  valid: true;
  payload: TicketPayload;
}

interface TicketVerifyFailure {
  valid: false;
  closeCode: number;
  reason: string;
}

type VerifyResult = TicketVerifyResult | TicketVerifyFailure;

// ─── Mock verifyWSTicket (TDD: implementation doesn't exist yet) ────

const verifyWSTicket = async (
  ticket: string,
  redis: ReturnType<typeof createMockRedis>
): Promise<VerifyResult> => {
  // Stub: will be replaced by real import once backend implements
  // For now, implement minimal logic matching the spec so tests validate structure

  if (!ticket || typeof ticket !== 'string') {
    return { valid: false, closeCode: 4001, reason: 'missing_ticket' };
  }

  if (!ticket.startsWith('ws_')) {
    return { valid: false, closeCode: 4001, reason: 'invalid_ticket_format' };
  }

  const key = `ws_ticket:${ticket}`;
  const raw = await redis.get(key);

  if (!raw) {
    return { valid: false, closeCode: 4003, reason: 'invalid_ticket' };
  }

  // Atomic consume — delete after read
  await redis.del(key);

  try {
    const payload = JSON.parse(raw) as TicketPayload;

    if (!payload.role) {
      return { valid: false, closeCode: 4001, reason: 'missing_required_fields' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, closeCode: 4001, reason: 'malformed_ticket_payload' };
  }
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('verifyWSTicket', () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
    vi.restoreAllMocks();
  });

  // A1: Valid visitor ticket
  it('valid visitor ticket → returns { role: "visitor", sessionToken, agentId }', async () => {
    const visitorPayload: TicketPayloadVisitor = {
      role: 'visitor',
      sessionToken: 'sess_abc123',
      agentId: 'agent-001',
      qrCodeId: 'qr-001',
      ownerId: 'owner-001',
    };
    await redis.setex('ws_ticket:ws_visitor_test', 30, JSON.stringify(visitorPayload));

    const result = await verifyWSTicket('ws_visitor_test', redis);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.role).toBe('visitor');
      expect((result.payload as TicketPayloadVisitor).sessionToken).toBe('sess_abc123');
      expect(result.payload.agentId).toBe('agent-001');
    }
  });

  // A1 variant: Valid agent ticket
  it('valid agent ticket → returns { role: "agent", agentId, ownerId }', async () => {
    const agentPayload: TicketPayloadAgent = {
      role: 'agent',
      agentId: 'agent-002',
      ownerId: 'owner-002',
    };
    await redis.setex('ws_ticket:ws_agent_test', 30, JSON.stringify(agentPayload));

    const result = await verifyWSTicket('ws_agent_test', redis);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.role).toBe('agent');
      expect(result.payload.agentId).toBe('agent-002');
      expect((result.payload as TicketPayloadAgent).ownerId).toBe('owner-002');
    }
  });

  // A3: Expired ticket (TTL expired → not in Redis)
  it('expired ticket → rejects with close code 4003', async () => {
    // Don't set anything in Redis — simulates expired TTL
    const result = await verifyWSTicket('ws_expired_ticket', redis);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.closeCode).toBe(4003);
      expect(result.reason).toBe('invalid_ticket');
    }
  });

  // A4: Malformed ticket (bad JSON payload in Redis)
  it('malformed ticket payload → rejects with close code 4001', async () => {
    await redis.setex('ws_ticket:ws_bad_json', 30, '{not valid json!!!');

    const result = await verifyWSTicket('ws_bad_json', redis);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.closeCode).toBe(4001);
    }
  });

  // A4 variant: Missing ticket (empty string)
  it('missing ticket (empty string) → rejects with close code 4001', async () => {
    const result = await verifyWSTicket('', redis);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.closeCode).toBe(4001);
      expect(result.reason).toBe('missing_ticket');
    }
  });

  // A5: Wrong prefix
  it('ticket without ws_ prefix → rejects with close code 4001', async () => {
    await redis.setex('ws_ticket:invalid_prefix', 30, JSON.stringify({ role: 'visitor' }));

    const result = await verifyWSTicket('invalid_prefix', redis);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.closeCode).toBe(4001);
    }
  });

  // A2: Ticket replay attack (single-use enforcement)
  it('ticket consumed on first use → second use fails', async () => {
    const payload: TicketPayloadAgent = {
      role: 'agent',
      agentId: 'agent-003',
      ownerId: 'owner-003',
    };
    await redis.setex('ws_ticket:ws_replay', 30, JSON.stringify(payload));

    const first = await verifyWSTicket('ws_replay', redis);
    expect(first.valid).toBe(true);

    const second = await verifyWSTicket('ws_replay', redis);
    expect(second.valid).toBe(false);
    if (!second.valid) {
      expect(second.closeCode).toBe(4003);
    }
  });

  // Ticket with missing required fields
  it('ticket with missing required fields → rejects', async () => {
    // Payload without 'role' field
    await redis.setex('ws_ticket:ws_no_role', 30, JSON.stringify({ agentId: 'agent-x' }));

    const result = await verifyWSTicket('ws_no_role', redis);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.closeCode).toBe(4001);
    }
  });
});
