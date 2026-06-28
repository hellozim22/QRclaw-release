// Fetch message history from Gateway API
// Returns decrypted messages for a conversation (qr_code_id + session_token)

import type { ChatMessage } from '@/types/chat';
import type { MessagesHistoryRequest } from '@shared/contracts/http/messages/types';

interface HistoryMessage {
  id: string;
  content: string;
  role: 'visitor' | 'agent';
  sent_at: string;
}

/**
 * Fetch decrypted message history from Gateway.
 * @param qrCodeId - QR Code ID to identify the conversation
 * @param sessionToken - Visitor session token
 * @param gatewayHttpUrl - Gateway base URL (defaults to NEXT_PUBLIC_GATEWAY_URL)
 * @returns Array of ChatMessage objects sorted by sent_at ascending
 */
export const fetchMessageHistory = async (
  qrCodeId: string,
  sessionToken: string,
  gatewayHttpUrl?: string
): Promise<ChatMessage[]> => {
  const baseUrl =
    gatewayHttpUrl || process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway-test.qrclaw.ai';
  const url = `${baseUrl}/api/messages`;

  const requestBody: MessagesHistoryRequest = {
    qr_code_id: qrCodeId,
    session_token: sessionToken,
    limit: 50,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) return [];

  const body = (await response.json()) as { data?: { messages?: HistoryMessage[] } };
  const messages = body.data?.messages ?? [];

  return messages.map(
    (msg): ChatMessage => ({
      id: msg.id,
      content: msg.content,
      contentType: msg.role === 'agent' ? 'markdown' : 'text',
      senderType: msg.role,
      timestamp: msg.sent_at,
      status: 'delivered',
    })
  );
};
