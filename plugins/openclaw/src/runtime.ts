import { QRClawConnection } from './client.js';
import type { ConnectionState } from './client.js';
import type { ResolvedQRClawAccount } from './accounts.js';
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';

export interface QRClawRuntimeDeps {
  onInboundFrame: (accountLabel: string, frame: ServerFrame) => void;
  /**
   * Fires on every connection state transition for every account. Used by
   * the channel layer to trigger cold-start history replay when
   * `state === 'connected'`. Safe to omit in tests that don't exercise
   * replay.
   */
  onStateChange?: (accountLabel: string, state: ConnectionState) => void;
  logger?: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

export class QRClawRuntime {
  private readonly connections: Map<string, QRClawConnection> = new Map();
  private readonly _accounts: ResolvedQRClawAccount[];
  private readonly deps: QRClawRuntimeDeps;

  constructor(accounts: ResolvedQRClawAccount[], deps: QRClawRuntimeDeps) {
    this._accounts = accounts;
    this.deps = deps;

    for (const account of accounts) {
      const conn = new QRClawConnection({
        supabaseUrl: account.supabaseUrl,
        agentApiKey: account.agentToken,
        gatewayWsUrl: account.gatewayWsUrl,
        ticketUrl: account.ticketUrl,
        accountLabel: account.label,
        logger: deps.logger,
        onInboundFrame: (frame) => {
          deps.onInboundFrame(account.label, frame);
        },
        onStateChange: (state) => {
          deps.onStateChange?.(account.label, state);
        },
        onError: (err) => {
          deps.logger?.error(`[QRClawRuntime:${account.label}]`, err.message);
        },
      });
      this.connections.set(account.label, conn);
    }
  }

  async start(): Promise<void> {
    const tasks = Array.from(this.connections.values()).map((conn) => conn.connect());
    await Promise.all(tasks);
  }

  async stop(): Promise<void> {
    for (const conn of this.connections.values()) {
      conn.disconnect();
    }
  }

  connection(accountLabel: string): QRClawConnection | undefined {
    return this.connections.get(accountLabel);
  }

  accounts(): ResolvedQRClawAccount[] {
    return this._accounts;
  }
}
