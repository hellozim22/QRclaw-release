/**
 * DEK unwrap using the Key Encryption Key (KEK) in Deno runtime.
 *
 * Port of gateway/src/crypto/key-manager.ts decryptDEK() to Deno + Web Crypto.
 *
 * Wire format (mirrors gateway, do not change):
 *   encryptedDek = `${ivHex}:${encHex}:${tagHex}` (all hex-encoded)
 *   All bytes are produced by AES-256-GCM using the KEK as key.
 *
 * Storage format (encryption_keys.key_data_encrypted bytea):
 *   bytea holds the UTF-8 bytes of the above string (see
 *   gateway/src/db/persist.ts:48 — `\\x` + Buffer.from(info.encryptedDek).toString('hex'))
 *
 * KEK env var: QRCLAW_KEK_V1 — 64-char hex (32 bytes).
 * Dev fallback (KEK missing) is intentionally NOT supported in Edge Functions —
 * production always carries a KEK. We throw instead so misconfiguration surfaces
 * immediately.
 */

import { hexToBytes } from './hex.ts';

const KEK_ENV_NAME = 'QRCLAW_KEK_V1';

export class KekMissingError extends Error {
  constructor() {
    super(`${KEK_ENV_NAME} is not configured`);
    this.name = 'KekMissingError';
  }
}

export class DekFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DekFormatError';
  }
}

/**
 * Read the KEK as raw bytes from the environment.
 * Throws KekMissingError if unset. Throws if not 32 bytes of hex.
 */
export function readKekBytes(): Uint8Array {
  const kekHex = Deno.env.get(KEK_ENV_NAME);
  if (!kekHex) {
    throw new KekMissingError();
  }
  if (kekHex.length !== 64) {
    throw new DekFormatError(
      `${KEK_ENV_NAME} must be 64 hex chars (32 bytes), got ${kekHex.length}`
    );
  }
  return hexToBytes(kekHex);
}

/**
 * Decrypt an encrypted DEK string ("ivHex:encHex:tagHex") using the KEK.
 *
 * The source may be either:
 *   (a) a plain string `"ivHex:encHex:tagHex"` — when Supabase returns bytea as
 *       a hex-escaped string starting with `\x`, this function accepts the
 *       raw text AFTER the caller has decoded the bytea to UTF-8.
 *   (b) bytes that already represent the UTF-8 string above.
 *
 * @returns Raw 32-byte DEK ready for AES-256-GCM envelope decryption.
 */
export async function decryptDek(
  encryptedDekString: string,
  kekBytes: Uint8Array
): Promise<Uint8Array> {
  const parts = encryptedDekString.split(':');
  if (parts.length !== 3) {
    throw new DekFormatError('encryptedDek must be "ivHex:encHex:tagHex"');
  }

  const [ivHex, encHex, tagHex] = parts;
  const iv = hexToBytes(ivHex);
  const encrypted = hexToBytes(encHex);
  const tag = hexToBytes(tagHex);

  const cipherAndTag = new Uint8Array(encrypted.length + tag.length);
  cipherAndTag.set(encrypted, 0);
  cipherAndTag.set(tag, encrypted.length);

  const cryptoKey = await crypto.subtle.importKey('raw', kekBytes, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);

  const dekBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, cipherAndTag);

  return new Uint8Array(dekBuffer);
}

/**
 * Decode a bytea cell returned by supabase-js into the UTF-8 string that
 * encryption_keys.key_data_encrypted holds.
 *
 * Supabase JS returns bytea as:
 *   - `\x` + hex string (most common)
 *   - base64 string (rare / driver-dependent)
 *   - Uint8Array (deno bun drivers in some versions)
 *
 * Gateway (`messages.ts:115-124`) applies the same normalisation pattern —
 * keep this file aligned if that one changes.
 */
export function byteaToUtf8String(raw: unknown): string {
  if (raw instanceof Uint8Array) {
    return new TextDecoder().decode(raw);
  }
  if (typeof raw === 'string') {
    if (raw.startsWith('\\x')) {
      return new TextDecoder().decode(hexToBytes(raw.slice(2)));
    }
    return raw;
  }
  throw new DekFormatError(`unsupported bytea representation: ${typeof raw}`);
}
