import { randomUUID } from 'crypto';

export interface TestMessage {
  id: string;
  conversationId: string;
  senderType: 'visitor' | 'agent';
  content: string;
  clientMsgId: string;
  timestamp: string;
}

export const createTestMessage = (overrides: Partial<TestMessage> = {}): TestMessage => ({
  id: randomUUID(),
  conversationId: randomUUID(),
  senderType: 'visitor',
  content: 'Hello, this is a test message.',
  clientMsgId: `client_${randomUUID().replace(/-/g, '')}`,
  timestamp: new Date().toISOString(),
  ...overrides,
});

export const sampleVisitorMessage = createTestMessage({
  senderType: 'visitor',
  content: 'Hi, I have a question about your product.',
});

export const sampleAgentReply = createTestMessage({
  senderType: 'agent',
  content: 'Hello! How can I help you today?',
});

export const sampleStreamChunks = ['Hello', '! How', ' can I', ' help', ' you', ' today?'];
