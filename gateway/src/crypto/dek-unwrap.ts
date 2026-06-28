/**
 * KEK unwrap for persisted DEKs — write-path only.
 *
 * Gateway must reload conversation DEKs after restart so new messages use the
 * same raw DEK as rows in owner_agent_conversation_keys / encryption_keys.
 * This unwraps DEKs only; message plaintext never crosses this boundary.
 */
import { createDecipheriv } from 'crypto';

export class DekFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DekFormatError';
  }
}

/**
 * Decrypt an encrypted DEK string ("ivHex:encHex:tagHex") using the KEK.
 * Mirrors supabase/functions/_shared/crypto/key-manager.ts decryptDek().
 */
export const unwrapDEK = (encryptedDekString: string, kekHex: string): Buffer => {
  const parts = encryptedDekString.split(':');
  if (parts.length !== 3) {
    throw new DekFormatError('encryptedDek must be "ivHex:encHex:tagHex"');
  }

  const [ivHex, encHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const kekBuffer = Buffer.from(kekHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', kekBuffer, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
};

/** Decode a Supabase bytea cell into the UTF-8 DEK wrapper string. */
export const byteaToUtf8String = (raw: unknown): string => {
  if (Buffer.isBuffer(raw)) {
    return raw.toString('utf8');
  }
  if (raw instanceof Uint8Array) {
    return Buffer.from(raw).toString('utf8');
  }
  if (typeof raw === 'string') {
    if (raw.startsWith('\\x')) {
      return Buffer.from(raw.slice(2), 'hex').toString('utf8');
    }
    return raw;
  }
  throw new DekFormatError(`unsupported bytea representation: ${typeof raw}`);
};
