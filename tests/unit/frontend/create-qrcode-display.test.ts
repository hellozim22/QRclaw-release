import { describe, it, expect } from 'vitest';
import {
  resolveCreateQrDisplayUrls,
  CREATE_QR_TRANSPARENT_PIXEL_GIF,
} from '@/lib/create-qrcode-display';

describe('resolveCreateQrDisplayUrls', () => {
  const slug = 'my-qr-slug';

  it('uses API profile_url and qr_image_url when both are non-empty strings', () => {
    const { profileUrl, qrImageUrl } = resolveCreateQrDisplayUrls(
      {
        slug,
        profile_url: 'https://cdn.example/p',
        qr_image_url: 'https://cdn.example/q.png',
      },
      'https://app.example'
    );

    expect(profileUrl).toBe('https://cdn.example/p');
    expect(qrImageUrl).toBe('https://cdn.example/q.png');
  });

  it('falls back profile to origin + /q/slug when profile_url is empty', () => {
    const { profileUrl, qrImageUrl } = resolveCreateQrDisplayUrls(
      {
        slug,
        profile_url: '',
        qr_image_url: 'https://cdn.example/q.png',
      },
      'https://app.example'
    );

    expect(profileUrl).toBe('https://app.example/q/my-qr-slug');
    expect(qrImageUrl).toBe('https://cdn.example/q.png');
  });

  it('falls back profile to /q/slug when origin is empty (SSR-safe)', () => {
    const { profileUrl } = resolveCreateQrDisplayUrls(
      {
        slug,
        profile_url: undefined,
        qr_image_url: 'x',
      },
      ''
    );

    expect(profileUrl).toBe('/q/my-qr-slug');
  });

  it('falls back qr_image_url to 1x1 transparent GIF when missing or empty', () => {
    const a = resolveCreateQrDisplayUrls(
      { slug, profile_url: 'https://p', qr_image_url: '' },
      'https://a'
    );
    expect(a.qrImageUrl).toBe(CREATE_QR_TRANSPARENT_PIXEL_GIF);

    const b = resolveCreateQrDisplayUrls({ slug, profile_url: 'https://p' }, 'https://a');
    expect(b.qrImageUrl).toBe(CREATE_QR_TRANSPARENT_PIXEL_GIF);
  });

  it('trims trailing slashes from origin in profile fallback', () => {
    const { profileUrl } = resolveCreateQrDisplayUrls(
      { slug, profile_url: null, qr_image_url: 'u' },
      'https://app.example///'
    );

    expect(profileUrl).toBe('https://app.example/q/my-qr-slug');
  });
});
