import { vi } from 'vitest';

export const createMockRedis = () => {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    get: vi.fn(async (key: string): Promise<string | null> => {
      const item = store.get(key);
      if (!item || item.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return item.value;
    }),
    setex: vi.fn(async (key: string, ttl: number, value: string): Promise<void> => {
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    }),
    del: vi.fn(async (key: string): Promise<void> => {
      store.delete(key);
    }),
    eval: vi.fn(
      async (_script: string, _numKeys: number, ...keys: string[]): Promise<string | null> => {
        const key = keys[0];
        const item = store.get(key);
        if (item && item.expiresAt > Date.now()) {
          store.delete(key);
          return item.value;
        }
        return null;
      }
    ),
    ping: vi.fn(async (): Promise<string> => 'PONG'),
    disconnect: vi.fn(async (): Promise<void> => {
      store.clear();
    }),
    _store: store,
  };
};
