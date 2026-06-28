/**
 * Unit tests for mask utility functions.
 * Tests maskString, maskApiKey, maskSessionToken, and maskEmail.
 */
import { describe, it, expect } from 'vitest';
import { maskString, maskApiKey, maskSessionToken, maskEmail } from '@/lib/utils/mask';

describe('maskString', () => {
  it('should mask middle portion of a long string', () => {
    expect(maskString('sk-abc123xyz789', 3, 3)).toBe('sk-********789');
  });

  it('should mask with default prefix/suffix of 4', () => {
    expect(maskString('abcdefghijklmnop')).toBe('abcd********mnop');
  });

  it('should mask entire string when shorter than prefix + suffix', () => {
    expect(maskString('short', 4, 4)).toBe('*****');
  });

  it('should mask entire string when equal to prefix + suffix', () => {
    expect(maskString('abcdefgh', 4, 4)).toBe('********');
  });

  it('should handle single character string', () => {
    expect(maskString('a', 4, 4)).toBe('*');
  });

  it('should handle empty string', () => {
    expect(maskString('', 4, 4)).toBe('');
  });

  it('should cap masked portion at 8 asterisks', () => {
    const longString = 'a'.repeat(100);
    const result = maskString(longString, 4, 4);
    // prefix(4) + 8 asterisks + suffix(4) = 16 chars
    expect(result.length).toBe(16);
    expect(result).toBe('aaaa********aaaa');
  });

  it('should handle custom prefix/suffix', () => {
    expect(maskString('hello-world', 2, 2)).toBe('he*******ld');
  });
});

describe('maskApiKey', () => {
  it('should show first 4 and last 4 characters', () => {
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const result = maskApiKey(key);
    expect(result.startsWith('eyJh')).toBe(true);
    expect(result.endsWith('VCJ9')).toBe(true);
    expect(result).toContain('****');
  });

  it('should mask short keys entirely', () => {
    expect(maskApiKey('abc')).toBe('***');
  });
});

describe('maskSessionToken', () => {
  it('should show first 4 and last 4 characters', () => {
    const token = 'sess_abc123def456';
    const result = maskSessionToken(token);
    expect(result.startsWith('sess')).toBe(true);
    expect(result.endsWith('f456')).toBe(true);
  });
});

describe('maskEmail', () => {
  it('should mask email showing first 2 chars and full domain', () => {
    expect(maskEmail('user@example.com')).toBe('us**@example.com');
  });

  it('should handle short local part', () => {
    expect(maskEmail('a@example.com')).toBe('a@example.com');
  });

  it('should handle email with no @ sign', () => {
    const result = maskEmail('notanemail');
    expect(result).toContain('*');
    expect(result).not.toContain('@');
  });

  it('should handle email starting with @', () => {
    const result = maskEmail('@example.com');
    // atIndex is 0, which is <= 0, so falls back to maskString
    expect(result).toContain('*');
  });

  it('should handle long local part', () => {
    const result = maskEmail('verylongemail@example.com');
    expect(result.startsWith('ve')).toBe(true);
    expect(result).toContain('@example.com');
  });

  it('should cap masked local part at 5 asterisks', () => {
    const result = maskEmail('verylonglocalpart@domain.com');
    const atIdx = result.indexOf('@');
    const maskedPart = result.slice(2, atIdx);
    expect(maskedPart.length).toBeLessThanOrEqual(5);
    expect(maskedPart).toMatch(/^\*+$/);
  });
});
