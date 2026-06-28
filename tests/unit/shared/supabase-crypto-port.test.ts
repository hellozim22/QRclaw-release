/**
 * M3-T1: Deno crypto port algorithmic parity test.
 *
 * Why this exists:
 *   supabase/functions/_shared/crypto/*.ts is Deno-only code that cannot be
 *   imported here (ts extension specifiers + Deno.env). Instead of duplicating
 *   the whole module, this test inlines the *same byte operations* the Deno
 *   port uses (Web Crypto `subtle.decrypt` + the ivHex:encHex:tagHex wire
 *   format) and feeds it real ciphertext produced by gateway/src/crypto/*.
 *
 *   If the gateway's `encrypt()` output can be decrypted by this Web-Crypto
 *   implementation, then the Deno port (which is a character-by-character
 *   translation of the same bytes ops, see sibling .ts files) is also correct.
 *
 * Red line: if this test fails, do NOT deploy the decrypted-messages Edge
 * Function — the owner/agent/visitor history path will silently return
 * `[decryption_failed]`.
 */

import { describe, it, expect } from 'vitest';
import { randomBytes, createCipheriv } from 'node:crypto';
import { encrypt } from '../../../gateway/src/crypto/envelope.js';

// ---- Inline port of supabase/functions/_shared/crypto/{envelope,key-manager,hex}.ts
// Any change here MUST be mirrored in the Deno files (and vice-versa).

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = Buffer.from(b64, 'base64');
  return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
}

async function portedDecryptEnvelope(
  envelope: { ciphertext: string; iv: string; tag: string },
  rawDek: Uint8Array
): Promise<string> {
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const tag = base64ToBytes(envelope.tag);

  const cipherAndTag = new Uint8Array(ciphertext.length + tag.length);
  cipherAndTag.set(ciphertext, 0);
  cipherAndTag.set(tag, ciphertext.length);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    rawDek,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const plaintextBuffer = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    cipherAndTag
  );
  return new TextDecoder().decode(plaintextBuffer);
}

async function portedDecryptDek(
  encryptedDekString: string,
  kekBytes: Uint8Array
): Promise<Uint8Array> {
  const [ivHex, encHex, tagHex] = encryptedDekString.split(':');
  const iv = hexToBytes(ivHex);
  const encrypted = hexToBytes(encHex);
  const tag = hexToBytes(tagHex);

  const cipherAndTag = new Uint8Array(encrypted.length + tag.length);
  cipherAndTag.set(encrypted, 0);
  cipherAndTag.set(tag, encrypted.length);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    kekBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const dekBuffer = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    cipherAndTag
  );
  return new Uint8Array(dekBuffer);
}

// Helper: gateway-style KEK-wrap a DEK into "ivHex:encHex:tagHex".
function wrapDekWithKek(rawDek: Buffer, kek: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  const encrypted = Buffer.concat([cipher.update(rawDek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

describe('Deno crypto port algorithmic parity', () => {
  const kek = randomBytes(32);
  const dek = randomBytes(32);

  describe('decryptEnvelope', () => {
    it('decrypts gateway-produced AES-256-GCM envelope back to plaintext', async () => {
      const plaintext = 'Hello from gateway — 你好世界 🔐';
      const envelope = await encrypt(plaintext, 'dek_test_0001', dek);

      const roundTripped = await portedDecryptEnvelope(envelope, new Uint8Array(dek));

      expect(roundTripped).toBe(plaintext);
    });

    // M3-T6: the gateway no longer ships a decrypt counterpart. The round-trip
    // is already covered by the ported `decryptEnvelope` above, which replays
    // the exact byte ops the Deno Edge Function runs.
    it('produces different ciphertext per call (IV is random)', async () => {
      const envA = await encrypt('same text', 'dek_x', dek);
      const envB = await encrypt('same text', 'dek_x', dek);

      expect(envA.iv).not.toBe(envB.iv);
      expect(envA.ciphertext).not.toBe(envB.ciphertext);
    });

    it('fails auth when DEK bytes are wrong (GCM tag mismatch)', async () => {
      const envelope = await encrypt('secret', 'dek_x', dek);
      const wrongDek = randomBytes(32);

      await expect(portedDecryptEnvelope(envelope, new Uint8Array(wrongDek))).rejects.toThrow();
    });
  });

  describe('decryptDek (KEK unwrap)', () => {
    it('unwraps gateway-style "ivHex:encHex:tagHex" DEK with KEK', async () => {
      const encryptedDek = wrapDekWithKek(dek, kek);

      const unwrapped = await portedDecryptDek(encryptedDek, new Uint8Array(kek));

      expect(Buffer.from(unwrapped).equals(dek)).toBe(true);
    });

    it('fails when KEK is wrong', async () => {
      const encryptedDek = wrapDekWithKek(dek, kek);
      const wrongKek = randomBytes(32);

      await expect(portedDecryptDek(encryptedDek, new Uint8Array(wrongKek))).rejects.toThrow();
    });
  });

  describe('end-to-end (KEK → DEK → message)', () => {
    it('decrypts a message using only the DB wire format', async () => {
      const plaintext = 'visitor message 1';
      const envelope = await encrypt(plaintext, 'dek_e2e_0001', dek);
      const encryptedDekString = wrapDekWithKek(dek, kek);

      // Mirror the Edge Function call chain:
      //   1. Pull encryption_keys.key_data_encrypted → decode bytea → UTF-8
      //      string (we skip the bytea decode here; that's byteaToUtf8String,
      //      covered by its own test below).
      //   2. decryptDek(string, kek)  → raw DEK.
      //   3. decryptEnvelope(envelope, dek) → plaintext.
      const dekBytes = await portedDecryptDek(encryptedDekString, new Uint8Array(kek));
      const roundTripped = await portedDecryptEnvelope(envelope, dekBytes);

      expect(roundTripped).toBe(plaintext);
    });
  });

  describe('byteaToUtf8String semantics (documented only)', () => {
    // The Deno module accepts three bytea shapes returned by supabase-js:
    //   (a) Uint8Array  → decode as UTF-8
    //   (b) `\x<hex>`  → hex-decode then UTF-8
    //   (c) plain string → pass through
    // Case (b) in TS regex form: raw starts with literal backslash-x.
    it('(b) hex-escaped bytea maps back to original UTF-8', () => {
      const original = 'ivHex:encHex:tagHex';
      const hexEscaped = `\\x${Buffer.from(original, 'utf8').toString('hex')}`;

      const stripped = hexEscaped.startsWith('\\x') ? hexEscaped.slice(2) : hexEscaped;
      const decoded = new TextDecoder().decode(hexToBytes(stripped));

      expect(decoded).toBe(original);
    });
  });
});
