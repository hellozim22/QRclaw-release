import { describe, it, expect } from 'vitest';
import {
  tryDecodeProfileAvatarDataUrl,
  buildQrAvatarObjectPath,
} from '../../../gateway/src/routes/create-qrcode-avatar.js';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('tryDecodeProfileAvatarDataUrl', () => {
  it('decodes a minimal valid PNG data URL', () => {
    const decoded = tryDecodeProfileAvatarDataUrl(`data:image/png;base64,${PNG_1X1}`);
    expect(decoded).not.toBeNull();
    expect(decoded!.contentType).toBe('image/png');
    expect(decoded!.fileExt).toBe('png');
    expect(decoded!.buffer[0]).toBe(0x89);
  });

  it('rejects invalid base64 payload', () => {
    expect(tryDecodeProfileAvatarDataUrl('data:image/png;base64,!!!')).toBeNull();
  });

  it('rejects non-image magic bytes', () => {
    const html = Buffer.from('<html></html>').toString('base64');
    expect(tryDecodeProfileAvatarDataUrl(`data:image/png;base64,${html}`)).toBeNull();
  });

  it('rejects wrong mime vs bytes (jpeg declared, png bytes)', () => {
    expect(tryDecodeProfileAvatarDataUrl(`data:image/jpeg;base64,${PNG_1X1}`)).toBeNull();
  });

  it('rejects oversize string', () => {
    expect(
      tryDecodeProfileAvatarDataUrl(`data:image/png;base64,${'a'.repeat(600_000)}`)
    ).toBeNull();
  });
});

describe('buildQrAvatarObjectPath', () => {
  it('includes user, slug and extension', () => {
    const p = buildQrAvatarObjectPath('user-1', 'abc123xyz', 'png');
    expect(p).toMatch(/^profiles\/user-1\/abc123xyz-[0-9a-f-]{36}\.png$/);
  });
});
