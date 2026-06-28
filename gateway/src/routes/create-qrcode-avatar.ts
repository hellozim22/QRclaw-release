import { randomUUID } from 'crypto';
import { PROFILE_AVATAR_MAX_DATA_URL_CHARS } from '../../../shared/contracts/http/qrcodes/types.js';

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i;
const MAX_DECODED_BYTES = 512 * 1024;

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_RIFF = Buffer.from('RIFF');
const WEBP_WEBP = Buffer.from('WEBP');

export type DecodedAvatar = {
  buffer: Buffer;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  fileExt: 'png' | 'jpg' | 'webp';
};

function mimeToRecord(mimeGroup: string): {
  contentType: DecodedAvatar['contentType'];
  fileExt: DecodedAvatar['fileExt'];
} {
  const g = mimeGroup.toLowerCase();
  if (g === 'png') return { contentType: 'image/png', fileExt: 'png' };
  if (g === 'jpeg' || g === 'jpg') return { contentType: 'image/jpeg', fileExt: 'jpg' };
  return { contentType: 'image/webp', fileExt: 'webp' };
}

type DetectedKind = 'png' | 'jpeg' | 'webp' | null;

function detectImageKind(buf: Buffer): DetectedKind {
  if (buf.length < 12) return null;
  if (buf.subarray(0, PNG_SIG.length).equals(PNG_SIG)) return 'png';
  if (buf.subarray(0, JPEG_SIG.length).equals(JPEG_SIG)) return 'jpeg';
  if (buf.subarray(0, 4).equals(WEBP_RIFF) && buf.subarray(8, 12).equals(WEBP_WEBP)) return 'webp';
  return null;
}

/**
 * Parse and validate a data-URL avatar: size cap, base64 decode, magic-byte image check.
 * Returns null if the value should be ignored (omit from profile, optional caller warning).
 */
export function tryDecodeProfileAvatarDataUrl(value: string): DecodedAvatar | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length >= PROFILE_AVATAR_MAX_DATA_URL_CHARS
  ) {
    return null;
  }
  const match = value.match(DATA_URL_RE);
  if (!match) return null;
  const mimeGroup = match[1];
  const b64 = match[2]?.replace(/\s/g, '') ?? '';
  if (!b64) return null;

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_DECODED_BYTES) return null;
  const detected = detectImageKind(buf);
  if (!detected) return null;

  const declared = mimeToRecord(mimeGroup);
  if (declared.fileExt === 'jpg' && detected !== 'jpeg') return null;
  if (declared.fileExt === 'png' && detected !== 'png') return null;
  if (declared.fileExt === 'webp' && detected !== 'webp') return null;

  const { contentType, fileExt } = declared;
  return { buffer: buf, contentType, fileExt };
}

export function buildQrAvatarObjectPath(userId: string, slug: string, fileExt: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, '');
  return `profiles/${safeUser || 'user'}/${safeSlug || 'qr'}-${randomUUID()}.${fileExt}`;
}
