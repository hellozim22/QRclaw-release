/**
 * Re-export of WebSocket frame types and the inbound-type tuple.
 * Source of truth: shared/contracts/ws/types.ts (consumed via @shared/contracts alias).
 * Web does not import runtime Zod schemas — gateway owns validation.
 */

export type {
  WSFrame,
  PingFrame,
  VisitorMessageFrame,
  AgentMessageFrame,
  StreamChunkFrame,
  StreamEndFrame,
  ReadReceiptFrame,
  AuthFrame,
  ConnectionAckFrame,
  AckFrame,
  MessageFrame,
  AgentTypingFrame,
  PongFrame,
  ErrorFrame,
  SystemFrame,
  ClientFrame,
  ServerFrame,
  InboundFrameType,
} from '@shared/contracts/ws/types';

export { INBOUND_FRAME_TYPES } from '@shared/contracts/ws/types';
