import WebSocket from 'ws';
import type {
  ServerFrame,
  ClientFrame,
  ConnectionAckFrame,
} from '../../../shared/contracts/ws/types.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface QRClawConnectionConfig {
  supabaseUrl: string;
  agentApiKey: string;
  gatewayWsUrl: string;
  accountLabel: string;
  ticketUrl?: string;
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  onInboundFrame: (frame: ServerFrame) => void;
  onStateChange?: (state: ConnectionState) => void;
  onError?: (err: Error) => void;
  logger?: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

interface TicketResponse {
  data: {
    ticket: string;
    expires_in: number;
    gateway_url: string;
  };
}

export class QRClawConnection {
  private readonly config: Required<
    Pick<QRClawConnectionConfig, 'autoReconnect' | 'reconnectDelayMs' | 'maxReconnectAttempts'>
  > &
    QRClawConnectionConfig;

  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private _state: ConnectionState = 'disconnected';
  private destroyed = false;

  constructor(config: QRClawConnectionConfig) {
    this.config = {
      autoReconnect: true,
      reconnectDelayMs: 3000,
      maxReconnectAttempts: 10,
      ...config,
    };
  }

  get state(): ConnectionState {
    return this._state;
  }

  get accountLabel(): string {
    return this.config.accountLabel;
  }

  async connect(): Promise<void> {
    this.destroyed = false;
    this.reconnectAttempts = 0;
    await this.doConnect();
  }

  disconnect(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Plugin disconnecting');
      this.ws = null;
    }
    this.setState('disconnected');
  }

  send(frame: ClientFrame): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('warn', 'Cannot send: WebSocket is not open');
      return;
    }
    this.ws.send(JSON.stringify(frame));
  }

  private async doConnect(): Promise<void> {
    try {
      this.setState('connecting');
      const ticket = await this.requestTicket();

      const baseWsUrl = this.config.gatewayWsUrl.endsWith('/ws')
        ? this.config.gatewayWsUrl
        : `${this.config.gatewayWsUrl}/ws`;
      const wsUrl = `${baseWsUrl}?ticket=${encodeURIComponent(ticket)}&role=agent`;

      await this.connectWebSocket(wsUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleError(error);
      this.maybeReconnect();
    }
  }

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

  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let resolved = false;

      ws.on('open', () => {
        this.log('debug', 'WebSocket connection opened, waiting for ack...');
      });

      ws.on('message', (data: WebSocket.Data) => {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(text) as Record<string, unknown>;
        } catch {
          this.log('warn', `Non-JSON message: ${text}`);
          return;
        }

        if (frame.type === 'connection_ack') {
          const payload = (frame as unknown as ConnectionAckFrame).payload;
          this.startHeartbeat(payload.heartbeat_interval_ms);
          this.reconnectAttempts = 0;
          this.setState('connected');

          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }

        if (frame.type === 'pong') {
          return;
        }

        this.config.onInboundFrame(frame as unknown as ServerFrame);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.stopHeartbeat();
        this.ws = null;

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

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'ping',
            timestamp: new Date().toISOString(),
          })
        );
      }
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private maybeReconnect(): void {
    if (this.destroyed || !this.config.autoReconnect) {
      this.setState('disconnected');
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log('warn', `Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`);
      this.setState('disconnected');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * this.reconnectAttempts;
    this.setState('reconnecting');
    this.log('info', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (!this.destroyed) {
        this.doConnect();
      }
    }, delay);
  }

  private setState(newState: ConnectionState): void {
    this._state = newState;
    this.config.onStateChange?.(newState);
  }

  private handleError(error: Error): void {
    if (this.config.onError) {
      this.config.onError(error);
    } else if (this.config.logger) {
      this.config.logger.error(`[QRClawConnection:${this.config.accountLabel}]`, error.message);
    }
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void {
    if (this.config.logger) {
      this.config.logger[level](`[QRClawConnection:${this.config.accountLabel}]`, msg);
    }
  }
}
