/**
 * AES-256-GCM envelope encryption (write path only).
 *
 * M3-T6: the gateway's decrypt counterpart (`decrypt`, `decryptDEK`) was
 * retired. All read-path decryption now happens inside the
 * `decrypted-messages` Supabase Edge Function, which owns KEK access. The
 * gateway deliberately keeps only the encrypt side so the Node trust boundary
 * cannot reconstruct plaintext even in a compromise scenario — a tighter
 * reading of Iron Rule C2 ("Gateway stores but never reads message content").
 *
 * Per §3.2 / §10.3: encrypt message content before persistence.
 */
import { randomBytes, createCipheriv } from 'crypto';

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  tag: string;
  dekId: string;
  algorithm: 'aes-256-gcm';
}

/**
 * Encrypt plaintext content into an AES-256-GCM envelope.
 */
export const encrypt = async (
  plaintext: string,
  dekId: string,
  rawDek: Buffer
): Promise<EncryptedEnvelope> => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', rawDek, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    dekId,
    algorithm: 'aes-256-gcm',
  };
};
