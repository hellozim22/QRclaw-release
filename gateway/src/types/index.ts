/**
 * QRClaw Gateway — Shared TypeScript types
 * Based on §P1 WebSocket message frame formats
 */

import type { SecurityEnvelope } from '../../../shared/contracts/ws/types.js';

// ─── WebSocket Frame Base ───────────────────────────────────────────

export interface WSFrame {
  type: string;
  id?: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

// ─── Content Types ──────────────────────────────────────────────────

export type VisitorContentType = 'text' | 'image_url' | 'file_url';
export type AgentContentType = 'text' | 'markdown' | 'image_url' | 'file_url';
export type SenderType = 'visitor' | 'agent';
export type ConnectionRole = SenderType | 'host' | 'owner';

// ─── Client → Gateway Messages ──────────────────────────────────────

export interface VisitorMessageFrame extends WSFrame {
  type: 'visitor_message';
  id: string;
  payload: {
    content: string;
    content_type: VisitorContentType;
    metadata?: Record<string, unknown>;
  };
}

export interface AgentMessageFrame extends WSFrame {
  type: 'agent_message';
  id: string;
  payload: {
    content: string;
    content_type: AgentContentType;
    conversation_id: string;
    is_final?: boolean;
    metadata?: Record<string, unknown>;
  };
}

export interface StreamChunkFrame extends WSFrame {
  type: 'stream_chunk';
  id: string;
  payload: {
    conversation_id: string;
    delta: string;
    sequence?: number;
    is_final?: boolean;
  };
}

export interface AgentTypingFrame extends WSFrame {
  type: 'agent_typing';
  payload: {
    conversation_id: string;
  };
}

export interface StreamEndFrame extends WSFrame {
  type: 'stream_end';
  id: string;
  payload: {
    conversation_id: string;
    total_chunks: number;
    total_length?: number;
  };
}

export interface PingFrame {
  type: 'ping';
  timestamp: string;
}

export interface ReadReceiptFrame extends WSFrame {
  type: 'read_receipt';
  payload: {
    message_ids: string[];
  };
}

// ─── Gateway → Client Messages ──────────────────────────────────────

export interface ConnectionAckFrame extends WSFrame {
  type: 'connection_ack';
  payload: {
    connection_id: string;
    heartbeat_interval_ms: number;
    server_time?: string;
  };
}

export interface AckFrame extends WSFrame {
  type: 'ack';
  payload: {
    message_id: string;
    status: AckStatus;
    error_code?: string;
    error_message?: string;
  };
}

export interface MessageFrame extends WSFrame {
  type: 'message';
  id: string;
  payload: {
    content: string;
    content_type: AgentContentType;
    sender_type: SenderType;
    conversation_id: string;
    security_envelope?: SecurityEnvelope;
  };
}

export interface PongFrame {
  type: 'pong';
  timestamp: string;
}

export interface ErrorFrame extends WSFrame {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface SystemFrame extends WSFrame {
  type: 'system';
  payload: {
    event: SystemEvent;
    data?: Record<string, unknown>;
  };
}

// ─── Enums / Unions ─────────────────────────────────────────────────

export type AckStatus = 'sent' | 'delivered' | 'read' | 'failed';

export type ProtocolAckStatus =
  | 'accepted'
  | 'duplicate'
  | 'rejected:agent_unreachable'
  | 'rejected:qrcode_disabled'
  | 'rejected:quota_exceeded'
  | 'rejected:invalid_session'
  | 'rejected:message_too_large';

export type MessageStatus = 'persisted' | 'dispatched' | 'interrupted' | 'failed';

export type FailureReason =
  | 'agent_unreachable'
  | 'gateway_internal_error'
  | 'stream_timeout'
  | 'stream_aborted';

export type SystemEvent =
  | 'agent_online'
  | 'agent_offline'
  | 'qrcode_paused'
  | 'qrcode_activated'
  | 'session_expired';

export type ClientMessageType =
  | 'visitor_message'
  | 'agent_message'
  | 'stream_chunk'
  | 'stream_end'
  | 'ping'
  | 'read_receipt'
  | 'auth';

// ─── Auth Frame (Client → Gateway, post-connect) ──────────────────

export interface AuthFrame {
  type: 'auth';
  timestamp: string;
  payload: {
    ticket: string;
    session_token?: string;
  };
}

export type GatewayMessageType =
  | 'connection_ack'
  | 'ack'
  | 'message'
  | 'stream_chunk'
  | 'stream_end'
  | 'pong'
  | 'error'
  | 'system';

// ─── WebSocket Close Codes ──────────────────────────────────────────

export const WS_CLOSE_CODES = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  MISSING_TICKET: 4001,
  INVALID_TICKET: 4003,
  QRCODE_PAUSED: 4004,
  QRCODE_NOT_FOUND: 4005,
  RATE_LIMITED: 4008,
  SESSION_EXPIRED: 4009,
  DUPLICATE_CONNECTION: 4010,
  SERVER_BUSY: 4429,
  INTERNAL_ERROR: 4500,
} as const;

export type WSCloseCode = (typeof WS_CLOSE_CODES)[keyof typeof WS_CLOSE_CODES];

// ─── Security Envelope ──────────────────────────────────────────────
// Moved to `shared/contracts/ws/types.ts` in Phase 2 Wave 2 so the
// outbound Zod barrel (`ws/outbound.ts`) can depend on it without
// reaching into gateway internals. Existing gateway imports stay valid
// through this re-export shim.

export type { SecurityEnvelope } from '../../../shared/contracts/ws/types.js';

// ─── Connection / Session ───────────────────────────────────────────

export interface ConnectionInfo {
  connectionId: string;
  role: ConnectionRole;
  agentId?: string;
  ownerId?: string;
  hostId?: string;
  tokenId?: string;
  hostTokenScope?: Record<string, unknown>;
  sessionToken?: string;
  qrCodeId?: string;
  connectedAt: string;
}

// ─── WS Ticket Payload ─────────────────────────────────────────────

export interface TicketPayload {
  role: ConnectionRole;
  sessionToken?: string;
  agentId?: string;
  ownerId?: string;
  qrCodeId?: string;
  iat?: number;
  exp?: number;
}

// ─── JWT Auth (HTTP) ───────────────────────────────────────────────

export interface AuthUser {
  id: string;
  role: string;
}

// ─── Rate Limit Config ─────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ─── Health Check ───────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  timestamp: string;
  redis?: 'connected' | 'disconnected';
}
