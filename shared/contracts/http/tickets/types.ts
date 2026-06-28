// Dependency-free TypeScript interfaces for /api/*-ws-ticket request bodies.
// Web imports types only (no zod); gateway imports protocol.ts alongside.
// DO NOT import any library from this file.

export interface VisitorWsTicketRequest {
  qr_code_id: string;
  session_token?: string;
}

export interface AgentWsTicketRequest {}
