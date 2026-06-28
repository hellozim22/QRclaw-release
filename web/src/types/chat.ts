// Chat domain types

export interface ChatMessage {
  id: string;
  content: string;
  contentType: 'text' | 'markdown' | 'image_url' | 'file_url';
  senderType: 'visitor' | 'agent';
  timestamp: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface StreamingState {
  messageId: string;
  content: string;
  sequence: number | undefined;
}
