// WebSocket client for visitor↔gateway communication
// Handles connection lifecycle, heartbeat, auto-reconnect, and frame dispatch

import type {
  ClientFrame,
  ServerFrame,
  ConnectionAckFrame,
  AckFrame,
  MessageFrame,
  StreamChunkFrame,
  StreamEndFrame,
  ErrorFrame,
  SystemFrame,
} from '@/types/ws';

export interface WSClientOptions {
  gatewayUrl: string;
  agentId: string;
  ticket?: string;
  role?: 'visitor' | 'agent';
  sessionToken?: string;
  onConnectionAck?: (frame: ConnectionAckFrame) => void;
  onAck?: (frame: AckFrame) => void;
  onMessage?: (frame: MessageFrame) => void;
  onStreamChunk?: (frame: StreamChunkFrame) => void;
  onStreamEnd?: (frame: StreamEndFrame) => void;
  onAgentTyping?: () => void;
  onError?: (frame: ErrorFrame) => void;
  onSystem?: (frame: SystemFrame) => void;
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting') => void;
  onTicketRefresh?: () => Promise<{ ticket: string; sessionToken: string }>;
}

const MAX_RECONNECT_DELAY_MS = 30000;
const BASE_RECONNECT_DELAY_MS = 1000;

export class WSClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionallyClosed = false;
  private heartbeatIntervalMs = 25000;
  private options: WSClientOptions;

  constructor(options: WSClientOptions) {
    this.options = options;
  }

  connect(): void {
    this.intentionallyClosed = false;
    this.setStatus('connecting');

    // CRITICAL-1: Only agent_id and role go in the URL.
    // Tokens are sent via an auth frame after the connection opens.
    const params = new URLSearchParams({
      agent_id: this.options.agentId,
    });
    if (this.options.role) {
      params.set('role', this.options.role);
    }

    const url = `${this.options.gatewayUrl}?${params.toString()}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.sendAuthFrame();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      this.handleFrame(event.data);
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (!this.intentionallyClosed) {
        this.setStatus('reconnecting');
        this.scheduleReconnect();
      } else {
        this.setStatus('disconnected');
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnect logic is handled there
    };
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();
    if (this.ws) {
      // Remove handlers before closing to prevent onclose from scheduling reconnect
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  sendMessage(
    content: string,
    contentType: 'text' | 'image_url' | 'file_url' = 'text',
    messageId?: string
  ): string {
    const id = messageId ?? crypto.randomUUID();
    const frame: ClientFrame = {
      type: 'visitor_message',
      id,
      timestamp: new Date().toISOString(),
      payload: {
        content,
        content_type: contentType,
      },
    };
    this.send(frame);
    return id;
  }

  sendReadReceipt(messageIds: string[]): void {
    const frame: ClientFrame = {
      type: 'read_receipt',
      timestamp: new Date().toISOString(),
      payload: {
        message_ids: messageIds,
      },
    };
    this.send(frame);
  }

  private send(frame: ClientFrame): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private sendAuthFrame(): void {
    if (!this.options.ticket && !this.options.sessionToken) return;
    const authFrame = {
      type: 'auth' as const,
      timestamp: new Date().toISOString(),
      payload: {
        ticket: this.options.ticket,
        session_token: this.options.sessionToken,
      },
    };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(authFrame));
    }
  }

  private handleFrame(data: string): void {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(data) as ServerFrame;
    } catch {
      return;
    }

    switch (frame.type) {
      case 'connection_ack': {
        const ackFrame = frame as ConnectionAckFrame;
        this.heartbeatIntervalMs = ackFrame.payload.heartbeat_interval_ms;
        this.startHeartbeat();
        this.setStatus('connected');
        this.options.onConnectionAck?.(ackFrame);
        break;
      }
      case 'ack':
        this.options.onAck?.(frame as AckFrame);
        break;
      case 'message':
        this.options.onMessage?.(frame as MessageFrame);
        break;
      case 'stream_chunk':
        this.options.onStreamChunk?.(frame as StreamChunkFrame);
        break;
      case 'stream_end':
        this.options.onStreamEnd?.(frame as StreamEndFrame);
        break;
      case 'agent_typing':
        this.options.onAgentTyping?.();
        break;
      case 'pong':
        // heartbeat acknowledged — no action needed
        break;
      case 'error':
        this.options.onError?.(frame as ErrorFrame);
        break;
      case 'system':
        this.options.onSystem?.(frame as SystemFrame);
        break;
      default:
        break;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const ping: ClientFrame = {
        type: 'ping',
        timestamp: new Date().toISOString(),
      };
      this.send(ping);
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempt),
      MAX_RECONNECT_DELAY_MS
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(async () => {
      // Guard: if disconnect() was called while waiting, don't reconnect
      if (this.intentionallyClosed) return;

      // HIGH-1: Refresh ticket before reconnecting to avoid expired-ticket loop
      if (this.options.onTicketRefresh) {
        try {
          const { ticket, sessionToken } = await this.options.onTicketRefresh();
          this.options = { ...this.options, ticket, sessionToken };
        } catch (err) {
          console.error('[WSClient] Failed to refresh ticket:', err);
        }
      }
      if (!this.intentionallyClosed) {
        this.connect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'): void {
    this.options.onStatusChange?.(status);
  }
}
