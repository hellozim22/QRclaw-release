import { describe, expect, it } from 'vitest';
import { createCipheriv, randomBytes } from 'crypto';
import { byteaToUtf8String, unwrapDEK } from '../../../gateway/src/crypto/dek-unwrap.js';

describe('dek-unwrap', () => {
  it('round-trips a KEK-wrapped DEK string', () => {
    const kekHex = randomBytes(32).toString('hex');
    const rawDek = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(kekHex, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update(rawDek), cipher.final()]);
    const tag = cipher.getAuthTag();
    const wrapped = `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;

    const unwrapped = unwrapDEK(wrapped, kekHex);
    expect(unwrapped.equals(rawDek)).toBe(true);
  });

  it('decodes postgres bytea hex wrapper', () => {
    const text = 'aa:bb:cc';
    const bytea = `\\x${Buffer.from(text, 'utf8').toString('hex')}`;
    expect(byteaToUtf8String(bytea)).toBe(text);
  });
});
