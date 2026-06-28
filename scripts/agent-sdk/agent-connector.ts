/**
 * QRClaw Agent Connector SDK
 *
 * A standalone TypeScript module for connecting an AI Agent to the
 * QRClaw Gateway via WebSocket. Handles the full lifecycle:
 *   1. Obtain a JWT ticket from the Edge Function
 *   2. Connect to Gateway WebSocket
 *   3. Handle heartbeat (ping/pong)
 *   4. Dispatch incoming visitor messages to your handler
 *   5. Provide helpers to send replies (full or streamed)
 *   6. Auto-reconnect on disconnect
 *
 * Usage: see example-echo-agent.ts and example-openclaw-agent.ts
 */
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────

/** Configuration for the Agent Connector. */
export interface AgentConnectorConfig {
  /** Supabase project URL, e.g. "https://xxx.supabase.co" */
  supabaseUrl: string;
  /** Agent API key (plain text — will be sent to Edge Function) */
  agentApiKey: string;
  /** Gateway WebSocket URL, e.g. "ws://localhost:8080" */
  gatewayWsUrl: string;
  /** Called when a visitor sends a message to this agent */
  onMessage: (message: IncomingMessage, connector: AgentConnector) => void | Promise<void>;
  /** Called when the connection state changes (optional) */
  onStateChange?: (state: ConnectionState) => void;
  /** Called on errors (optional, defaults to console.error) */
  onError?: (error: Error) => void;
  /** Auto-reconnect on disconnect? Default: true */
  autoReconnect?: boolean;
  /** Delay between reconnect attempts in ms. Default: 3000 */
  reconnectDelayMs?: number;
  /** Maximum number of reconnect attempts. Default: 10 */
  maxReconnectAttempts?: number;
  /** Custom ticket endpoint URL (overrides default Supabase Edge Function URL).
   *  If set, the SDK will POST to this URL instead of ${supabaseUrl}/functions/v1/agent-ws-ticket.
   *  Useful for local development with Gateway-hosted ticket endpoint. */
  ticketUrl?: string;
}

/** A visitor message received from the Gateway. */
export interface IncomingMessage {
  /** Unique message ID */
  id: string;
  /** Message text content */
  content: string;
  /** Content type: "text", "image_url", etc. */
  contentType: string;
  /** Who sent it: "visitor" */
  senderType: string;
  /** The QR code / conversation ID — use this when replying */
  conversationId: string;
  /** If the message was queued while agent was offline */
  queuedAt?: string;
  /** Raw payload from the Gateway frame */
  raw: Record<string, unknown>;
}

/** Connection lifecycle states. */
export type ConnectionState =
  | 'disconnected'
  | 'requesting_ticket'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

/** Ticket response from the Edge Function. */
interface TicketResponse {
  data: {
    ticket: string;
    expires_in: number;
    gateway_url: string;
  };
}

/** connection_ack payload from Gateway. */
interface ConnectionAckPayload {
  connection_id: string;
  heartbeat_interval_ms: number;
  server_time?: string;
}

// ─── AgentConnector Class ───────────────────────────────────────────

export class AgentConnector {
  private readonly config: Required<
    Pick<AgentConnectorConfig, 'autoReconnect' | 'reconnectDelayMs' | 'maxReconnectAttempts'>
  > &
    AgentConnectorConfig;

  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectionId: string | null = null;
  private reconnectAttempts = 0;
  private state: ConnectionState = 'disconnected';
  private destroyed = false;

  constructor(config: AgentConnectorConfig) {
    this.config = {
      autoReconnect: true,
      reconnectDelayMs: 3000,
      maxReconnectAttempts: 10,
      ...config,
    };
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Start the connection flow: get ticket → connect WS. */
  async connect(): Promise<void> {
    this.destroyed = false;
    this.reconnectAttempts = 0;
    await this.doConnect();
  }

  /** Gracefully disconnect and stop auto-reconnect. */
  disconnect(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Agent disconnecting');
      this.ws = null;
    }
    this.setState('disconnected');
    this.log('Disconnected');
  }

