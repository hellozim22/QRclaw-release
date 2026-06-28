import { describe, it, expect } from 'vitest';
import {
  getQrProfileDisplayName,
  getQrProfileGreeting,
  getQrProfileScanCount,
  getQrProfileConversationCount,
  getQrProfileImageUrl,
  getQrProfilePublicUrl,
} from '@/lib/qrcode-profile-display';
import type { QRCode } from '@/hooks/useQRCodes';

const base: QRCode = {
  id: '1',
  agent_id: 'a',
  slug: 'my-slug',
  status: 'active',
  profile: {},
  config_version: 1,
  created_at: '2026-03-15T12:00:00.000Z',
  agents: { name: 'Agent Name' },
};

describe('qrcode-profile-display', () => {
  it('prefers profile.name over agent name', () => {
    expect(
      getQrProfileDisplayName({
        ...base,
        profile: { name: '  Display  ' },
      })
    ).toBe('Display');
  });

  it('falls back to agent then slug', () => {
    expect(getQrProfileDisplayName({ ...base, profile: {}, agents: { name: 'A' } })).toBe('A');
    expect(getQrProfileDisplayName({ ...base, profile: {}, agents: null })).toBe('my-slug');
  });

  it('reads greeting and counts from profile', () => {
    expect(getQrProfileGreeting({ ...base, profile: { greeting: 'Hi' } })).toBe('Hi');
    expect(getQrProfileScanCount({ ...base, profile: { scan_count: 12 } })).toBe(12);
    expect(getQrProfileConversationCount({ ...base, profile: { conversation_count: 3 } })).toBe(3);
  });

  it('resolves public URL via resolveCreateQrDisplayUrls', () => {
    expect(getQrProfilePublicUrl(base, 'https://app.example')).toBe(
      'https://app.example/q/my-slug'
    );
    expect(
      getQrProfilePublicUrl(
        { ...base, profile: { profile_url: 'https://x/y' } },
        'https://app.example'
      )
    ).toBe('https://x/y');
  });

  it('returns qr_image_url when set', () => {
    expect(getQrProfileImageUrl({ ...base, profile: { qr_image_url: 'https://q.png' } })).toBe(
      'https://q.png'
    );
    expect(getQrProfileImageUrl(base)).toBeUndefined();
  });
});
