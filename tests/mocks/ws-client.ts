import { vi } from 'vitest';

export const createMockWsClient = () => {
  const messages: unknown[] = [];
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  return {
    send: vi.fn((data: string) => {
      messages.push(JSON.parse(data));
    }),
    close: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, [...existing, handler]);
    }),
    readyState: 1, // WebSocket.OPEN
    _messages: messages,
    _emit: (event: string, ...args: unknown[]) => {
      const handlers = listeners.get(event) ?? [];
      handlers.forEach((h) => h(...args));
    },
  };
};
