/**
 * TDD RED: Tests for ping frame schema validation.
 * Bug: pingFrameSchema.strict() rejects ping frames with payload:{}.
 * Fix: Allow optional empty payload on ping frames.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { validateFrame } from '../../../gateway/src/ws/schemas.js';

describe('ping frame schema', () => {
  it('should accept ping frame without payload', () => {
    const result = validateFrame({
      type: 'ping',
      timestamp: '2026-03-24T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('should accept ping frame with empty payload', () => {
    // Client sends { type: 'ping', timestamp: '...', payload: {} }
    const result = validateFrame({
      type: 'ping',
      timestamp: '2026-03-24T00:00:00Z',
      payload: {},
    });
    expect(result.success).toBe(true);
  });

  it('should reject ping frame without timestamp', () => {
    const result = validateFrame({ type: 'ping' });
    expect(result.success).toBe(false);
  });

  it('should reject ping frame with extra unknown fields', () => {
    const result = validateFrame({
      type: 'ping',
      timestamp: '2026-03-24T00:00:00Z',
      payload: {},
      malicious: 'data',
    });
    expect(result.success).toBe(false);
  });
});
