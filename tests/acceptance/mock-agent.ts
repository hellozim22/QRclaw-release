/**
 * Mock Agent WebSocket client for acceptance testing.
 * Signs JWT tickets locally using WS_TICKET_SECRET and connects to Gateway.
 */
import jsonwebtoken from 'jsonwebtoken';
const jwt = jsonwebtoken;
import WebSocket from 'ws';

const WS_TICKET_SECRET = '97c0d88e04b6b62ccfb0113907f7b7f1c3fbe3554b4e7e680e871c6d07d6fad0';
const GATEWAY_WS_URL = 'ws://localhost:3001/ws';

export interface MockAgentOptions {
  agentId: string;
  ownerId?: string;
  qrCodeId?: string;
}

export interface MockVisitorOptions {
  sessionToken: string;
  qrCodeId: string;
  agentId?: string;
}

export interface ReceivedMessage {
  type: string;
  id?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

/**
 * Sign a WS ticket JWT matching Gateway's TicketPayload interface.
 */
export function signAgentTicket(
  agentId: string,
  ownerId: string = 'test-owner',
  qrCodeId?: string
): string {
  const payload: Record<string, unknown> = { role: 'agent', agentId, ownerId };
  if (qrCodeId) payload.qrCodeId = qrCodeId;
  return jwt.sign(payload, WS_TICKET_SECRET, { expiresIn: '30s' });
}

export function signVisitorTicket(
  sessionToken: string,
  qrCodeId: string,
  agentId?: string
): string {
  return jwt.sign({ role: 'visitor', sessionToken, qrCodeId, agentId }, WS_TICKET_SECRET, {
    expiresIn: '30s',
  });
}

/**
 * MockAgent - connects as an Agent to the Gateway WS.
 */
export class MockAgent {
  ws: WebSocket | null = null;
  received: ReceivedMessage[] = [];
  connectionAck: ReceivedMessage | null = null;
  private listeners = new Map<string, ((msg: ReceivedMessage) => void)[]>();

  constructor(private options: MockAgentOptions) {}

  async connect(): Promise<ReceivedMessage> {
    const ticket = signAgentTicket(
      this.options.agentId,
      this.options.ownerId,
      this.options.qrCodeId
    );
    return this.connectWithTicket(ticket);
  }

