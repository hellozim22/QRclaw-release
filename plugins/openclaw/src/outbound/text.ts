import { randomUUID } from 'crypto';
import type { QRClawRuntime } from '../runtime.js';
import type { AgentMessageFrame } from '../../../../shared/contracts/ws/types.js';

export interface OutboundTextDeps {
  runtime: QRClawRuntime;
  logger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

export class QRClawOutboundError extends Error {
  readonly code: string;

  constructor(opts: { code: string; message: string }) {
    super(opts.message);
    this.name = 'QRClawOutboundError';
    this.code = opts.code;
  }
}

export interface SendTextParams {
  accountLabel: string;
  conversationId: string;
  text: string;
  contentType?: 'text' | 'markdown';
}

/**
 * Send a complete text message to a QRClaw conversation.
 *
 * Builds an AgentMessageFrame and sends it via the runtime connection.
 * Returns the client-generated message_id for ACK correlation and
 * server-side idempotency.
 */
export function sendText(deps: OutboundTextDeps, params: SendTextParams): string {
  const conn = deps.runtime.connection(params.accountLabel);

  if (!conn) {
    throw new QRClawOutboundError({
      code: 'not_connected',
      message: `No connection for account "${params.accountLabel}"`,
    });
  }

  const messageId = randomUUID();

  const frame: AgentMessageFrame = {
    type: 'agent_message',
    id: messageId,
    timestamp: new Date().toISOString(),
    payload: {
      content: params.text,
      content_type: params.contentType ?? 'markdown',
      conversation_id: params.conversationId,
    },
  };

  conn.send(frame);

  return messageId;
}