  /** Get the current connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Send a full reply message to a conversation.
   * 发送完整回复消息。
   *
   * @param conversationId - The QR code / conversation to reply to
   * @param content - The reply text
   * @param contentType - "text" (default) or "markdown"
   */
  sendReply(
    conversationId: string,
    content: string,
    contentType: 'text' | 'markdown' = 'text'
  ): void {
    const frame = {
      type: 'agent_message',
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      payload: {
        content,
        content_type: contentType,
        conversation_id: conversationId,
      },
    };
    this.sendFrame(frame);
  }

  /**
   * Send a streamed reply in chunks, then close the stream.
   * 以流式方式发送回复（分块 + 结束帧）。
   *
   * @param conversationId - The QR code / conversation to reply to
   * @param chunks - Array of text chunks to stream
   */
  sendStreamReply(conversationId: string, chunks: string[]): void {
    const messageId = randomUUID();

    for (let i = 0; i < chunks.length; i++) {
      const chunkFrame = {
        type: 'stream_chunk',
        id: messageId,
        timestamp: new Date().toISOString(),
        payload: {
          conversation_id: conversationId,
          delta: chunks[i],
          sequence: i + 1,
        },
      };
      this.sendFrame(chunkFrame);
    }

    // Send stream_end to finalize
    const endFrame = {
      type: 'stream_end',
      id: messageId,
      timestamp: new Date().toISOString(),
      payload: {
        conversation_id: conversationId,
        total_chunks: chunks.length,
      },
    };
    this.sendFrame(endFrame);
  }

  /**
   * Send a single stream chunk (for real-time streaming).
   * 发送单个流式分块（用于实时流式输出）。
   *
   * @returns The message ID to use for subsequent chunks and stream_end
   */
  sendStreamChunk(
    conversationId: string,
    delta: string,
    sequence: number,
    messageId?: string
  ): string {
    const id = messageId ?? randomUUID();
    const frame = {
      type: 'stream_chunk',
      id,
      timestamp: new Date().toISOString(),
      payload: {
        conversation_id: conversationId,
        delta,
        sequence,
      },
    };
    this.sendFrame(frame);
    return id;
  }

  /**
   * Send stream_end to finalize a streamed reply.
   * 发送流式结束帧。
   */
  sendStreamEnd(conversationId: string, messageId: string, totalChunks: number): void {
    const frame = {
      type: 'stream_end',
      id: messageId,
      timestamp: new Date().toISOString(),
      payload: {
        conversation_id: conversationId,
        total_chunks: totalChunks,
      },
    };
    this.sendFrame(frame);
  }

  // ── Private ─────────────────────────────────────────────────────

