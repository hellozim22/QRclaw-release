import { Router } from 'express';
import type { Request, Response } from 'express';
import { ownerAgentSendMessageRequestSchema } from '../../../shared/contracts/http/owner-agent-chat/protocol.js';
import type {
  OwnerAgentRunStatus,
  OwnerAgentSendMessageRequest,
} from '../../../shared/contracts/http/owner-agent-chat/types.js';
import { getOwnerAgentConversation, getOwnerByUserId } from '../db/owner-agent-chat.js';
import { jwtAuthMiddleware } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';
import { callDecryptedMessages } from '../services/decrypted-messages-client.js';
import {
  OwnerAgentChatServiceError,
  resendOwnerAgentMessage,
  resetOwnerAgentConversationContext,
  sendOwnerAgentMessage,
} from '../services/owner-agent-chat.js';
import type { AuthUser } from '../types/index.js';

interface OwnerAgentHistoryMessage {
  id: string;
  sender_type: 'owner' | 'agent' | 'system';
  content: string;
  status: 'sending' | 'sent' | 'failed';
  run_id: string | null;
  run_status?: OwnerAgentRunStatus;
  created_at: string;
}

export const handleSendOwnerAgentMessage = async (req: Request, res: Response): Promise<void> => {
  await handleOwnerAgentMessage(req, res, 'send');
};

export const handleResendOwnerAgentMessage = async (req: Request, res: Response): Promise<void> => {
  await handleOwnerAgentMessage(req, res, 'resend');
};

export const handleResetOwnerAgentConversation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    const agentId = getSingleParam(req.params.agentId);
    if (!agentId) {
      res.status(400).json({ error: { code: 'invalid_request', message: 'Agent id is required' } });
      return;
    }

    const data = await resetOwnerAgentConversationContext(owner.id, agentId);
    res.status(200).json({ data });
  } catch (err) {
    if (err instanceof OwnerAgentChatServiceError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }

    console.error('[OwnerAgentMessages] Reset context failed:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to reset owner agent context' },
    });
  }
};

export const handleListOwnerAgentMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    const agentId = getSingleParam(req.params.agentId);
    if (!agentId) {
      res.status(400).json({ error: { code: 'invalid_request', message: 'Agent id is required' } });
      return;
    }

    const conversation = await getOwnerAgentConversation(owner.id, agentId);
    if (!conversation) {
      res.json({ data: [] });
      return;
    }

    const bearerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const result = await callDecryptedMessages(
      {
        actor: 'owner-private-agent-chat',
        conversation_id: conversation.id,
        limit: 100,
      },
      { bearerToken }
    );

    if (!result.ok) {
      if (result.error.code === 'forbidden' || result.error.code === 'not_found') {
        res.json({ data: [] });
        return;
      }
      console.error(
        '[OwnerAgentMessages] History read failed:',
        result.error.code,
        result.error.message
      );
      res
        .status(502)
        .json({ error: { code: 'history_unavailable', message: 'Failed to load messages' } });
      return;
    }

    const messages = result.data.data
      .slice()
      .reverse()
      .map(
        (message): OwnerAgentHistoryMessage => ({
          id: message.id,
          sender_type: message.sender_type as OwnerAgentHistoryMessage['sender_type'],
          content: message.content,
          status: message.status === 'failed' ? 'failed' : 'sent',
          run_id: message.run_id ?? null,
          run_status: message.sender_type === 'agent' ? 'completed' : undefined,
          created_at: message.persisted_at,
        })
      );

    res.json({ data: messages });
  } catch (err) {
    console.error('[OwnerAgentMessages] History request failed:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to load owner agent messages' },
    });
  }
};

const handleOwnerAgentMessage = async (
  req: Request,
  res: Response,
  mode: 'send' | 'resend'
): Promise<void> => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    const agentId = getSingleParam(req.params.agentId);
    if (!agentId) {
      res.status(400).json({ error: { code: 'invalid_request', message: 'Agent id is required' } });
      return;
    }

    const body = req.body as OwnerAgentSendMessageRequest;
    const response =
      mode === 'resend'
        ? await resendOwnerAgentMessage(owner.id, agentId, requiredRunId(req), body)
        : await sendOwnerAgentMessage(owner.id, agentId, body);

    res.status(201).json(response);
  } catch (err) {
    if (err instanceof OwnerAgentChatServiceError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }

    console.error('[OwnerAgentMessages] Request failed:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to send owner agent message' },
    });
  }
};

const requiredRunId = (req: Request): string => {
  const runId = getSingleParam(req.params.runId);
  if (!runId) {
    throw new OwnerAgentChatServiceError(400, 'invalid_request', 'Run id is required');
  }
  return runId;
};

const getSingleParam = (value: string | string[] | undefined): string | null => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
};

export const ownerAgentMessagesRouter = Router();
ownerAgentMessagesRouter.get(
  '/api/owner/agents/:agentId/messages',
  jwtAuthMiddleware,
  handleListOwnerAgentMessages
);
ownerAgentMessagesRouter.post(
  '/api/owner/agents/:agentId/messages',
  jwtAuthMiddleware,
  validateRequest(ownerAgentSendMessageRequestSchema),
  handleSendOwnerAgentMessage
);
ownerAgentMessagesRouter.post(
  '/api/owner/agents/:agentId/messages/:runId/resend',
  jwtAuthMiddleware,
  validateRequest(ownerAgentSendMessageRequestSchema),
  handleResendOwnerAgentMessage
);
ownerAgentMessagesRouter.post(
  '/api/owner/agents/:agentId/conversation/reset',
  jwtAuthMiddleware,
  handleResetOwnerAgentConversation
);
