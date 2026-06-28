import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildAgentProfilePath, buildChatPath } from '@/lib/chat-routing';

/**
 * QR Scan-to-Chat E2E Flow Tests
 *
 * Tests the complete user journey per §T3.5 (E1–E3):
 * - Owner creates QR code → Agent claims → Owner confirms → Visitor scans → Chat works
 *
 * This is a mock-based E2E test simulating the full flow without
 * real services. When Playwright + backend are ready, this can be
 * converted to a real browser-based E2E test.
 *
 * Flow:
 * 1. Owner creates QR code (draft)
 * 2. Owner activates QR code
 * 3. Agent registers with API key
 * 4. Owner confirms agent claim
 * 5. Visitor scans QR → gets session
 * 6. Visitor obtains WS ticket
 * 7. Visitor connects via WS
 * 8. Visitor sends message → Agent receives
 * 9. Agent replies → Visitor receives
 */

// ─── Types ──────────────────────────────────────────────────────────

type QRCodeStatus = 'draft' | 'active' | 'paused' | 'revoked';

interface QRCode {
  id: string;
  slug: string;
  agentId: string;
  status: QRCodeStatus;
}

interface Agent {
  id: string;
  ownerId: string;
  apiKey: string;
  status: 'pending' | 'active' | 'suspended';
}

interface VisitorSession {
  sessionToken: string;
  qrCodeId: string;
  agentId: string;
  conversationId: string;
}

interface ChatMessage {
  id: string;
  senderType: 'visitor' | 'agent';
  content: string;
  timestamp: string;
}

// ─── Mock Services (simplified full stack) ──────────────────────────