  private async doConnect(): Promise<void> {
    try {
      // Step 1: Get a ticket from the Edge Function
      this.setState('requesting_ticket');
      this.log('Requesting WebSocket ticket...');
      const ticket = await this.requestTicket();
      this.log('Ticket obtained (expires in 30s)');

      // Step 2: Connect to Gateway WebSocket
      this.setState('connecting');
      const baseWsUrl = this.config.gatewayWsUrl.endsWith('/ws')
        ? this.config.gatewayWsUrl
        : `${this.config.gatewayWsUrl}/ws`;
      const wsUrl = `${baseWsUrl}?ticket=${encodeURIComponent(ticket)}&role=agent`;
      this.log(`Connecting to ${baseWsUrl} ...`);
      await this.connectWebSocket(wsUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleError(error);
      this.maybeReconnect();
    }
  }

  /**
   * Request a JWT ticket from the agent-ws-ticket Edge Function.
   */
  private async requestTicket(): Promise<string> {
    const url = this.config.ticketUrl || `${this.config.supabaseUrl}/functions/v1/agent-ws-ticket`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.agentApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ticket request failed (HTTP ${response.status}): ${body}`);
    }

    const json = (await response.json()) as TicketResponse;
    return json.data.ticket;
  }

  /**
   * Establish WebSocket connection and wire up event handlers.
   */
  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let resolved = false;

      ws.on('open', () => {
        this.log('WebSocket connection opened, waiting for connection_ack...');
      });

      ws.on('message', (data: WebSocket.Data) => {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(text) as Record<string, unknown>;
        } catch {
          this.log(`Received non-JSON message: ${text}`);
          return;
        }

        // Handle connection_ack
        if (frame.type === 'connection_ack') {
          const payload = frame.payload as ConnectionAckPayload;
          this.connectionId = payload.connection_id;
          this.startHeartbeat(payload.heartbeat_interval_ms);
          this.reconnectAttempts = 0;
          this.setState('connected');
          this.log(`Connected! ID: ${this.connectionId}`);

          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }

        // Handle pong (response to our ping)
        if (frame.type === 'pong') {
          return; // heartbeat acknowledged
        }

        // Handle error frames from Gateway
        if (frame.type === 'error') {
          const errorPayload = frame.payload as Record<string, unknown>;
          this.log(`Server error: [${errorPayload.code}] ${errorPayload.message}`);
          return;
        }

        // Handle incoming visitor messages (support both "message" and "visitor_message" frame types)
        if (frame.type === 'message' || frame.type === 'visitor_message') {
          this.handleIncomingMessage(frame);
          return;
        }

        // Log unknown frame types
        this.log(`Unknown frame type: ${frame.type}`);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.stopHeartbeat();
        this.ws = null;
        const reasonStr = reason.toString() || 'no reason';
        this.log(`Connection closed (code: ${code}, reason: ${reasonStr})`);

        if (!resolved) {
          resolved = true;
          reject(new Error(`WebSocket closed before ack (code: ${code})`));
          return;
        }

        if (!this.destroyed) {
          this.maybeReconnect();
        }
      });

      ws.on('error', (err: Error) => {
        this.handleError(err);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      this.ws = ws;
    });
  }

  /**
   * Parse an incoming "message" frame and dispatch to the handler.
   */
  private handleIncomingMessage(frame: Record<string, unknown>): void {
    const payload = frame.payload as Record<string, unknown>;
    const message: IncomingMessage = {
      id: frame.id as string,
      content: payload.content as string,
      contentType: (payload.content_type as string) || 'text',
      senderType: (payload.sender_type as string) || 'visitor',
      conversationId: payload.conversation_id as string,
      queuedAt: payload.queued_at as string | undefined,
      raw: payload,
    };

    this.log(
      `Message from ${message.senderType} in ${message.conversationId}: "${message.content.slice(0, 80)}"`
    );

    // Dispatch to user-provided handler
    try {
      const result = this.config.onMessage(message, this);
      // If handler returns a promise, catch its errors
      if (result instanceof Promise) {
        result.catch((err) => {
          this.handleError(err instanceof Error ? err : new Error(String(err)));
        });
      }
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Send a raw frame over the WebSocket.
   */
  private sendFrame(frame: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('Cannot send: WebSocket is not open');
      return;
    }
    const json = JSON.stringify(frame);
    this.ws.send(json);
  }

  /**
   * Start the heartbeat (ping) timer.
   * The Gateway expects a ping every heartbeat_interval_ms.
   */
  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const ping = {
          type: 'ping',
          timestamp: new Date().toISOString(),
        };
        this.ws.send(JSON.stringify(ping));
      }
    }, intervalMs);
  }

  /** Stop the heartbeat timer. */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Attempt to reconnect if auto-reconnect is enabled.
   */
  private maybeReconnect(): void {
    if (this.destroyed || !this.config.autoReconnect) {
      this.setState('disconnected');
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log(`Max reconnect attempts (${this.config.maxReconnectAttempts}) reached. Giving up.`);
      this.setState('disconnected');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * this.reconnectAttempts; // linear backoff
    this.setState('reconnecting');
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    setTimeout(() => {
      if (!this.destroyed) {
        this.doConnect();
      }
    }, delay);
  }

  /** Update connection state and notify listener. */
  private setState(newState: ConnectionState): void {
    this.state = newState;
    this.config.onStateChange?.(newState);
  }

  /** Handle an error using the configured handler or console.error. */
  private handleError(error: Error): void {
    if (this.config.onError) {
      this.config.onError(error);
    } else {
      console.error('[AgentConnector] Error:', error.message);
    }
  }

  /** Log a message with a prefix. */
  private log(msg: string): void {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [AgentConnector] ${msg}`);
  }
}
