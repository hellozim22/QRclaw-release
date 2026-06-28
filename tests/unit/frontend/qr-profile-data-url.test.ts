import { describe, it, expect } from 'vitest';
import { needsClientGeneratedQr, buildProfileQrDataUrl } from '@/lib/qr-profile-data-url';
import { CREATE_QR_TRANSPARENT_PIXEL_GIF } from '@/lib/create-qrcode-display';

describe('needsClientGeneratedQr', () => {
  it('true for empty or transparent placeholder', () => {
    expect(needsClientGeneratedQr('')).toBe(true);
    expect(needsClientGeneratedQr(CREATE_QR_TRANSPARENT_PIXEL_GIF)).toBe(true);
  });

  it('false for real URL or data URL', () => {
    expect(needsClientGeneratedQr('https://x/q.png')).toBe(false);
    expect(needsClientGeneratedQr('data:image/png;base64,xx')).toBe(false);
  });
});

describe('buildProfileQrDataUrl', () => {
  it('returns PNG data URL for https profile link', async () => {
    const url = await buildProfileQrDataUrl('https://app.example/q/abc', false);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(url.length).toBeGreaterThan(100);
  });

  it('returns placeholder for empty input', async () => {
    const url = await buildProfileQrDataUrl('  ', false);
    expect(url).toBe(CREATE_QR_TRANSPARENT_PIXEL_GIF);
  });
});
