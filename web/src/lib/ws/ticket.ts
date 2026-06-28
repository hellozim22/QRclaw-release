// Visitor WebSocket ticket acquisition
// Fetches a short-lived JWT ticket from the Gateway before WS connection

import type { VisitorWsTicketRequest } from '@shared/contracts/http/tickets/types';

interface VisitorTicketResponse {
  ticket: string;
  sessionToken: string;
  expiresIn: number;
  gatewayWsUrl: string;
}

interface TicketApiError {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Fetch a visitor WebSocket ticket from the Gateway HTTP API.
 * Must be called before opening the WS connection.
 *
 * If a session_token is cached in localStorage for this qrCodeId, it is sent
 * to the Gateway so the visitor resumes their existing conversation.
 *
 * @param qrCodeId - The QR code UUID the visitor scanned
 * @param gatewayHttpUrl - Base HTTP URL of the Gateway (e.g. https://gateway-test.qrclaw.ai)
 * @returns Ticket JWT, session token, and connection metadata
 */
export const fetchVisitorTicket = async (
  qrCodeId: string,
  gatewayHttpUrl: string
): Promise<VisitorTicketResponse> => {
  const url = `${gatewayHttpUrl}/api/visitor-ws-ticket`;

  // Try to resume existing session from localStorage
  const storageKey = `qrclaw_session_${qrCodeId}`;
  const cachedSessionToken =
    typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;

  const requestBody: VisitorWsTicketRequest = { qr_code_id: qrCodeId };
  if (cachedSessionToken) {
    requestBody.session_token = cachedSessionToken;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    let message = `Ticket request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as TicketApiError;
      if (body?.error?.message) {
        message = body.error.message;
      }
    } catch {
      // Non-JSON error response — use default message
    }
    throw new Error(message);
  }

  interface TicketApiResponse {
    data: {
      ticket: string;
      session_token: string;
      expires_in: number;
      gateway_url: string;
    };
  }

  const body = (await res.json()) as TicketApiResponse;

  // Persist session token for conversation resumption on refresh
  const sessionToken = body.data.session_token;
  if (typeof window !== 'undefined' && sessionToken) {
    localStorage.setItem(storageKey, sessionToken);
  }

  return {
    ticket: body.data.ticket,
    sessionToken,
    expiresIn: body.data.expires_in,
    gatewayWsUrl: body.data.gateway_url,
  };
};
