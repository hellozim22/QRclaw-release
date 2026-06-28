import { Router } from 'express';
import type { Request, Response } from 'express';
import { getOwnerByUserId } from '../db/owner-agent-chat.js';
import { jwtAuthMiddleware } from '../middleware/auth.js';
import { safeLog } from '../middleware/redact-log.js';
import {
  OwnerAgentChatServiceError,
  startOwnerAgentRun,
} from '../services/owner-agent-chat.js';
import type { AuthUser } from '../types/index.js';
import {
  subscribeRunFrames,
  type RunStreamFrame,
  type RunStreamSubscription,
} from '../ws/stream-hub.js';

type OpenAiDelta = Record<string, unknown>;

const DONE_LINE = 'data: [DONE]\n\n';
const DEFAULT_MODEL = 'qrclaw-owner-agent';

export const formatOpenAIChatChunkForTest = (
  runId: string,
  model: string,
  delta: OpenAiDelta,
  finishReason: string | null = null
): string => {
  const body = {
    id: `chatcmpl_${runId}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };
  return `data: ${JSON.stringify(body)}\n\n`;
};

export const extractLatestUserTextForTest = (body: unknown): string => {
  const messages = getMessages(body);
  const userMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!userMessage) {
    throw new OwnerAgentChatServiceError(400, 'invalid_request', 'messages[] missing user turn');
  }
  if (typeof userMessage.content === 'string') {
    return userMessage.content;
  }
  if (!Array.isArray(userMessage.content)) {
    throw new OwnerAgentChatServiceError(400, 'invalid_request', 'unsupported content shape');
  }

  const textParts: string[] = [];
  for (const part of userMessage.content) {
    if (!isRecord(part)) {
      continue;
    }
    if (part.type === 'text' && typeof part.text === 'string') {
      textParts.push(part.text);
    }
    if (
      part.type === 'image_url'
      && isRecord(part.image_url)
      && typeof part.image_url.url === 'string'
      && part.image_url.url.startsWith('data:')
    ) {
      throw new OwnerAgentChatServiceError(400, 'invalid_request', 'base64 data: URLs not allowed');
    }
  }

  const text = textParts.join('\n').trim();
  if (!text) {
    throw new OwnerAgentChatServiceError(
      400,
      'invalid_request',
      'empty user text (attachments in later sprint)'
    );
  }
  return text;
};

export const handleOwnerAgentChatSse = async (req: Request, res: Response): Promise<void> => {
  const user = (req as Request & { user: AuthUser }).user;
  const agentId = typeof req.params.agentId === 'string' ? req.params.agentId : '';
  if (!agentId) {
    res.status(400).json({ error: { code: 'invalid_request', message: 'Agent id is required' } });
    return;
  }

  let subscription: RunStreamSubscription | null = null;
  let streamOpened = false;
  let finished = false;
  let wroteTextDelta = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let activeRunId = '';
  let activeModel = DEFAULT_MODEL;

  const cleanup = (): void => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    subscription?.unsubscribe();
    subscription = null;
  };

  const finish = (reason: string, delta: OpenAiDelta = {}): void => {
    if (finished) {
      return;
    }
    finished = true;
    cleanup();
    res.write(formatOpenAIChatChunkForTest(activeRunId, activeModel, delta, reason));
    res.write(DONE_LINE);
    res.end();
  };

  const openStream = (run: {
    runId: string;
    conversationId: string;
    provider: string;
    requestedModel: string | null;
  }): void => {
    activeRunId = run.runId;
    activeModel = run.requestedModel ?? run.provider ?? DEFAULT_MODEL;
    subscription = subscribeRunFrames(run.runId, (payload) => {
      handleRunStreamFrameSafe(payload, {
        runId: activeRunId,
        model: activeModel,
        res,
        markTextDelta: () => {
          wroteTextDelta = true;
        },
        hasTextDelta: () => wroteTextDelta,
        isFinished: () => finished,
        finish,
      });
    });
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-QRClaw-Run-Id', run.runId);
    res.setHeader('X-QRClaw-Conversation-Id', run.conversationId);
    res.flushHeaders?.();
    res.write(formatOpenAIChatChunkForTest(run.runId, activeModel, { role: 'assistant' }));
    heartbeat = setInterval(() => {
      res.write(`: status=running run=${run.runId}\n\n`);
    }, 15_000);
    req.on('close', () => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
    });
    streamOpened = true;
  };

  try {
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    const content = extractLatestUserTextForTest(req.body);
    const requestedModel = getRequestedModel(req.body);
    const started = await startOwnerAgentRun(
      owner.id,
      agentId,
      {
        content,
        content_type: 'text',
        requested_model: requestedModel,
      },
      { beforeDispatch: openStream }
    );
    if (!streamOpened) {
      openStream(started);
    }
    if (process.env.QRCLAW_DEMO_PROVIDER_FALLBACK === '1') {
      const finalMessage = `${demoProviderDisplayName(started.provider)} 对话成功`;
      await emitRhythmSlicedCompletion(finalMessage, {
        runId: activeRunId,
        model: activeModel,
        res,
        markTextDelta: () => {
          wroteTextDelta = true;
        },
        hasTextDelta: () => wroteTextDelta,
        isFinished: () => finished,
        finish,
      });
      return;
    }

    if (started.status === 'pending') {
      if (streamOpened) {
        finish('error', { content: '[host unavailable]' });
      } else {
        res.status(502).json({
          error: { code: 'host_unavailable', message: 'Host is offline' },
        });
      }
    }
  } catch (err) {
    cleanup();
    if (streamOpened) {
      safeLog('warn', '[OwnerAgentChat/SSE] stream failed after open', {
        run_id: activeRunId,
        agent_id: agentId,
        err_message: (err as Error).message,
      });
      finish('error', { content: '[run error]' });
      return;
    }
    if (err instanceof OwnerAgentChatServiceError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    safeLog('error', '[OwnerAgentChat/SSE] failed before open', {
      user_id: user.id,
      agent_id: agentId,
      err_message: (err as Error).message,
    });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to start run' } });
  }
};

interface FrameHandlerContext {
  runId: string;
  model: string;
  res: Response;
  markTextDelta: () => void;
  hasTextDelta: () => boolean;
  isFinished: () => boolean;
  finish: (reason: string, delta?: OpenAiDelta) => void;
}

const handleRunStreamFrame = async (
  payload: RunStreamFrame,
  ctx: FrameHandlerContext,
): Promise<void> => {
  if (payload.kind === 'accepted') {
    ctx.res.write(`: accepted host=${payload.frame.payload.host_id}\n\n`);
    return;
  }
  if (payload.kind === 'event') {
    const event = payload.frame.payload;
    if (event.event_type === 'text' && typeof event.content === 'string') {
      ctx.markTextDelta();
      ctx.res.write(formatOpenAIChatChunkForTest(ctx.runId, ctx.model, { content: event.content }));
      return;
    }
    if (event.event_type === 'tool_result' || event.event_type === 'status') {
      ctx.res.write(`: ${event.event_type} seq=${event.seq}\n\n`);
      return;
    }
    if (event.event_type === 'tool_use') {
      ctx.res.write(`: tool_use seq=${event.seq}\n\n`);
      return;
    }
    if (event.event_type === 'error') {
      ctx.finish('error', { content: '[run error]' });
    }
    return;
  }
  if (payload.kind === 'completed') {
    const finalMessage = payload.frame.payload.final_message;
    if (typeof finalMessage === 'string' && finalMessage.length > 0) {
      if (ctx.hasTextDelta()) {
        ctx.finish('stop');
        return;
      }
      await emitCompletionChunks(finalMessage, ctx);
      return;
    }
    ctx.finish('stop');
    return;
  }
  if (payload.kind === 'failed') {
    const { error_code } = payload.frame.payload;
    const message =
      typeof error_code === 'string' && error_code.trim().length > 0
        ? `Agent execution failed (${error_code}). Please check this local agent setup.`
        : 'Agent execution failed. Please check this local agent setup.';
    ctx.finish('error', { content: message });
    return;
  }
  ctx.finish('error', { content: 'Agent execution failed. Please check this local agent setup.' });
};

const handleRunStreamFrameSafe = (payload: RunStreamFrame, ctx: FrameHandlerContext): void => {
  void handleRunStreamFrame(payload, ctx).catch((err) => {
    safeLog('error', '[OwnerAgentChat/SSE] stream frame handler failed', {
      run_id: ctx.runId,
      kind: payload.kind,
      err_message: (err as Error).message,
    });
    if (!ctx.isFinished()) {
      ctx.finish('error', { content: '[run error]' });
    }
  });
};

const demoProviderDisplayName = (provider: string): string => {
  switch (provider) {
    case 'codex':
      return 'Codex Assistant';
    case 'cursor':
      return 'Cursor Assistant';
    case 'claude':
      return 'Claude Assistant';
    case 'openclaw':
      return 'OpenClaw Assistant';
    case 'pi':
      return 'Pi Assistant';
    default:
      return provider;
  }
};

const getMessages = (body: unknown): Array<{ role: string; content: unknown }> => {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return [];
  }
  return body.messages.filter((message): message is { role: string; content: unknown } => (
    isRecord(message) && typeof message.role === 'string' && 'content' in message
  ));
};

const getRequestedModel = (body: unknown): string | null => (
  isRecord(body) && typeof body.model === 'string' ? body.model : null
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const RHYTHM_CHUNK_DELAY_MS = 12;
const RHYTHM_MIN_CHUNKS = 4;
const RHYTHM_TARGET_CHUNK_SIZE = 6;
const INSTANT_EMIT_MAX_GRAPHEMES = 96;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const sliceForRhythm = (text: string): string[] => {
  const graphemes = Array.from(text);
  if (graphemes.length === 0) {
    return [];
  }
  // Aim for ~15-40 chunks regardless of total length.
  const targetChunks = Math.max(
    Math.ceil(graphemes.length / RHYTHM_TARGET_CHUNK_SIZE),
    RHYTHM_MIN_CHUNKS
  );
  const chunkSize = Math.max(1, Math.ceil(graphemes.length / targetChunks));
  const chunks: string[] = [];
  for (let i = 0; i < graphemes.length; i += chunkSize) {
    chunks.push(graphemes.slice(i, i + chunkSize).join(''));
  }
  return chunks;
};

const emitCompletionChunks = async (
  finalMessage: string,
  ctx: FrameHandlerContext
): Promise<void> => {
  const graphemes = Array.from(finalMessage);
  if (graphemes.length === 0) {
    if (!ctx.isFinished()) {
      ctx.finish('stop');
    }
    return;
  }

  // Short replies should appear immediately — no artificial typing cadence.
  if (graphemes.length <= INSTANT_EMIT_MAX_GRAPHEMES) {
    if (ctx.isFinished()) {
      return;
    }
    ctx.markTextDelta();
    ctx.res.write(
      formatOpenAIChatChunkForTest(ctx.runId, ctx.model, { content: finalMessage }),
    );
    ctx.finish('stop');
    return;
  }

  const chunks = sliceForRhythm(finalMessage);
  for (let i = 0; i < chunks.length; i += 1) {
    if (ctx.isFinished()) {
      return;
    }
    ctx.markTextDelta();
    ctx.res.write(
      formatOpenAIChatChunkForTest(ctx.runId, ctx.model, { content: chunks[i] }),
    );
    if (i < chunks.length - 1) {
      await sleep(RHYTHM_CHUNK_DELAY_MS);
    }
  }
  if (!ctx.isFinished()) {
    ctx.finish('stop');
  }
};

/** @deprecated alias kept for tests/docs referencing the old name */
const emitRhythmSlicedCompletion = emitCompletionChunks;

export const ownerAgentChatSseRouter = Router();
ownerAgentChatSseRouter.post(
  '/api/owner/agents/:agentId/chat',
  jwtAuthMiddleware,
  handleOwnerAgentChatSse
);