  private connectWithTicket(ticket: string): Promise<ReceivedMessage> {
    return new Promise((resolve, reject) => {
      const url = `${GATEWAY_WS_URL}?ticket=${ticket}`;
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        // Wait for connection_ack
      });

      this.ws.on('message', (data: Buffer | string) => {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        const msg: ReceivedMessage = JSON.parse(text);
        this.received.push(msg);

        if (msg.type === 'connection_ack') {
          clearTimeout(timeout);
          this.connectionAck = msg;
          resolve(msg);
        }

        // Notify type-specific listeners
        const typeListeners = this.listeners.get(msg.type) || [];
        for (const listener of typeListeners) {
          listener(msg);
        }
      });

      this.ws.on('close', (code: number) => {
        clearTimeout(timeout);
        if (!this.connectionAck) {
          reject(new Error(`Connection closed before ack: code=${code}`));
        }
      });

      this.ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Send a ping and wait for pong.
   */
  async ping(): Promise<ReceivedMessage> {
    this.send({
      type: 'ping',
      timestamp: new Date().toISOString(),
    });
    return this.waitFor('pong');
  }

  /**
   * Send an agent_message (full reply).
   */
  sendReply(conversationId: string, content: string, messageId?: string): void {
    this.send({
      type: 'agent_message',
      id: messageId || `msg_${Date.now()}`,
      timestamp: new Date().toISOString(),
      payload: {
        content,
        content_type: 'text',
        conversation_id: conversationId,
      },
    });
  }

  /**
   * Send a stream_chunk.
   */
  sendStreamChunk(
    conversationId: string,
    delta: string,
    messageId: string,
    sequence: number,
    isFinal: boolean = false
  ): void {
    this.send({
      type: 'stream_chunk',
      id: messageId,
      timestamp: new Date().toISOString(),
      payload: {
        conversation_id: conversationId,
        delta,
        sequence,
        is_final: isFinal,
      },
    });
  }

  /**
   * Send a stream_end.
   */
  sendStreamEnd(conversationId: string, messageId: string, totalChunks: number): void {
    this.send({
      type: 'stream_end',
      id: messageId,
      timestamp: new Date().toISOString(),
      payload: {
        conversation_id: conversationId,
        total_chunks: totalChunks,
      },
    });
  }

  /**
   * Wait for a specific message type.
   */
  waitFor(type: string, timeoutMs: number = 10000): Promise<ReceivedMessage> {
    // Check already received
    const existing = this.received.find((m) => m.type === type);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${type} (${timeoutMs}ms)`));
      }, timeoutMs);

      const listeners = this.listeners.get(type) || [];
      const handler = (msg: ReceivedMessage) => {
        clearTimeout(timer);
        resolve(msg);
      };
      listeners.push(handler);
      this.listeners.set(type, listeners);
    });
  }

  /**
   * Wait for next message of any type.
   */
  waitForNext(timeoutMs: number = 10000): Promise<ReceivedMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timeout waiting for next message')),
        timeoutMs
      );
      const initialCount = this.received.length;

      const check = setInterval(() => {
        if (this.received.length > initialCount) {
          clearTimeout(timer);
          clearInterval(check);
          resolve(this.received[this.received.length - 1]);
        }
      }, 50);
    });
  }

  /**
   * Get all received messages of a specific type.
   */
  messagesOfType(type: string): ReceivedMessage[] {
    return this.received.filter((m) => m.type === type);
  }

  /**
   * Clear received messages.
   */
  clearReceived(): void {
    this.received = [];
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * MockVisitor - connects as a Visitor to the Gateway WS.
 */
export class MockVisitor {
  ws: WebSocket | null = null;
  received: ReceivedMessage[] = [];
  connectionAck: ReceivedMessage | null = null;
  private listeners = new Map<string, ((msg: ReceivedMessage) => void)[]>();

  constructor(private options: MockVisitorOptions) {}

  async connect(): Promise<ReceivedMessage> {
    const ticket = signVisitorTicket(
      this.options.sessionToken,
      this.options.qrCodeId,
      this.options.agentId
    );
    return this.connectWithTicket(ticket);
  }

  private connectWithTicket(ticket: string): Promise<ReceivedMessage> {
    return new Promise((resolve, reject) => {
      const url = `${GATEWAY_WS_URL}?ticket=${ticket}`;
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.on('message', (data: Buffer | string) => {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        const msg: ReceivedMessage = JSON.parse(text);
        this.received.push(msg);

        if (msg.type === 'connection_ack') {
          clearTimeout(timeout);
          this.connectionAck = msg;
          resolve(msg);
        }

        const typeListeners = this.listeners.get(msg.type) || [];
        for (const listener of typeListeners) {
          listener(msg);
        }
      });

      this.ws.on('close', (code: number) => {
        clearTimeout(timeout);
        if (!this.connectionAck) {
          reject(new Error(`Connection closed before ack: code=${code}`));
        }
      });

      this.ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Send a visitor_message.
   */
  sendMessage(content: string, messageId?: string): void {
    const id = messageId || `vmsg_${Date.now()}`;
    this.send({
      type: 'visitor_message',
      id,
      timestamp: new Date().toISOString(),
      payload: {
        content,
        content_type: 'text',
      },
    });
  }

  waitFor(type: string, timeoutMs: number = 10000): Promise<ReceivedMessage> {
    const existing = this.received.find((m) => m.type === type && m !== this.connectionAck);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
      const listeners = this.listeners.get(type) || [];
      listeners.push((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      this.listeners.set(type, listeners);
    });
  }

  messagesOfType(type: string): ReceivedMessage[] {
    return this.received.filter((m) => m.type === type);
  }

  clearReceived(): void {
    this.received = [];
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
