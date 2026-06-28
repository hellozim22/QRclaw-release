import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';

/**
 * Full-Chain Integration Test (Phase 6)
 *
 * Tests the complete QRClaw lifecycle per §T3.5 (E1–E3):
 *   register owner → create QR → agent claims → owner confirms →
 *   visitor scans → chat with streaming → owner reads messages in dashboard
 *
 * Mock-based: simulates all services in-memory.
 * When gateway/ and web/ are ready, convert to real integration tests.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface Owner {
  id: string;
  email: string;
  sessionToken: string;
}

interface QRCode {
  id: string;
  slug: string;
  ownerId: string;
  agentId: string | null;
  status: 'draft' | 'active' | 'paused' | 'revoked';
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface Agent {
  id: string;
  ownerId: string;
  name: string;
  apiKey: string;
  status: 'pending' | 'active' | 'suspended';
  confirmedAt: string | null;
}

interface VisitorSession {
  sessionId: string;
  sessionToken: string;
  qrcodeId: string;
}

interface Conversation {
  id: string;
  qrcodeId: string;
  visitorSessionId: string;
  agentId: string;
  status: 'active' | 'closed';
  createdAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderType: 'visitor' | 'agent';
  content: string;
  contentEncrypted: boolean;
  clientMsgId: string;
  timestamp: string;
}

interface StreamChunk {
  type: 'stream_chunk' | 'stream_end';
  content: string;
  conversationId: string;
  messageId: string;
}

interface DashboardStats {
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  activeAgents: number;
  qrCodes: number;
}

// ─── Mock Platform ──────────────────────────────────────────────────

const createPlatform = () => {
  const owners = new Map<string, Owner>();
  const qrcodes = new Map<string, QRCode>();
  const agents = new Map<string, Agent>();
  const conversations = new Map<string, Conversation>();
  const messages = new Map<string, Message>();
  const visitorSessions = new Map<string, VisitorSession>();
  const apiKeyIndex = new Map<string, string>();

  // ── Auth ──

  const registerOwner = (
    email: string,
    password: string
  ): { success: boolean; owner?: Owner; error?: string } => {
    if (!email.includes('@')) {
      return { success: false, error: 'invalid_email' };
    }
    if (password.length < 8) {
      return { success: false, error: 'weak_password' };
    }

    const existing = [...owners.values()].find((o) => o.email === email);
    if (existing) {
      return { success: false, error: 'email_taken' };
    }

    const owner: Owner = {
      id: randomUUID(),
      email,
      sessionToken: `sess_${randomUUID().replace(/-/g, '')}`,
    };
    owners.set(owner.id, owner);
    return { success: true, owner };
  };

  // ── QR Code ──

  const createQRCode = (
    ownerId: string,
    name: string,
    description: string
  ): { success: boolean; qrcode?: QRCode; error?: string } => {
    if (!owners.has(ownerId)) {
      return { success: false, error: 'unauthorized' };
    }

    const qrcode: QRCode = {
      id: randomUUID(),
      slug: `qr_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      ownerId,
      agentId: null,
      status: 'draft',
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    qrcodes.set(qrcode.id, qrcode);
    return { success: true, qrcode };
  };

  const activateQRCode = (
    qrcodeId: string,
    ownerId: string
  ): { success: boolean; error?: string } => {
    const qr = qrcodes.get(qrcodeId);
    if (!qr) return { success: false, error: 'not_found' };
    if (qr.ownerId !== ownerId) return { success: false, error: 'forbidden' };
    if (!qr.agentId) return { success: false, error: 'no_agent_assigned' };
    if (qr.status === 'revoked') return { success: false, error: 'terminal_state' };

    qrcodes.set(qrcodeId, { ...qr, status: 'active', updatedAt: new Date().toISOString() });
    return { success: true };
  };

  // ── Agent ──

  const claimAgent = (
    ownerId: string,
    name: string,
    apiKey: string
  ): { success: boolean; agent?: Agent; error?: string } => {
    if (!owners.has(ownerId)) {
      return { success: false, error: 'unauthorized' };
    }
    if (!apiKey.startsWith('sk_')) {
      return { success: false, error: 'invalid_api_key' };
    }
    if (apiKeyIndex.has(apiKey)) {
      return { success: false, error: 'duplicate_api_key' };
    }

    const agent: Agent = {
      id: randomUUID(),
      ownerId,
      name,
      apiKey,
      status: 'pending',
      confirmedAt: null,
    };
    agents.set(agent.id, agent);
    apiKeyIndex.set(apiKey, agent.id);
    return { success: true, agent };
  };

  const confirmAgent = (agentId: string, ownerId: string): { success: boolean; error?: string } => {
    const agent = agents.get(agentId);
    if (!agent) return { success: false, error: 'not_found' };
    if (agent.ownerId !== ownerId) return { success: false, error: 'forbidden' };
    if (agent.status !== 'pending') return { success: false, error: 'invalid_state' };

    agents.set(agentId, {
      ...agent,
      status: 'active',
      confirmedAt: new Date().toISOString(),
    });
    return { success: true };
  };

  const assignAgentToQR = (
    qrcodeId: string,
    agentId: string,
    ownerId: string
  ): { success: boolean; error?: string } => {
    const qr = qrcodes.get(qrcodeId);
    if (!qr) return { success: false, error: 'qr_not_found' };
    if (qr.ownerId !== ownerId) return { success: false, error: 'forbidden' };

    const agent = agents.get(agentId);
    if (!agent) return { success: false, error: 'agent_not_found' };
    if (agent.status !== 'active') return { success: false, error: 'agent_not_active' };

    qrcodes.set(qrcodeId, { ...qr, agentId, updatedAt: new Date().toISOString() });
    return { success: true };
  };

  // ── Visitor ──

  const scanQRCode = (
    slug: string
  ): { success: boolean; session?: VisitorSession; agentId?: string; error?: string } => {
    const qr = [...qrcodes.values()].find((q) => q.slug === slug);
    if (!qr) return { success: false, error: 'not_found' };
    if (qr.status !== 'active') return { success: false, error: 'qr_not_active' };
    if (!qr.agentId) return { success: false, error: 'no_agent' };

    const agent = agents.get(qr.agentId);
    if (!agent || agent.status !== 'active') {
      return { success: false, error: 'agent_unavailable' };
    }

    const session: VisitorSession = {
      sessionId: randomUUID(),
      sessionToken: `vsess_${randomUUID().replace(/-/g, '')}`,
      qrcodeId: qr.id,
    };
    visitorSessions.set(session.sessionId, session);
    return { success: true, session, agentId: qr.agentId };
  };

  // ── Chat ──

  const startConversation = (
    visitorSessionId: string,
    agentId: string
  ): { success: boolean; conversation?: Conversation; error?: string } => {
    const session = visitorSessions.get(visitorSessionId);
    if (!session) return { success: false, error: 'invalid_session' };

    const conv: Conversation = {
      id: randomUUID(),
      qrcodeId: session.qrcodeId,
      visitorSessionId,
      agentId,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    conversations.set(conv.id, conv);
    return { success: true, conversation: conv };
  };

  const sendMessage = (
    conversationId: string,
    senderType: 'visitor' | 'agent',
    content: string,
    clientMsgId: string
  ): { success: boolean; message?: Message; error?: string } => {
    const conv = conversations.get(conversationId);
    if (!conv) return { success: false, error: 'conversation_not_found' };
    if (conv.status !== 'active') return { success: false, error: 'conversation_closed' };

    // Dedup by clientMsgId
    const existing = [...messages.values()].find((m) => m.clientMsgId === clientMsgId);
    if (existing) return { success: true, message: existing };

    const msg: Message = {
      id: randomUUID(),
      conversationId,
      senderType,
      content,
      contentEncrypted: true,
      clientMsgId,
      timestamp: new Date().toISOString(),
    };
    messages.set(msg.id, msg);
    return { success: true, message: msg };
  };

  const simulateStreamResponse = (
    conversationId: string,
    chunks: string[]
  ): { streamChunks: StreamChunk[]; finalMessage: Message } => {
    const messageId = randomUUID();
    const streamChunks: StreamChunk[] = chunks.map((content) => ({
      type: 'stream_chunk' as const,
      content,
      conversationId,
      messageId,
    }));

    streamChunks.push({
      type: 'stream_end',
      content: chunks.join(''),
      conversationId,
      messageId,
    });

    const finalMessage: Message = {
      id: messageId,
      conversationId,
      senderType: 'agent',
      content: chunks.join(''),
      contentEncrypted: true,
      clientMsgId: `agent_${randomUUID().replace(/-/g, '')}`,
      timestamp: new Date().toISOString(),
    };
    messages.set(finalMessage.id, finalMessage);

    return { streamChunks, finalMessage };
  };

  // ── Dashboard ──

  const getDashboardStats = (ownerId: string): DashboardStats => {
    const ownerQRs = [...qrcodes.values()].filter((q) => q.ownerId === ownerId);
    const qrIds = new Set(ownerQRs.map((q) => q.id));
    const ownerConvs = [...conversations.values()].filter((c) => qrIds.has(c.qrcodeId));
    const convIds = new Set(ownerConvs.map((c) => c.id));
    const ownerMessages = [...messages.values()].filter((m) => convIds.has(m.conversationId));
    const ownerAgents = [...agents.values()].filter(
      (a) => a.ownerId === ownerId && a.status === 'active'
    );

    return {
      totalConversations: ownerConvs.length,
      activeConversations: ownerConvs.filter((c) => c.status === 'active').length,
      totalMessages: ownerMessages.length,
      activeAgents: ownerAgents.length,
      qrCodes: ownerQRs.length,
    };
  };

  const getConversationMessages = (
    conversationId: string,
    ownerId: string
  ): { success: boolean; messages?: Message[]; error?: string } => {
    const conv = conversations.get(conversationId);
    if (!conv) return { success: false, error: 'not_found' };

    const qr = qrcodes.get(conv.qrcodeId);
    if (!qr || qr.ownerId !== ownerId) return { success: false, error: 'forbidden' };

    const convMessages = [...messages.values()]
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return { success: true, messages: convMessages };
  };

  return {
    registerOwner,
    createQRCode,
    activateQRCode,
    claimAgent,
    confirmAgent,
    assignAgentToQR,
    scanQRCode,
    startConversation,
    sendMessage,
    simulateStreamResponse,
    getDashboardStats,
    getConversationMessages,
  };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('Full-Chain Integration: Complete Lifecycle', () => {
  let platform: ReturnType<typeof createPlatform>;

  beforeEach(() => {
    platform = createPlatform();
    vi.restoreAllMocks();
  });

  it('complete flow: register → QR → agent → scan → chat → dashboard', () => {
    // 1. Owner registers
    const regResult = platform.registerOwner('owner@example.com', 'securePass123');
    expect(regResult.success).toBe(true);
    const owner = regResult.owner!;

    // 2. Owner creates QR code
    const qrResult = platform.createQRCode(owner.id, 'Store QR', 'Support QR for our store');
    expect(qrResult.success).toBe(true);
    const qrcode = qrResult.qrcode!;
    expect(qrcode.status).toBe('draft');

    // 3. Agent claims
    const claimResult = platform.claimAgent(owner.id, 'Support Bot', 'sk_test_abc123');
    expect(claimResult.success).toBe(true);
    const agent = claimResult.agent!;
    expect(agent.status).toBe('pending');

    // 4. Owner confirms agent
    const confirmResult = platform.confirmAgent(agent.id, owner.id);
    expect(confirmResult.success).toBe(true);

    // 5. Assign agent to QR + activate
    const assignResult = platform.assignAgentToQR(qrcode.id, agent.id, owner.id);
    expect(assignResult.success).toBe(true);

    const activateResult = platform.activateQRCode(qrcode.id, owner.id);
    expect(activateResult.success).toBe(true);

    // 6. Visitor scans QR
    const scanResult = platform.scanQRCode(qrcode.slug);
    expect(scanResult.success).toBe(true);
    const visitorSession = scanResult.session!;

    // 7. Start conversation
    const convResult = platform.startConversation(visitorSession.sessionId, agent.id);
    expect(convResult.success).toBe(true);
    const conv = convResult.conversation!;

    // 8. Visitor sends message
    const msgResult = platform.sendMessage(conv.id, 'visitor', 'Hello!', 'client_msg_1');
    expect(msgResult.success).toBe(true);

    // 9. Agent replies with streaming
    const stream = platform.simulateStreamResponse(conv.id, ['Hi', '! How', ' can I help?']);
    expect(stream.streamChunks).toHaveLength(4); // 3 chunks + stream_end
    expect(stream.streamChunks[3].type).toBe('stream_end');
    expect(stream.finalMessage.content).toBe('Hi! How can I help?');

    // 10. Owner reads in dashboard
    const stats = platform.getDashboardStats(owner.id);
    expect(stats.totalConversations).toBe(1);
    expect(stats.activeConversations).toBe(1);
    expect(stats.totalMessages).toBe(2); // visitor + agent
    expect(stats.activeAgents).toBe(1);
    expect(stats.qrCodes).toBe(1);

    // 11. Owner reads conversation messages
    const msgList = platform.getConversationMessages(conv.id, owner.id);
    expect(msgList.success).toBe(true);
    expect(msgList.messages).toHaveLength(2);
    expect(msgList.messages![0].senderType).toBe('visitor');
    expect(msgList.messages![1].senderType).toBe('agent');
  });
});

describe('Full-Chain Integration: Error Paths', () => {
  let platform: ReturnType<typeof createPlatform>;

  beforeEach(() => {
    platform = createPlatform();
    vi.restoreAllMocks();
  });

  it('rejects duplicate owner registration', () => {
    platform.registerOwner('owner@example.com', 'securePass123');
    const dup = platform.registerOwner('owner@example.com', 'anotherPass123');
    expect(dup.success).toBe(false);
    expect(dup.error).toBe('email_taken');
  });

  it('prevents activation without agent assignment', () => {
    const reg = platform.registerOwner('owner@example.com', 'securePass123');
    const qr = platform.createQRCode(reg.owner!.id, 'Test QR', 'desc');
    const result = platform.activateQRCode(qr.qrcode!.id, reg.owner!.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('no_agent_assigned');
  });

  it('prevents scanning inactive QR code', () => {
    const reg = platform.registerOwner('owner@example.com', 'securePass123');
    const qr = platform.createQRCode(reg.owner!.id, 'Test QR', 'desc');
    const scan = platform.scanQRCode(qr.qrcode!.slug);
    expect(scan.success).toBe(false);
    expect(scan.error).toBe('qr_not_active');
  });

  it('prevents agent claim with invalid API key', () => {
    const reg = platform.registerOwner('owner@example.com', 'securePass123');
    const result = platform.claimAgent(reg.owner!.id, 'Bot', 'invalid-key');
    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_api_key');
  });

  it('prevents duplicate API key claim', () => {
    const reg = platform.registerOwner('owner@example.com', 'securePass123');
    platform.claimAgent(reg.owner!.id, 'Bot 1', 'sk_test_key1');
    const dup = platform.claimAgent(reg.owner!.id, 'Bot 2', 'sk_test_key1');
    expect(dup.success).toBe(false);
    expect(dup.error).toBe('duplicate_api_key');
  });

  it('prevents assigning pending (unconfirmed) agent to QR', () => {
    const reg = platform.registerOwner('owner@example.com', 'securePass123');
    const qr = platform.createQRCode(reg.owner!.id, 'QR', 'desc');
    const agent = platform.claimAgent(reg.owner!.id, 'Bot', 'sk_test_key1');
    // Agent is pending — not confirmed yet
    const result = platform.assignAgentToQR(qr.qrcode!.id, agent.agent!.id, reg.owner!.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('agent_not_active');
  });

  it('prevents wrong owner from confirming agent', () => {
    const owner1 = platform.registerOwner('owner1@example.com', 'securePass123');
    const owner2 = platform.registerOwner('owner2@example.com', 'securePass123');
    const agent = platform.claimAgent(owner1.owner!.id, 'Bot', 'sk_test_key1');
    const result = platform.confirmAgent(agent.agent!.id, owner2.owner!.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('forbidden');
  });

  it('prevents reading conversation by non-owner', () => {
    const owner1 = platform.registerOwner('owner1@example.com', 'securePass123');
    const owner2 = platform.registerOwner('owner2@example.com', 'securePass123');
    const qr = platform.createQRCode(owner1.owner!.id, 'QR', 'desc');
    const agent = platform.claimAgent(owner1.owner!.id, 'Bot', 'sk_test_key1');
    platform.confirmAgent(agent.agent!.id, owner1.owner!.id);
    platform.assignAgentToQR(qr.qrcode!.id, agent.agent!.id, owner1.owner!.id);
    platform.activateQRCode(qr.qrcode!.id, owner1.owner!.id);

    const scan = platform.scanQRCode(qr.qrcode!.slug);
    const conv = platform.startConversation(scan.session!.sessionId, agent.agent!.id);
    platform.sendMessage(conv.conversation!.id, 'visitor', 'hello', 'msg1');

    // Owner2 tries to read owner1's conversation
    const result = platform.getConversationMessages(conv.conversation!.id, owner2.owner!.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('forbidden');
  });
});

describe('Full-Chain Integration: Message Deduplication', () => {
  let platform: ReturnType<typeof createPlatform>;

  beforeEach(() => {
    platform = createPlatform();
    vi.restoreAllMocks();
  });

  it('deduplicates messages with same clientMsgId', () => {
    const reg = platform.registerOwner('owner@example.com', 'securePass123');
    const qr = platform.createQRCode(reg.owner!.id, 'QR', 'desc');
    const agent = platform.claimAgent(reg.owner!.id, 'Bot', 'sk_test_key1');
    platform.confirmAgent(agent.agent!.id, reg.owner!.id);
    platform.assignAgentToQR(qr.qrcode!.id, agent.agent!.id, reg.owner!.id);
    platform.activateQRCode(qr.qrcode!.id, reg.owner!.id);

    const scan = platform.scanQRCode(qr.qrcode!.slug);
    const conv = platform.startConversation(scan.session!.sessionId, agent.agent!.id);

    const msg1 = platform.sendMessage(conv.conversation!.id, 'visitor', 'Hello!', 'dedup_1');
    const msg2 = platform.sendMessage(conv.conversation!.id, 'visitor', 'Hello!', 'dedup_1');

    expect(msg1.success).toBe(true);
    expect(msg2.success).toBe(true);
    expect(msg1.message!.id).toBe(msg2.message!.id); // same message returned

    const stats = platform.getDashboardStats(reg.owner!.id);
    expect(stats.totalMessages).toBe(1); // only 1 message stored
  });
});

describe('Full-Chain Integration: Streaming', () => {
  let platform: ReturnType<typeof createPlatform>;

  beforeEach(() => {
    platform = createPlatform();
    vi.restoreAllMocks();
  });

  it('streaming produces correct chunks and final message', () => {
    const reg = platform.registerOwner('owner@example.com', 'securePass123');
    const qr = platform.createQRCode(reg.owner!.id, 'QR', 'desc');
    const agent = platform.claimAgent(reg.owner!.id, 'Bot', 'sk_test_key1');
    platform.confirmAgent(agent.agent!.id, reg.owner!.id);
    platform.assignAgentToQR(qr.qrcode!.id, agent.agent!.id, reg.owner!.id);
    platform.activateQRCode(qr.qrcode!.id, reg.owner!.id);

    const scan = platform.scanQRCode(qr.qrcode!.slug);
    const conv = platform.startConversation(scan.session!.sessionId, agent.agent!.id);

    platform.sendMessage(conv.conversation!.id, 'visitor', 'Tell me about your product', 'msg_1');

    const chunks = ['Our ', 'product ', 'is ', 'amazing!'];
    const stream = platform.simulateStreamResponse(conv.conversation!.id, chunks);

    // Verify chunk sequence
    expect(stream.streamChunks.filter((c) => c.type === 'stream_chunk')).toHaveLength(4);
    expect(stream.streamChunks[0].content).toBe('Our ');
    expect(stream.streamChunks[3].content).toBe('amazing!');

    // Verify stream_end has full content
    const endChunk = stream.streamChunks[4];
    expect(endChunk.type).toBe('stream_end');
    expect(endChunk.content).toBe('Our product is amazing!');

    // Verify final message is persisted
    expect(stream.finalMessage.content).toBe('Our product is amazing!');
    expect(stream.finalMessage.contentEncrypted).toBe(true);
  });

  it('multi-turn conversation with streaming', () => {
    const reg = platform.registerOwner('owner@example.com', 'securePass123');
    const qr = platform.createQRCode(reg.owner!.id, 'QR', 'desc');
    const agent = platform.claimAgent(reg.owner!.id, 'Bot', 'sk_test_key1');
    platform.confirmAgent(agent.agent!.id, reg.owner!.id);
    platform.assignAgentToQR(qr.qrcode!.id, agent.agent!.id, reg.owner!.id);
    platform.activateQRCode(qr.qrcode!.id, reg.owner!.id);

    const scan = platform.scanQRCode(qr.qrcode!.slug);
    const conv = platform.startConversation(scan.session!.sessionId, agent.agent!.id);

    // Turn 1
    platform.sendMessage(conv.conversation!.id, 'visitor', 'Hi', 'msg_1');
    platform.simulateStreamResponse(conv.conversation!.id, ['Hello!']);

    // Turn 2
    platform.sendMessage(conv.conversation!.id, 'visitor', 'Help me', 'msg_2');
    platform.simulateStreamResponse(conv.conversation!.id, ['Sure', ', how?']);

    // Turn 3
    platform.sendMessage(conv.conversation!.id, 'visitor', 'Pricing?', 'msg_3');
    platform.simulateStreamResponse(conv.conversation!.id, ['$10', '/mo']);

    const stats = platform.getDashboardStats(reg.owner!.id);
    expect(stats.totalMessages).toBe(6); // 3 visitor + 3 agent

    const msgList = platform.getConversationMessages(conv.conversation!.id, reg.owner!.id);
    expect(msgList.messages).toHaveLength(6);
  });
});
