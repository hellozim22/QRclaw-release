import { randomUUID } from 'crypto';
import type { QRClawRuntime } from '../runtime.js';
import type {
  ClientFrame,
  StreamChunkFrame,
  StreamEndFrame,
} from '../../../../shared/contracts/ws/types.js';

export interface StreamDeps {
  runtime: QRClawRuntime;
  logger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

export interface QRClawStreamController {
  messageId: string;
  pushChunk(delta: string): void;
  end(opts?: { totalLength?: number; fullContent?: string }): void;
  abort(reason?: string): void;
}

interface CreateStreamParams {
  accountLabel: string;
  conversationId: string;
}

/**
 * Create a stream controller for sending chunked responses.
 *
 * Behavioral equivalence with scripts/agent-sdk/agent-connector.ts
 * sendStreamChunk/sendStreamEnd (§3.2 I1, §9 R8):
 * - stream_chunk frames carry { conversation_id, delta, sequence }
 * - stream_end carries { conversation_id, total_chunks }
 * - All frames share the same id (messageId)
 */
export function createStream(deps: StreamDeps, params: CreateStreamParams): QRClawStreamController {
  const conn = deps.runtime.connection(params.accountLabel);
  const messageId = randomUUID();
  let sequence = 0;
  let ended = false;
  let errored = false;

  function safeSend(frame: ClientFrame): boolean {
    if (errored) return false;
    try {
      conn?.send(frame);
      return true;
    } catch (err) {
      errored = true;
      deps.logger.warn(
        `[stream:${messageId}] Send failed, stopping stream:`,
        err instanceof Error ? err.message : err
      );
      return false;
    }
  }

  return {
    messageId,

    pushChunk(delta: string): void {
      if (ended) {
        deps.logger.warn(`[stream:${messageId}] pushChunk called after end/abort — ignored`);
        return;
      }
      if (errored) return;

      sequence++;

      const frame: StreamChunkFrame = {
        type: 'stream_chunk',
        id: messageId,
        timestamp: new Date().toISOString(),
        payload: {
          conversation_id: params.conversationId,
          delta,
          sequence,
        },
      };

      safeSend(frame);
    },

    end(opts?: { totalLength?: number; fullContent?: string }): void {
      if (ended) return;
      ended = true;

      const frame: StreamEndFrame = {
        type: 'stream_end',
        id: messageId,
        timestamp: new Date().toISOString(),
        payload: {
          conversation_id: params.conversationId,
          total_chunks: sequence,
          total_length: opts?.totalLength,
          full_content: opts?.fullContent,
        },
      };

      safeSend(frame);
    },

    abort(reason?: string): void {
      if (ended) return;
      ended = true;

      deps.logger.info(`[stream:${messageId}] Aborted${reason ? `: ${reason}` : ''}`);

      const frame = {
        type: 'stream_end' as const,
        id: messageId,
        timestamp: new Date().toISOString(),
        payload: {
          conversation_id: params.conversationId,
          total_chunks: sequence,
          aborted: true,
        },
      };

      safeSend(frame as unknown as ClientFrame);
    },
  };
}
