/**
 * Hex utilities shared between envelope and DEK unwrap.
 * Kept in its own module so both callers do not import base64 machinery.
 */

const HEX_PATTERN = /^[0-9a-fA-F]*$/;

/**
 * Strict hex → bytes.
 *
 * M3-C1 SEC-L-1: the previous version relied on `parseInt(..., 16)` which
 * silently coerces non-hex input (e.g. 'zz' → NaN → 0), masking configuration
 * bugs as successful decodes. We now reject any non-[0-9a-fA-F] character up
 * front so KEK / DEK / envelope fields fail fast with a clear message.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('hex string must have even length');
  }
  if (!HEX_PATTERN.test(hex)) {
    throw new Error('hex string contains non-hex characters');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
