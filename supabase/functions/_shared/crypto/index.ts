/**
 * Barrel export for the Deno crypto port.
 * M3 Iron Rule C2: content decryption stays in memory, never logged.
 */
export { decryptEnvelope, base64ToBytes } from './envelope.ts';
export type { EncryptedEnvelope } from './envelope.ts';
export {
  decryptDek,
  readKekBytes,
  byteaToUtf8String,
  KekMissingError,
  DekFormatError,
} from './key-manager.ts';
export { hexToBytes, bytesToHex } from './hex.ts';
