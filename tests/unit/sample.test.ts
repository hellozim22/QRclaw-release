import { describe, it, expect } from 'vitest';

describe('Sample Unit Tests', () => {
  describe('basic math operations', () => {
    it('should add two numbers correctly', () => {
      const result = 2 + 3;
      expect(result).toBe(5);
    });

    it('should handle string concatenation', () => {
      const greeting = 'Hello';
      const name = 'QRClaw';
      expect(`${greeting}, ${name}!`).toBe('Hello, QRClaw!');
    });
  });

  describe('UUID format validation', () => {
    it('should match UUID v4 pattern', () => {
      const uuid = crypto.randomUUID();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidPattern);
    });
  });

  describe('immutability patterns', () => {
    it('should create new object instead of mutating', () => {
      const original = { name: 'test', value: 1 };
      const updated = { ...original, value: 2 };

      expect(original.value).toBe(1);
      expect(updated.value).toBe(2);
      expect(original).not.toBe(updated);
    });

    it('should create new array instead of mutating', () => {
      const original = [1, 2, 3];
      const updated = [...original, 4];

      expect(original).toHaveLength(3);
      expect(updated).toHaveLength(4);
    });
  });
});