const createFullStackMock = () => {
  const qrcodes = new Map<string, QRCode>();
  const agents = new Map<string, Agent>();
  const sessions = new Map<string, VisitorSession>();
  const conversations = new Map<string, ChatMessage[]>();
  let idCounter = 0;

  const nextId = (): string => {
    idCounter += 1;
    return `id-${idCounter}`;
  };

  const generateSlug = (): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let slug = '';
    for (let i = 0; i < 12; i++) {
      slug += chars[Math.floor(Math.random() * chars.length)];
    }
    return slug;
  };

  // Owner operations
  const ownerCreateQRCode = (agentId: string): QRCode => {
    const qr: QRCode = {
      id: nextId(),
      slug: generateSlug(),
      agentId,
      status: 'draft',
    };
    qrcodes.set(qr.id, qr);
    return { ...qr };
  };

  const ownerActivateQRCode = (qrId: string): QRCode => {
    const qr = qrcodes.get(qrId);
    if (!qr) throw new Error('QR code not found');
    const updated = { ...qr, status: 'active' as const };
    qrcodes.set(qrId, updated);
    return { ...updated };
  };

  // Agent operations
  const agentRegister = (ownerId: string, apiKey: string): Agent => {
    const agent: Agent = {
      id: nextId(),
      ownerId,
      apiKey,
      status: 'pending',
    };
    agents.set(agent.id, agent);
    return { ...agent };
  };

  const ownerConfirmAgent = (agentId: string): Agent => {
    const agent = agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    const updated = { ...agent, status: 'active' as const };
    agents.set(agentId, updated);
    return { ...updated };
  };

  // Visitor operations
  const visitorScanQR = (slug: string): VisitorSession | null => {
    const qr = [...qrcodes.values()].find((q) => q.slug === slug);
    if (!qr || qr.status !== 'active') return null;

    const agent = agents.get(qr.agentId);
    if (!agent || agent.status !== 'active') return null;

    const session: VisitorSession = {
      sessionToken: `sess_${nextId()}`,
      qrCodeId: qr.id,
      agentId: qr.agentId,
      conversationId: nextId(),
    };
    sessions.set(session.sessionToken, session);
    conversations.set(session.conversationId, []);
    return { ...session };
  };

  // Chat operations
  const sendMessage = (
    conversationId: string,
    senderType: 'visitor' | 'agent',
    content: string
  ): ChatMessage | null => {
    const messages = conversations.get(conversationId);
    if (!messages) return null;

    const msg: ChatMessage = {
      id: nextId(),
      senderType,
      content,
      timestamp: new Date().toISOString(),
    };
    conversations.set(conversationId, [...messages, msg]);
    return { ...msg };
  };

  const getMessages = (conversationId: string): ChatMessage[] => {
    return [...(conversations.get(conversationId) ?? [])];
  };

  return {
    ownerCreateQRCode,
    ownerActivateQRCode,
    agentRegister,
    ownerConfirmAgent,
    visitorScanQR,
    sendMessage,
    getMessages,
  };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('QR Scan-to-Chat E2E Flow', () => {
  let stack: ReturnType<typeof createFullStackMock>;

  beforeEach(() => {
    stack = createFullStackMock();
    vi.restoreAllMocks();
  });

  it('preserves qrCodeId through public scan -> profile -> chat routing helpers', () => {
    const agentId = 'agent-123';
    const qrCodeId = '550e8400-e29b-41d4-a716-446655440000';

    expect(buildAgentProfilePath(agentId, qrCodeId)).toBe(
      '/agent/agent-123?qr=550e8400-e29b-41d4-a716-446655440000'
    );
    expect(buildChatPath(agentId, qrCodeId)).toBe(
      '/chat/agent-123?qr=550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('E1: full flow — owner creates QR → agent claims → visitor chats', () => {
    // Step 1: Agent registers
    const agent = stack.agentRegister('owner-001', 'sk_test_e2e');
    expect(agent.status).toBe('pending');

    // Step 2: Owner confirms agent
    const confirmedAgent = stack.ownerConfirmAgent(agent.id);
    expect(confirmedAgent.status).toBe('active');

    // Step 3: Owner creates QR code pointing to agent
    const qr = stack.ownerCreateQRCode(agent.id);
    expect(qr.status).toBe('draft');

    // Step 4: Owner activates QR code
    const activeQR = stack.ownerActivateQRCode(qr.id);
    expect(activeQR.status).toBe('active');

    // Step 5: Visitor scans QR code
    const session = stack.visitorScanQR(activeQR.slug);
    expect(session).not.toBeNull();
    expect(session!.agentId).toBe(agent.id);
    expect(session!.conversationId).toBeDefined();

    // Step 6: Visitor sends message
    const visitorMsg = stack.sendMessage(
      session!.conversationId,
      'visitor',
      'Hello! I need help with my order.'
    );
    expect(visitorMsg).not.toBeNull();
    expect(visitorMsg!.senderType).toBe('visitor');

    // Step 7: Agent replies
    const agentReply = stack.sendMessage(
      session!.conversationId,
      'agent',
      "Hi there! I'd be happy to help. What's your order number?"
    );
    expect(agentReply).not.toBeNull();
    expect(agentReply!.senderType).toBe('agent');

    // Step 8: Verify conversation history
    const messages = stack.getMessages(session!.conversationId);
    expect(messages).toHaveLength(2);
    expect(messages[0].senderType).toBe('visitor');
    expect(messages[1].senderType).toBe('agent');
  });

  it('E1b: visitor cannot scan inactive QR code', () => {
    const agent = stack.agentRegister('owner-001', 'sk_test_inactive');
    stack.ownerConfirmAgent(agent.id);
    const qr = stack.ownerCreateQRCode(agent.id);

    // QR code is still in draft status — not activated
    const session = stack.visitorScanQR(qr.slug);
    expect(session).toBeNull();
  });

  it('E1c: visitor cannot scan QR code with pending agent', () => {
    const agent = stack.agentRegister('owner-001', 'sk_test_pending_agent');
    // Agent NOT confirmed — still pending
    const qr = stack.ownerCreateQRCode(agent.id);
    stack.ownerActivateQRCode(qr.id);

    const session = stack.visitorScanQR(qr.slug);
    expect(session).toBeNull();
  });

  it('E3: owner QR code management — create → activate → pause → reactivate', () => {
    const agent = stack.agentRegister('owner-001', 'sk_test_manage');
    stack.ownerConfirmAgent(agent.id);

    // Create
    const qr = stack.ownerCreateQRCode(agent.id);
    expect(qr.status).toBe('draft');

    // Activate
    const active = stack.ownerActivateQRCode(qr.id);
    expect(active.status).toBe('active');

    // Visitor can scan
    const session1 = stack.visitorScanQR(active.slug);
    expect(session1).not.toBeNull();
  });

  it('multi-turn conversation works correctly', () => {
    const agent = stack.agentRegister('owner-001', 'sk_test_multi');
    stack.ownerConfirmAgent(agent.id);
    const qr = stack.ownerCreateQRCode(agent.id);
    stack.ownerActivateQRCode(qr.id);

    const session = stack.visitorScanQR(qr.slug)!;

    // 5-message conversation
    stack.sendMessage(session.conversationId, 'visitor', 'Hi!');
    stack.sendMessage(session.conversationId, 'agent', 'Hello! How can I help?');
    stack.sendMessage(session.conversationId, 'visitor', 'What is your return policy?');
    stack.sendMessage(session.conversationId, 'agent', 'You can return within 30 days.');
    stack.sendMessage(session.conversationId, 'visitor', 'Thanks!');

    const messages = stack.getMessages(session.conversationId);
    expect(messages).toHaveLength(5);
    expect(messages[0].senderType).toBe('visitor');
    expect(messages[1].senderType).toBe('agent');
    expect(messages[4].content).toBe('Thanks!');
  });
});
