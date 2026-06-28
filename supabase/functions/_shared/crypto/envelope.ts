/**
 * AES-256-GCM envelope decryption for Deno runtime.
 *
 * Port of gateway/src/crypto/envelope.ts to Deno + Web Crypto API.
 * Mirror format exactly — any divergence breaks owner/agent/visitor history reads.
 *
 * Envelope shape (base64):
 *   { ciphertext, iv, tag, dekId, algorithm: 'aes-256-gcm' }
 *
 * Web Crypto AES-GCM expects ciphertext || tag concatenated as a single buffer.
 * Node's crypto splits them — this module handles the glue.
 */

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  tag: string;
  dekId: string;
  algorithm: 'aes-256-gcm';
}

/**
 * Decrypt an envelope back to plaintext using a raw 32-byte DEK.
 *
 * @param envelope - Base64-encoded envelope persisted alongside the message.
 * @param rawDek   - 32 bytes of raw DEK material.
 * @returns UTF-8 plaintext.
 */
export async function decryptEnvelope(
  envelope: EncryptedEnvelope,
  rawDek: Uint8Array
): Promise<string> {
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const tag = base64ToBytes(envelope.tag);

  const cipherAndTag = new Uint8Array(ciphertext.length + tag.length);
  cipherAndTag.set(ciphertext, 0);
  cipherAndTag.set(tag, ciphertext.length);

  const cryptoKey = await crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    cipherAndTag
  );

  return new TextDecoder().decode(plaintextBuffer);
}

/**
 * Decode a base64-encoded string into raw bytes.
 * Handles both standard and URL-safe base64.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
